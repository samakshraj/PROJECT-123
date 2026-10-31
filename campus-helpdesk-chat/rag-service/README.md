# Campus Helpdesk API

The FastAPI service serves the RAG chatbot and the shared SQLite API used by the login page, student app, and admin panel. SQLite creates a local database file automatically; no database server or URI is needed.

## Configure

1. Set `SQLITE_DATABASE_PATH=data/campus_helpdesk.sqlite3` in `campus-helpdesk-chat/.env` (or leave the default). The file is stored under the campus app data directory and is ignored by Git.
2. Create a Firebase service account for the Firebase project used by both web apps. Set `GOOGLE_APPLICATION_CREDENTIALS` to its local JSON path, or set `FIREBASE_SERVICE_ACCOUNT_JSON` to the JSON contents. Keep this credential out of source control.
3. Add admin Firebase UIDs to `ADMIN_UIDS` as a comma-separated list. Only these accounts are sent to the admin panel and can read all tickets, update ticket status, and manage notices. If this list is empty, login routes everyone to the student dashboard.
4. Set `GROQ_API_KEY`, `RAG_PDF_DIR`, and `RAG_CHROMA_DIR` if you want the document-grounded chatbot enabled. Chroma remains the vector index; SQLite stores profiles, tickets, reminders, notices, uploaded document files, one-time login handoffs, and signed-in chat history.
5. Copy `campus-helpdesk-chat/.env.example` to `.env`; copy the examples for `react-login-page` and `Admin-Panel` to each app `.env`. The login page, student dashboard, and admin dashboard use the same `VITE_RAG_API_URL`.

Install the service requirements into the campus app Python environment with `python -m pip install -r rag-service/requirements.txt`. Then run `npm run dev` from the app you want to open: `campus-helpdesk-chat` starts the API and student dashboard (port 5174), `react-login-page` starts the API and login page (port 5173), and `Admin-Panel` starts the API and admin panel (port 5175). The launcher reuses an API already listening on port 8000. You can also run `npm run dev:full` from the campus app.

Open the apps using their printed `http://localhost:<port>` address. Firebase checks the hostname, so use `localhost` instead of `127.0.0.1` for local sign-in.

The API starts serving authentication and data requests while the campus document index builds in the background. The chatbot reports that it is loading until the index is ready.

Admin document uploads are stored as file data and metadata in the SQLite database and remain available after refresh or API restart. Uploads support PDF, DOC, and DOCX files up to 25 MB each. Uploaded PDFs are extracted, chunked, embedded, and added to the Chroma index after upload; the index is also rebuilt from saved PDFs when the API starts. DOC and DOCX files are stored but are not indexed. Scanned PDFs need OCR before their text can be searched. Removing an uploaded PDF rebuilds the index so deleted passages are removed from chatbot search.

The login API verifies the Firebase ID token and creates a random, single-use 90-second handoff code. The destination redeems it for a Firebase custom token signed by the server service account. This runs in the Python API; it does not require Firebase Cloud Functions or a Blaze upgrade. Student data endpoints are scoped to the verified Firebase UID. Admin endpoints also check that UID against `ADMIN_UIDS`.

Existing records in the former database are not copied automatically. Export/import them if you need to retain those records.
