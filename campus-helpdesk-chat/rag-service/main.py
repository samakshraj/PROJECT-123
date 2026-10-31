from __future__ import annotations

import os
import json
import hashlib
import secrets
import sqlite3
import threading
import uuid
from io import BytesIO
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Header, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from groq import Groq
from langchain_chroma import Chroma
from langchain_core.documents import Document
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter
from pydantic import BaseModel, Field
from pypdf import PdfReader
import firebase_admin
from firebase_admin import auth as firebase_auth, credentials

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

pdf_dir_value = os.getenv("RAG_PDF_DIR")
PDF_DIR = Path(pdf_dir_value).expanduser() if pdf_dir_value else Path.home() / "OneDrive" / "Desktop" / "PROJECT 1" / "IIT KHARAGPUR PDFS"
if not PDF_DIR.is_absolute():
    PDF_DIR = ROOT / PDF_DIR
persist_dir_value = Path(os.getenv("RAG_CHROMA_DIR", str(ROOT / "chroma_db"))).expanduser()
PERSIST_DIR = persist_dir_value if persist_dir_value.is_absolute() else ROOT / persist_dir_value
COLLECTION = "campus_helpdesk"
FALLBACK_ANSWER = (
    "Unfortunately, I don't have the specific information regarding your query in my database. "
    "Please contact the respective department or email the college administration for further details."
)

app = FastAPI(title="Campus Helpdesk RAG API", version="1.0.0")
origins = [item.strip() for item in os.getenv("RAG_CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173,http://localhost:8080,http://127.0.0.1:8080").split(",") if item.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)

database_path_value = os.getenv("SQLITE_DATABASE_PATH")
DATABASE_PATH = Path(database_path_value).expanduser() if database_path_value else ROOT / "data" / "campus_helpdesk.sqlite3"
if not DATABASE_PATH.is_absolute():
    DATABASE_PATH = ROOT / DATABASE_PATH

SCHEMA = """
CREATE TABLE IF NOT EXISTS profiles (
    id TEXT PRIMARY KEY,
    firebase_uid TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL DEFAULT '',
    full_name TEXT NOT NULL DEFAULT '',
    student_id TEXT NOT NULL DEFAULT '',
    department TEXT NOT NULL DEFAULT '',
    course TEXT NOT NULL DEFAULT '',
    year TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS managed_admins (
    uid TEXT PRIMARY KEY,
    email TEXT NOT NULL DEFAULT '',
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tickets (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    student_email TEXT NOT NULL DEFAULT '',
    student_name TEXT NOT NULL DEFAULT '',
    kind TEXT NOT NULL CHECK (kind IN ('Complaint', 'Request')),
    subject TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'General',
    description TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Open' CHECK (status IN ('Open', 'In progress', 'Resolved')),
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS tickets_owner_created ON tickets(user_id, created_at DESC);
CREATE TABLE IF NOT EXISTS reminders (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    due_at TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS reminders_owner_due ON reminders(user_id, due_at);
CREATE TABLE IF NOT EXISTS notices (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'General',
    pinned INTEGER NOT NULL DEFAULT 0,
    published_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS notices_published ON notices(pinned DESC, published_at DESC);
CREATE TABLE IF NOT EXISTS chat_history (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    created_at TEXT NOT NULL,
    session_id TEXT NOT NULL DEFAULT 'legacy'
);
CREATE INDEX IF NOT EXISTS chat_history_owner_created ON chat_history(user_id, created_at DESC);
CREATE TABLE IF NOT EXISTS auth_handoffs (
    digest TEXT PRIMARY KEY,
    uid TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('student', 'admin')),
    expires_at REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS auth_handoffs_expiry ON auth_handoffs(expires_at);
CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    content_type TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    file_data BLOB NOT NULL,
    uploaded_by TEXT NOT NULL,
    uploaded_at TEXT NOT NULL,
    index_status TEXT NOT NULL DEFAULT 'stored',
    index_error TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS documents_uploaded_at ON documents(uploaded_at DESC);
"""

def ensure_firebase_admin():
    try:
        firebase_admin.get_app()
    except ValueError:
        service_account = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON")
        credential = credentials.Certificate(json.loads(service_account)) if service_account else credentials.ApplicationDefault()
        firebase_admin.initialize_app(credential)

