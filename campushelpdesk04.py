from pathlib import Path
from groq import Groq
from dotenv import load_dotenv
from pypdf import PdfReader

from langchain_chroma import Chroma
from langchain_core.documents import Document
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter



# Load GROQ_API_KEY from the .env file.
load_dotenv()
client = Groq()


# Folder containing your PDFs.
folder_path = Path(
    r"C:\Users\user\OneDrive\Desktop\PROJECT 1\IIT KHARAGPUR PDFS"
)

if not folder_path.exists():
    raise FileNotFoundError(f"PDF folder does not exist: {folder_path}")

pdf_files = sorted(folder_path.glob("*.pdf"))
if not pdf_files:
    raise FileNotFoundError(f"No PDF files found in: {folder_path}")

print(f"Total PDFs found: {len(pdf_files)}")


# Extract text from all PDFs.
all_text_parts = []

for pdf_path in pdf_files:
    print(f"Reading: {pdf_path.name}")
    reader = PdfReader(str(pdf_path))
    pdf_text = "\n\n".join(page.extract_text() or "" for page in reader.pages)

    if pdf_text.strip():
        all_text_parts.append(
            f"Source file: {pdf_path.name}\n{pdf_text.strip()}"
        )

all_text = "\n\n".join(all_text_parts)

if not all_text.strip():
    raise ValueError(
        "No text could be extracted from the PDFs. "
        "They may be scanned images that need OCR."
    )

print("Text extraction complete!")


# Split the extracted text into chunks.
splitter = RecursiveCharacterTextSplitter(
    chunk_size=900,
    chunk_overlap=150,
)

chunks = splitter.split_text(all_text)

docs = [
    Document(
        page_content=chunk,
        metadata={"source": "campus_docs", "chunk_id": i},
    )
    for i, chunk in enumerate(chunks)
]

print(f"Total chunks created: {len(docs)}")


# Create or load the local Chroma database.
embedding_model = HuggingFaceEmbeddings(
    model_name="sentence-transformers/all-MiniLM-L6-v2",
    model_kwargs={"device": "cpu"},
    encode_kwargs={"normalize_embeddings": True},
)

persist_directory = "./chroma_db"
collection_name = "campus_helpdesk"

vector_db = Chroma(
    collection_name=collection_name,
    embedding_function=embedding_model,
    persist_directory=persist_directory,
)

# Rebuild the collection from the current PDFs to avoid duplicate chunks
# when this script is run again.
existing_ids = vector_db.get()["ids"]
if existing_ids:
    vector_db.delete(ids=existing_ids)

vector_db.add_documents(docs)
print("Vector database created and saved successfully!")


# Set up document retrieval.
retriever = vector_db.as_retriever(
    search_type="similarity",
    search_kwargs={"k": 3},
)


def ask_question(query: str) -> str:
    """Retrieve relevant PDF text and answer the question."""
    relevant_docs = retriever.invoke(query)
    context_text = "\n\n".join(doc.page_content for doc in relevant_docs)
    fallback_answer = (
        "Unfortunately,I don't have the specific information regarding your "
        "query in my database.Please contact the respective department or "
        "email the college administration for further details."
    )

    completion = client.chat.completions.create(
        model="openai/gpt-oss-20b",
        messages=[
            {
                "role": "system",
                "content": (
                    "You are a campus helpdesk assistant. Answer the "
                    "question using only information in the provided "
                    "database context. Do not use outside knowledge. If the "
                    "context does not explicitly contain the answer, return "
                    f"exactly this message and nothing else: {fallback_answer}"
                ),
            },
            {
                "role": "user",
                "content": f"Context:\n{context_text}\n\nQuestion:\n{query}",
            },
        ],
        temperature=0.7,
        max_tokens=1024,
    )
    answer = completion.choices[0].message.content
    if answer is None:
        raise RuntimeError("Groq returned an empty response.")
    return answer


if __name__ == "__main__":
    while True:
        user_query = input("\n\nAsk a question : ").strip()
        if not user_query:
            continue

        print(ask_question(user_query))