def database():
    connection = None
    try:
        DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)
        connection = sqlite3.connect(DATABASE_PATH, timeout=10, check_same_thread=False)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("PRAGMA busy_timeout = 10000")
        connection.executescript(SCHEMA)
        ensure_document_columns(connection)
        ensure_chat_history_columns(connection)
        yield connection
    except sqlite3.Error as exc:
        raise HTTPException(status_code=503, detail="Could not open the SQLite database. Check SQLITE_DATABASE_PATH and file permissions.") from exc
    finally:
        if connection is not None:
            connection.close()

def ensure_document_columns(connection: sqlite3.Connection) -> None:
    columns = {row[1] for row in connection.execute("PRAGMA table_info(documents)").fetchall()}
    if "index_status" not in columns:
        connection.execute("ALTER TABLE documents ADD COLUMN index_status TEXT NOT NULL DEFAULT 'stored'")
    if "index_error" not in columns:
        connection.execute("ALTER TABLE documents ADD COLUMN index_error TEXT NOT NULL DEFAULT ''")

def ensure_chat_history_columns(connection: sqlite3.Connection) -> None:
    columns = {row[1] for row in connection.execute("PRAGMA table_info(chat_history)").fetchall()}
    if "session_id" not in columns:
        connection.execute("ALTER TABLE chat_history ADD COLUMN session_id TEXT NOT NULL DEFAULT 'legacy'")
    connection.execute("CREATE INDEX IF NOT EXISTS chat_history_owner_session ON chat_history(user_id, session_id, created_at)")

def current_user(authorization: str | None = Header(default=None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Sign in required")
    try:
        ensure_firebase_admin()
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Firebase Admin credentials are not configured for the API.") from exc
    try:
        return firebase_auth.verify_id_token(authorization[7:])
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Invalid Firebase token") from exc

def is_admin(uid: str, db: sqlite3.Connection) -> bool:
    admins = {item.strip() for item in os.getenv("ADMIN_UIDS", "").split(",") if item.strip()}
    if uid in admins:
        return True
    return db.execute("SELECT 1 FROM managed_admins WHERE uid = ?", (uid,)).fetchone() is not None

def admin_user(user=Depends(current_user), db=Depends(database)):
    if not is_admin(user["uid"], db):
        raise HTTPException(status_code=403, detail="Administrator access required")
    return user

def serialize(row, boolean_fields=()):
    result = dict(row)
    for field in boolean_fields:
        if field in result:
            result[field] = bool(result[field])
    return result

def new_id():
    return uuid.uuid4().hex

def timestamp():
    return datetime.now(timezone.utc).isoformat()

class TicketInput(BaseModel):
    kind: str = Field(pattern="^(Complaint|Request)$")
    subject: str = Field(min_length=1, max_length=160)
    category: str = Field(default="General", max_length=80)
    description: str = Field(min_length=1, max_length=5000)

class ProfileInput(BaseModel):
    full_name: str = Field(default="", max_length=120)
    student_id: str = Field(default="", max_length=120)
    department: str = Field(default="", max_length=120)
    course: str = Field(default="", max_length=120)
    year: str = Field(default="", max_length=120)
    phone: str = Field(default="", max_length=120)

class ReminderInput(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    due_at: str

class NoticeInput(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    body: str = Field(min_length=1, max_length=10000)
    category: str = Field(default="General", max_length=80)
    pinned: bool = False

class ChatHistoryInput(BaseModel):
    session_id: str = Field(default="legacy", min_length=1, max_length=80)
    question: str = Field(min_length=1, max_length=2000)
    answer: str = Field(min_length=1, max_length=5000)

class AuthHandoffRequest(BaseModel):
    code: str = Field(min_length=40, max_length=80)

class ManagedUserInput(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    full_name: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=8, max_length=128)

class ManagedAdminInput(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str | None = Field(default=None, min_length=8, max_length=128)

class PasswordResetInput(BaseModel):
    password: str = Field(min_length=8, max_length=128)

@app.post("/auth/handoff")
def create_auth_handoff(user=Depends(current_user), db=Depends(database)):
    code = secrets.token_urlsafe(32)
    digest = hashlib.sha256(code.encode("utf-8")).hexdigest()
    role = "admin" if is_admin(user["uid"], db) else "student"
    db.execute(
        "INSERT INTO auth_handoffs (digest, uid, role, expires_at) VALUES (?, ?, ?, ?)",
        (digest, user["uid"], role, datetime.now(timezone.utc).timestamp() + 90),
    )
    db.commit()
    return {"code": code, "role": role}

@app.post("/auth/redeem")
def redeem_auth_handoff(payload: AuthHandoffRequest, db=Depends(database)):
    digest = hashlib.sha256(payload.code.encode("utf-8")).hexdigest()
    db.execute("BEGIN IMMEDIATE")
    record = db.execute(
        "SELECT uid, role FROM auth_handoffs WHERE digest = ? AND expires_at > ?",
        (digest, datetime.now(timezone.utc).timestamp()),
    ).fetchone()
    if record:
        db.execute("DELETE FROM auth_handoffs WHERE digest = ?", (digest,))
    db.commit()
    if not record:
        raise HTTPException(status_code=401, detail="Sign-in link expired or already used. Please sign in again.")
    ensure_firebase_admin()
    claims = {"role": record["role"]}
    custom_token = firebase_auth.create_custom_token(record["uid"], claims).decode("utf-8")
    return {"customToken": custom_token, "role": record["role"]}

@app.post("/chat-history")
def save_chat_history(payload: ChatHistoryInput, user=Depends(current_user), db=Depends(database)):
    record_id = new_id()
    db.execute(
        "INSERT INTO chat_history (id, user_id, question, answer, created_at, session_id) VALUES (?, ?, ?, ?, ?, ?)",
        (record_id, user["uid"], payload.question, payload.answer, timestamp(), payload.session_id),
    )
    db.commit()
    return {"id": record_id, "ok": True}

@app.get("/chat-history")
def get_chat_history(user=Depends(current_user), db=Depends(database)):
    history = db.execute(
        "SELECT * FROM chat_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 30",
        (user["uid"],),
    ).fetchall()
    return [serialize(item) for item in reversed(history)]

@app.get("/chat-sessions")
def list_chat_sessions(user=Depends(current_user), db=Depends(database)):
    rows = db.execute(
        "SELECT session_id, MIN(created_at) AS started_at, MAX(created_at) AS updated_at, COUNT(*) AS message_count "
        "FROM chat_history WHERE user_id = ? GROUP BY session_id ORDER BY updated_at DESC LIMIT 100",
        (user["uid"],),
    ).fetchall()
    sessions = []
    for row in rows:
        first = db.execute(
            "SELECT question FROM chat_history WHERE user_id = ? AND session_id = ? ORDER BY created_at ASC LIMIT 1",
            (user["uid"], row["session_id"]),
        ).fetchone()
        sessions.append({**serialize(row), "title": first["question"] if first else "Chat session"})
    return sessions

@app.get("/chat-sessions/{session_id}")
def get_chat_session(session_id: str, user=Depends(current_user), db=Depends(database)):
    rows = db.execute(
        "SELECT question, answer, created_at FROM chat_history WHERE user_id = ? AND session_id = ? ORDER BY created_at ASC",
        (user["uid"], session_id),
    ).fetchall()
    return [serialize(item) for item in rows]

@app.delete("/chat-sessions/{session_id}")
def delete_chat_session(session_id: str, user=Depends(current_user), db=Depends(database)):
    db.execute("DELETE FROM chat_history WHERE user_id = ? AND session_id = ?", (user["uid"], session_id))
    db.commit()
    return {"ok": True}

@app.delete("/chat-sessions")
def clear_chat_sessions(user=Depends(current_user), db=Depends(database)):
    db.execute("DELETE FROM chat_history WHERE user_id = ?", (user["uid"],))
    db.commit()
    return {"ok": True}

@app.get("/profile")
def get_profile(user=Depends(current_user), db=Depends(database)):
    db.execute(
        "INSERT INTO profiles (id, firebase_uid, email, full_name) VALUES (?, ?, ?, ?) "
        "ON CONFLICT(firebase_uid) DO NOTHING",
        (new_id(), user["uid"], user.get("email", ""), user.get("name", "")),
    )
    db.commit()
    profile = db.execute("SELECT * FROM profiles WHERE firebase_uid = ?", (user["uid"],)).fetchone()
    return serialize(profile)

@app.put("/profile")
def update_profile(payload: ProfileInput, user=Depends(current_user), db=Depends(database)):
    db.execute(
        "INSERT INTO profiles (id, firebase_uid, email, full_name, student_id, department, course, year, phone) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) "
        "ON CONFLICT(firebase_uid) DO UPDATE SET full_name=excluded.full_name, student_id=excluded.student_id, "
        "department=excluded.department, course=excluded.course, year=excluded.year, phone=excluded.phone",
        (new_id(), user["uid"], user.get("email", ""), payload.full_name, payload.student_id,
         payload.department, payload.course, payload.year, payload.phone),
    )
    db.commit()
    return serialize(db.execute("SELECT * FROM profiles WHERE firebase_uid = ?", (user["uid"],)).fetchone())

@app.post("/account/password")
def update_own_password(payload: PasswordResetInput, user=Depends(current_user)):
    ensure_firebase_admin()
    try:
        firebase_auth.update_user(user["uid"], password=payload.password)
        firebase_auth.revoke_refresh_tokens(user["uid"])
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Could not update password: {exc}") from exc
    return {"ok": True}

@app.get("/admin/users")
def list_managed_users(_=Depends(admin_user), db=Depends(database)):
    rows = db.execute(
        "SELECT firebase_uid AS uid, email, full_name, student_id FROM profiles ORDER BY lower(full_name), lower(email)"
    ).fetchall()
    return [
        {**serialize(row), "role": "admin" if is_admin(row["uid"], db) else "student"}
        for row in rows
    ]

@app.post("/admin/students", status_code=201)
def create_student(payload: ManagedUserInput, user=Depends(admin_user), db=Depends(database)):
    ensure_firebase_admin()
    try:
        account = firebase_auth.create_user(
            email=payload.email.strip(), password=payload.password, display_name=payload.full_name.strip()
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Could not create student account: {exc}") from exc
    try:
        db.execute(
            "INSERT INTO profiles (id, firebase_uid, email, full_name) VALUES (?, ?, ?, ?)",
            (new_id(), account.uid, account.email or payload.email.strip(), payload.full_name.strip()),
        )
        db.commit()
    except Exception:
        firebase_auth.delete_user(account.uid)
        raise
    return {"uid": account.uid, "email": account.email, "full_name": account.display_name or payload.full_name, "role": "student"}

@app.post("/admin/admins", status_code=201)
def create_admin(payload: ManagedAdminInput, user=Depends(admin_user), db=Depends(database)):
    ensure_firebase_admin()
    email = payload.email.strip()
    try:
        account = firebase_auth.get_user_by_email(email)
    except Exception as exc:
        if exc.__class__.__name__ != "UserNotFoundError":
            raise HTTPException(status_code=400, detail=f"Could not look up account: {exc}") from exc
        if not payload.password:
            raise HTTPException(status_code=400, detail="A password of at least 8 characters is required for a new admin account.")
        try:
            account = firebase_auth.create_user(email=email, password=payload.password)
        except Exception as create_exc:
            raise HTTPException(status_code=400, detail=f"Could not create admin account: {create_exc}") from create_exc
    db.execute(
        "INSERT INTO managed_admins (uid, email, created_by, created_at) VALUES (?, ?, ?, ?) "
        "ON CONFLICT(uid) DO UPDATE SET email=excluded.email",
        (account.uid, account.email or email, user["uid"], timestamp()),
    )
    db.execute(
        "INSERT INTO profiles (id, firebase_uid, email, full_name) VALUES (?, ?, ?, ?) "
        "ON CONFLICT(firebase_uid) DO UPDATE SET email=excluded.email",
        (new_id(), account.uid, account.email or email, account.display_name or ""),
    )
    db.commit()
    return {"uid": account.uid, "email": account.email or email, "full_name": account.display_name or "", "role": "admin"}

@app.post("/admin/users/{uid}/password")
def reset_user_password(uid: str, payload: PasswordResetInput, _=Depends(admin_user)):
    ensure_firebase_admin()
    try:
        firebase_auth.update_user(uid, password=payload.password)
        firebase_auth.revoke_refresh_tokens(uid)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Could not reset password: {exc}") from exc
    return {"ok": True}

@app.delete("/admin/students/{uid}")
def remove_student(uid: str, _=Depends(admin_user), db=Depends(database)):
    if is_admin(uid, db):
        raise HTTPException(status_code=409, detail="Administrator accounts cannot be removed as students.")
    ensure_firebase_admin()
    try:
        firebase_auth.delete_user(uid)
    except Exception as exc:
        if exc.__class__.__name__ != "UserNotFoundError":
            raise HTTPException(status_code=400, detail=f"Could not remove student account: {exc}") from exc
    for table in ("profiles", "reminders", "chat_history", "auth_handoffs"):
        column = "firebase_uid" if table == "profiles" else "uid" if table == "auth_handoffs" else "user_id"
        db.execute(f"DELETE FROM {table} WHERE {column} = ?", (uid,))
    db.commit()
    return {"ok": True}

@app.get("/notices")
def list_notices(db=Depends(database)):
    rows = db.execute("SELECT * FROM notices ORDER BY pinned DESC, published_at DESC").fetchall()
    return [serialize(item, ("pinned",)) for item in rows]

@app.post("/notices")
def create_notice(payload: NoticeInput, _=Depends(admin_user), db=Depends(database)):
    notice_id = new_id()
    db.execute(
        "INSERT INTO notices (id, title, body, category, pinned, published_at) VALUES (?, ?, ?, ?, ?, ?)",
        (notice_id, payload.title, payload.body, payload.category, int(payload.pinned), timestamp()),
    )
    db.commit()
    return serialize(db.execute("SELECT * FROM notices WHERE id = ?", (notice_id,)).fetchone(), ("pinned",))

@app.patch("/notices/{notice_id}")
def change_notice(notice_id: str, payload: dict, _=Depends(admin_user), db=Depends(database)):
    allowed = {"pinned", "title", "body", "category"}
    changes = {key: value for key, value in payload.items() if key in allowed}
    if "pinned" in changes:
        changes["pinned"] = int(bool(changes["pinned"]))
    if changes:
        assignments = ", ".join(f"{key} = ?" for key in changes)
        db.execute(f"UPDATE notices SET {assignments} WHERE id = ?", (*changes.values(), notice_id))
        db.commit()
    item = db.execute("SELECT * FROM notices WHERE id = ?", (notice_id,)).fetchone()
    if not item: raise HTTPException(404, "Notice not found")
    return serialize(item, ("pinned",))

@app.delete("/notices/{notice_id}")
def delete_notice(notice_id: str, _=Depends(admin_user), db=Depends(database)):
    result = db.execute("DELETE FROM notices WHERE id = ?", (notice_id,))
    db.commit()
    if result.rowcount == 0:
        raise HTTPException(404, "Notice not found")
    return {"ok": True}

@app.get("/tickets")
def list_tickets(user=Depends(current_user), db=Depends(database)):
    rows = db.execute("SELECT * FROM tickets WHERE user_id = ? ORDER BY created_at DESC", (user["uid"],)).fetchall()
    return [serialize(item) for item in rows]

@app.post("/tickets")
def create_ticket(payload: TicketInput, user=Depends(current_user), db=Depends(database)):
    ticket_id = new_id()
    db.execute(
        "INSERT INTO tickets (id, user_id, student_email, student_name, kind, subject, category, description, status, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Open', ?)",
        (ticket_id, user["uid"], user.get("email", ""), user.get("name", ""), payload.kind,
         payload.subject, payload.category, payload.description, timestamp()),
    )
    db.commit()
    return serialize(db.execute("SELECT * FROM tickets WHERE id = ?", (ticket_id,)).fetchone())

@app.get("/admin/tickets")
def admin_list_tickets(_=Depends(admin_user), db=Depends(database)):
    return [serialize(item) for item in db.execute("SELECT * FROM tickets ORDER BY created_at DESC").fetchall()]

@app.get("/admin/overview")
def admin_overview(_=Depends(admin_user), db=Depends(database)):
    return {
        "active_notices": db.execute("SELECT COUNT(*) FROM notices").fetchone()[0],
        "open_tickets": db.execute("SELECT COUNT(*) FROM tickets WHERE status = 'Open'").fetchone()[0],
        "students": db.execute("SELECT COUNT(*) FROM profiles").fetchone()[0],
        "recent_tickets": [serialize(item) for item in db.execute("SELECT * FROM tickets ORDER BY created_at DESC LIMIT 5").fetchall()],
    }

MAX_DOCUMENT_SIZE = 25 * 1024 * 1024
ALLOWED_DOCUMENT_EXTENSIONS = {".pdf", ".doc", ".docx"}

@app.get("/admin/documents")
def admin_list_documents(_=Depends(admin_user), db=Depends(database)):
    rows = db.execute(
        "SELECT id, filename, content_type, file_size, uploaded_at, index_status, index_error "
        "FROM documents ORDER BY uploaded_at DESC"
    ).fetchall()
    return [serialize(row) for row in rows]

@app.post("/admin/documents")
async def admin_upload_document(
    request: Request,
    filename: str,
    user=Depends(admin_user),
    db=Depends(database),
):
    filename = filename.replace("\\", "/").rsplit("/", 1)[-1].strip()
    extension = Path(filename).suffix.lower()
    if not filename or extension not in ALLOWED_DOCUMENT_EXTENSIONS:
        raise HTTPException(422, "Only PDF, DOC, and DOCX files are supported.")
    declared_size = request.headers.get("content-length")
    if declared_size:
        try:
            if int(declared_size) > MAX_DOCUMENT_SIZE:
                raise HTTPException(413, "Documents must be 25 MB or smaller.")
        except ValueError as exc:
            raise HTTPException(400, "Invalid Content-Length header.") from exc
    content_parts = []
    total_size = 0
    async for chunk in request.stream():
        total_size += len(chunk)
        if total_size > MAX_DOCUMENT_SIZE:
            raise HTTPException(413, "Documents must be 25 MB or smaller.")
        content_parts.append(chunk)
    content = b"".join(content_parts)
    if not content:
        raise HTTPException(422, "The selected document is empty.")

    document_id = new_id()
    uploaded_at = timestamp()
    content_type = request.headers.get("content-type", "application/octet-stream")
    db.execute(
        "INSERT INTO documents (id, filename, content_type, file_size, file_data, uploaded_by, uploaded_at, index_status) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (document_id, filename, content_type, len(content), content, user["uid"], uploaded_at,
         "processing" if extension == ".pdf" else "stored"),
    )
    db.commit()
    if extension == ".pdf":
        schedule_knowledge_base_rebuild()
    return {
        "id": document_id,
        "filename": filename,
        "content_type": content_type,
        "file_size": len(content),
        "uploaded_at": uploaded_at,
        "index_status": "processing" if extension == ".pdf" else "stored",
        "index_error": "",
    }

@app.delete("/admin/documents/{document_id}")
def admin_delete_document(document_id: str, _=Depends(admin_user), db=Depends(database)):
    existing = db.execute("SELECT filename FROM documents WHERE id = ?", (document_id,)).fetchone()
    if not existing:
        raise HTTPException(404, "Document not found")
    result = db.execute("DELETE FROM documents WHERE id = ?", (document_id,))
    db.commit()
    if result.rowcount == 0:
        raise HTTPException(404, "Document not found")
    if Path(existing["filename"]).suffix.lower() == ".pdf":
        schedule_knowledge_base_rebuild()
    return {"ok": True}

@app.patch("/admin/tickets/{ticket_id}")
def admin_update_ticket(ticket_id: str, payload: dict, _=Depends(admin_user), db=Depends(database)):
    status = payload.get("status")
    if status not in {"Open", "In progress", "Resolved"}: raise HTTPException(422, "Invalid ticket status")
    db.execute("UPDATE tickets SET status = ? WHERE id = ?", (status, ticket_id))
    db.commit()
    item = db.execute("SELECT * FROM tickets WHERE id = ?", (ticket_id,)).fetchone()
    if not item: raise HTTPException(404, "Ticket not found")
    return serialize(item)

@app.get("/reminders")
def list_reminders(user=Depends(current_user), db=Depends(database)):
    rows = db.execute("SELECT * FROM reminders WHERE user_id = ? ORDER BY due_at", (user["uid"],)).fetchall()
    return [serialize(item, ("completed",)) for item in rows]

@app.post("/reminders")
def create_reminder(payload: ReminderInput, user=Depends(current_user), db=Depends(database)):
    reminder_id = new_id()
    db.execute(
        "INSERT INTO reminders (id, user_id, title, due_at, completed, created_at) VALUES (?, ?, ?, ?, 0, ?)",
        (reminder_id, user["uid"], payload.title, payload.due_at, timestamp()),
    )
    db.commit()
    return serialize(db.execute("SELECT * FROM reminders WHERE id = ?", (reminder_id,)).fetchone(), ("completed",))

@app.patch("/reminders/{reminder_id}")
def update_reminder(reminder_id: str, payload: dict, user=Depends(current_user), db=Depends(database)):
    changes = {key: value for key, value in payload.items() if key in {"completed"}}
    if not changes:
        raise HTTPException(422, "No valid reminder fields supplied")
    result = db.execute("UPDATE reminders SET completed = ? WHERE id = ? AND user_id = ?", (int(bool(changes["completed"])), reminder_id, user["uid"]))
    db.commit()
    if result.rowcount == 0: raise HTTPException(404, "Reminder not found")
    return {"ok": True}

@app.delete("/reminders/{reminder_id}")
def delete_reminder(reminder_id: str, user=Depends(current_user), db=Depends(database)):
    result = db.execute("DELETE FROM reminders WHERE id = ? AND user_id = ?", (reminder_id, user["uid"]))
    db.commit()
    if result.rowcount == 0:
        raise HTTPException(404, "Reminder not found")
    return {"ok": True}

class ChatRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2000)

class ChatResponse(BaseModel):
    answer: str

vector_db: Chroma | None = None
startup_error: str | None = None
indexing = False
knowledge_lock = threading.RLock()
rebuild_schedule_lock = threading.Lock()
rebuild_requested = False
rebuild_thread: threading.Thread | None = None


def load_uploaded_pdfs() -> list[sqlite3.Row]:
    DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DATABASE_PATH, timeout=10)
    connection.row_factory = sqlite3.Row
    try:
        connection.execute("PRAGMA busy_timeout = 10000")
        connection.executescript(SCHEMA)
        ensure_document_columns(connection)
        return connection.execute(
            "SELECT id, filename, file_data FROM documents "
            "WHERE lower(filename) LIKE '%.pdf' ORDER BY uploaded_at"
        ).fetchall()
    finally:
        connection.close()


def set_uploaded_pdf_statuses(status: str, error: str = "") -> None:
    DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DATABASE_PATH, timeout=10)
    try:
        connection.execute("PRAGMA busy_timeout = 10000")
        connection.executescript(SCHEMA)
        ensure_document_columns(connection)
        connection.execute(
            "UPDATE documents SET index_status = ?, index_error = '' WHERE lower(filename) LIKE '%.pdf'",
            (status,),
        )
        if error:
            connection.execute(
                "UPDATE documents SET index_error = ? WHERE lower(filename) LIKE '%.pdf'",
                (error[:1000],),
            )
        connection.commit()
    finally:
        connection.close()


def save_uploaded_pdf_index_results(results: dict[str, tuple[str, str]]) -> None:
    if not results:
        return
    DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DATABASE_PATH, timeout=10)
    try:
        connection.execute("PRAGMA busy_timeout = 10000")
        connection.executescript(SCHEMA)
        ensure_document_columns(connection)
        connection.executemany(
            "UPDATE documents SET index_status = ?, index_error = ? WHERE id = ?",
            [(status, error[:1000], document_id) for document_id, (status, error) in results.items()],
        )
        connection.commit()
    finally:
        connection.close()


def append_pdf_pages(reader: PdfReader, filename: str, documents: list[Document], document_id: str | None = None) -> None:
    found_text = False
    for page_number, page in enumerate(reader.pages, start=1):
        text = (page.extract_text() or "").strip()
        if not text:
            continue
        found_text = True
        metadata: dict[str, str | int] = {"source": filename, "page": page_number}
        if document_id:
            metadata["document_id"] = document_id
        documents.append(Document(page_content=text, metadata=metadata))
    if not found_text:
        raise ValueError("No text could be extracted. Scanned PDFs need OCR before they can be searched.")


def build_vector_db() -> tuple[Chroma, dict[str, tuple[str, str]]]:
    documents: list[Document] = []
    uploaded_results: dict[str, tuple[str, str]] = {}

    if PDF_DIR.is_dir():
        for pdf_path in sorted(PDF_DIR.glob("*.pdf")):
            try:
                append_pdf_pages(PdfReader(str(pdf_path)), pdf_path.name, documents)
            except Exception as exc:
                print(f"Skipping campus PDF {pdf_path.name}: {exc}")

    for record in load_uploaded_pdfs():
        document_id = record["id"]
        try:
            append_pdf_pages(PdfReader(BytesIO(record["file_data"])), record["filename"], documents, document_id)
            uploaded_results[document_id] = ("indexed", "")
        except Exception as exc:
            uploaded_results[document_id] = ("error", str(exc))

    splitter = RecursiveCharacterTextSplitter(chunk_size=900, chunk_overlap=150)
    chunks = splitter.split_documents(documents)
    for chunk_id, chunk in enumerate(chunks):
        chunk.metadata["chunk_id"] = chunk_id

    embeddings = HuggingFaceEmbeddings(
        model_name="sentence-transformers/all-MiniLM-L6-v2",
        model_kwargs={"device": "cpu"},
        encode_kwargs={"normalize_embeddings": True},
    )
    texts = [chunk.page_content for chunk in chunks]
    vectors = embeddings.embed_documents(texts) if texts else []
    metadatas = [chunk.metadata for chunk in chunks]
    ids = [uuid.uuid4().hex for _ in chunks]
    db = Chroma(
        collection_name=COLLECTION,
        embedding_function=embeddings,
        persist_directory=str(PERSIST_DIR),
    )
    with knowledge_lock:
        existing_ids = db.get().get("ids", [])
        if existing_ids:
            db.delete(ids=existing_ids)
        if texts:
            db._collection.add(ids=ids, documents=texts, metadatas=metadatas, embeddings=vectors)
    return db, uploaded_results


@app.on_event("startup")
def initialize_knowledge_base() -> None:
    """Build the document index without blocking authentication and ticket APIs."""
    global startup_error
    startup_error = "The campus knowledge base is loading."
    schedule_knowledge_base_rebuild()


def rebuild_knowledge_base_worker() -> None:
    global vector_db, startup_error, indexing, rebuild_thread, rebuild_requested
    while True:
        with rebuild_schedule_lock:
            rebuild_requested = False
        indexing = True
        if vector_db is None:
            startup_error = "The campus knowledge base is loading."
        try:
            set_uploaded_pdf_statuses("processing")
            new_db, uploaded_results = build_vector_db()
            with knowledge_lock:
                vector_db = new_db
            save_uploaded_pdf_index_results(uploaded_results)
            startup_error = None
            print(f"Campus knowledge base ready: {PDF_DIR} and uploaded PDFs")
        except Exception as exc:
            startup_error = str(exc)
            set_uploaded_pdf_statuses("error", startup_error)
            print(f"Campus knowledge base unavailable: {startup_error}")

        with rebuild_schedule_lock:
            if rebuild_requested:
                continue
            indexing = False
            rebuild_thread = None
            return


def schedule_knowledge_base_rebuild() -> None:
    global rebuild_requested, rebuild_thread
    with rebuild_schedule_lock:
        rebuild_requested = True
        if rebuild_thread is None or not rebuild_thread.is_alive():
            rebuild_thread = threading.Thread(
                target=rebuild_knowledge_base_worker,
                name="campus-knowledge-base",
                daemon=True,
            )
            rebuild_thread.start()


@app.get("/health")
def health() -> dict[str, object]:
    with knowledge_lock:
        ready = vector_db is not None and vector_db._collection.count() > 0
    error = startup_error or (None if ready or indexing else "No searchable PDFs are indexed yet.")
    return {"ready": ready, "indexing": indexing, "error": error}


@app.post("/chat", response_model=ChatResponse)
def chat(request: ChatRequest) -> ChatResponse:
    if vector_db is None:
        raise HTTPException(status_code=503, detail=startup_error or "The campus knowledge base is not ready.")
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="GROQ_API_KEY is missing. Add it to the project .env file and restart the service.")

    with knowledge_lock:
        active_vector_db = vector_db
        if active_vector_db is None:
            raise HTTPException(status_code=503, detail=startup_error or "The campus knowledge base is not ready.")
        if active_vector_db._collection.count() == 0:
            relevant_docs = []
        else:
            retriever = active_vector_db.as_retriever(search_type="similarity", search_kwargs={"k": 5})
            relevant_docs = retriever.invoke(request.question.strip())
    context = "\n\n".join(
        f"Source: {doc.metadata.get('source', 'campus document')}, page {doc.metadata.get('page', 'unknown')}\n{doc.page_content}"
        for doc in relevant_docs
    )
    if not context.strip():
        return ChatResponse(answer=FALLBACK_ANSWER)

    client = Groq(api_key=api_key)
    try:
        completion = client.chat.completions.create(
            model=os.getenv("GROQ_MODEL", "openai/gpt-oss-20b"),
            messages=[
                {"role": "system", "content": (
                    "You are a campus helpdesk assistant. Answer using only facts explicitly present in the provided campus document context. "
                    "Do not use outside knowledge. If the context does not explicitly answer the question, return exactly this message and nothing else: "
                    f"{FALLBACK_ANSWER}"
                )},
                {"role": "user", "content": f"Context:\n{context}\n\nQuestion:\n{request.question.strip()}"},
            ],
            temperature=0.2,
            max_tokens=1024,
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail="The answer service is temporarily unavailable. Please try again.") from exc

    answer = completion.choices[0].message.content
    if not answer:
        raise HTTPException(status_code=502, detail="The answer service returned an empty response. Please try again.")
    return ChatResponse(answer=answer.strip())
