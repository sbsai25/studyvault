# StudyVault

An AI study assistant: upload your notes, ask questions about them, and generate flashcards and quizzes from them. Built with a FastAPI + PostgreSQL backend, a ChromaDB vector store, Google Gemini, and a React frontend.

## Overview

Students collect PDFs, slides, and notes, but searching through them and turning them into revision material takes time. StudyVault turns your own documents into a searchable knowledge base:

- **Ask questions** about your documents and get answers based on retrieval-augmented generation (RAG), with the source documents listed under each answer.
- **Generate flashcards** from a document and study them with a flip-card interface that records how well you knew each card.
- **Generate a multiple-choice quiz** from a document.

Each user has their own account. Documents, retrieval results, chats, and flashcards are scoped to the logged-in user.

## Features

- Email/password registration and login with JWT access and refresh tokens
- Document upload with text extraction from **PDF, TXT, DOCX, and PPTX** (backend). The current UI file picker accepts PDF and TXT.
- Text chunking, Gemini embeddings, and per-user vector search in ChromaDB
- Document Q&A with source attribution (the answer lists which uploaded documents it drew from)
- Persistent chat conversations with AI-generated titles. The backend also has endpoints to list, rename, and delete conversations.
- Document listing and deletion (removes the file, database rows, and vector embeddings)
- AI-generated flashcard decks (5–15 cards per document), saved to the database
- Flashcard study mode: flip cards, rate each one *Again / Hard / Good / Easy*, and see a session summary
- Review scheduling: each rating sets the card's next review time
- AI-generated 3-question multiple-choice quizzes
- Backend test suite (pytest) covering auth, chat, documents, and flashcards

## AI/RAG Pipeline

```
User uploads a document
        ↓
Save file to uploads/ and create a Document row (PostgreSQL)
        ↓
Text extraction (pypdf / python-docx / python-pptx / plain text)
        ↓
Chunking: RecursiveCharacterTextSplitter (1000 chars, 200 overlap)
        ↓
Chunks saved to PostgreSQL
        ↓
Embeddings: Gemini `gemini-embedding-2` (task type RETRIEVAL_DOCUMENT)
        ↓
ChromaDB persistent collection, with metadata {user_id, document_id, chunk_index}

User asks a question
        ↓
Query embedding: `gemini-embedding-2` (task type RETRIEVAL_QUERY)
        ↓
ChromaDB similarity search: top 4 chunks, filtered to the current user
        ↓
Gemini `gemini-3.6-flash` answers using only the retrieved context
        ↓
Answer + sources (document IDs and chunk IDs), saved to the conversation
```

If the retrieved context doesn't contain the answer, the prompt tells the model to say it couldn't find the answer in the uploaded materials.

Implementation: [`backend/services/rag.py`](backend/services/rag.py), [`backend/routers/documents.py`](backend/routers/documents.py), [`backend/routers/chat.py`](backend/routers/chat.py)

## Architecture

```mermaid
flowchart LR
    subgraph Client["Frontend: React + Vite"]
        UI["Dashboard<br/>Upload · Chat · Study tools"]
        FC["Flashcard decks<br/>& study mode"]
        AX["Axios client<br/>(JWT + auto refresh)"]
        UI --> AX
        FC --> AX
    end

    subgraph API["Backend: FastAPI"]
        AUTH["/auth<br/>register · login · refresh · me"]
        DOCS["/documents<br/>upload · list · delete"]
        CHAT["/chat<br/>RAG Q&A · conversations"]
        TOOLS["/tools<br/>flashcards · quiz"]
        CARDS["/flashcards<br/>decks · review · due"]
        DEP["get_current_user<br/>(JWT validation)"]
        RAG["services/rag.py"]
    end

    PG[("PostgreSQL<br/>users · documents · chunks<br/>conversations · flashcards")]
    CH[("ChromaDB<br/>persistent vector store")]
    FS[["uploads/<br/>original files"]]
    GEM["Google Gemini<br/>embeddings + generation"]

    AX -->|HTTP + Bearer token| AUTH & DOCS & CHAT & TOOLS & CARDS
    DOCS & CHAT & TOOLS & CARDS --> DEP
    AUTH & DOCS & CHAT & TOOLS & CARDS --> PG
    DOCS --> FS
    DOCS & CHAT & TOOLS --> RAG
    RAG --> CH
    RAG --> GEM
```

| Layer | Implementation |
|---|---|
| **Frontend** | React 19 SPA built with Vite and React Router. `AuthContext` holds the logged-in user, `ProtectedRoute` guards pages, and an Axios client attaches the access token and refreshes it on `401`. Assistant answers render as Markdown (`react-markdown`). |
| **Backend** | FastAPI app (`backend/main.py`) with five routers: `auth`, `documents`, `chat`, `tools`, `flashcards`. CORS is configured for the Vite dev server (`http://localhost:5173`). |
| **Database** | PostgreSQL via SQLAlchemy 2.0 ORM and the psycopg 3 driver. Tables: users, documents, chunks, conversations, messages, flashcard_sets, flashcards, flashcard_progress, plus quiz and activity tables that are defined but not yet used by any endpoint. |
| **Vector database** | ChromaDB `PersistentClient` stored in `.chroma/`, with one collection (`studyvault_chunks`). Every query is filtered by `user_id`. |
| **AI/LLM layer** | Google Gemini via the `google-genai` SDK: `gemini-embedding-2` for embeddings and `gemini-3.6-flash` for answers, chat titles, flashcards, and quizzes. Flashcards and quizzes use JSON output mode (`response_mime_type="application/json"`). |
| **Authentication** | Argon2 password hashing (`pwdlib`) and HS256 JWTs (`PyJWT`). See [Authentication](#authentication). |
| **Document pipeline** | Upload → save to disk under a generated unique name (the original filename is kept only for display) → extract text → chunk → store chunks in PostgreSQL → embed → store in ChromaDB. Deleting a document removes its vectors, file, and database rows. |

## Flashcards

1. On the dashboard, choose **Flashcards** next to an uploaded document (`POST /tools/flashcards`).
2. The backend joins the document's first 10 chunks and asks Gemini for 5–15 question/answer pairs in JSON.
3. A `FlashcardSet` is created (titled from the filename) along with its `Flashcard` rows. The UI then shows a confirmation page.
4. **Study mode** (`/flashcards/:setId`) shows one card at a time. Click a card to flip it, then rate it **Again / Hard / Good / Easy**.
5. Each rating is saved to `FlashcardProgress` (`POST /flashcards/{id}/review`) with a review count, the rating, and a next-review time:

   | Rating | Next review |
   |---|---|
   | Again | 10 minutes |
   | Hard | 1 day |
   | Good | 3 days |
   | Easy | 7 days |

6. At the end of a deck, a summary shows how many cards got each rating.

Other flashcard endpoints: list decks (`GET /flashcards`), view a deck with per-card progress (`GET /flashcards/{set_id}`), delete a deck (`DELETE /flashcards/{set_id}`), and list cards that are due for review (`GET /flashcards/due`). The "due" endpoint is implemented and tested but not yet shown in the UI.

## Quizzes

1. On the dashboard, choose **Quiz** next to a document (`POST /tools/quiz`).
2. The backend sends the document's first 10 chunks to Gemini and asks for **3 multiple-choice questions**, each with 4 options and the correct answer, in JSON.
3. The dashboard displays the questions with the correct option highlighted.

Quizzes are currently generated on demand and are **not saved**. Database models for quizzes, questions, attempts, and answers already exist for interactive quiz-taking and scoring, but no endpoints use them yet.

## Authentication

```mermaid
sequenceDiagram
    participant U as React app
    participant A as FastAPI
    participant DB as PostgreSQL

    U->>A: POST /auth/register or /auth/login {email, password}
    A->>DB: create user (Argon2 hash) / verify password
    A-->>U: access_token (30 min) + refresh_token (7 days)
    Note over U: Tokens stored in localStorage
    U->>A: Request with Authorization: Bearer <access_token>
    A->>A: get_current_user: verify signature, expiry, type="access"
    A-->>U: Protected data (scoped to the user)
    U->>A: On 401: POST /auth/refresh
    A-->>U: New access + refresh token pair
```

- Passwords are hashed with **Argon2** (`pwdlib`'s recommended hasher). Emails are validated with Pydantic `EmailStr`.
- JWTs are signed with HS256 using `SECRET_KEY`. Each token carries `sub` (user ID) and `type` (`access` or `refresh`). Protected routes only accept `access` tokens, and `/auth/refresh` only accepts `refresh` tokens.
- Lifetimes come from `ACCESS_TOKEN_EXPIRE_MINUTES` (default 30) and `REFRESH_TOKEN_EXPIRE_DAYS` (default 7).
- Logout happens on the client: tokens are stateless, so the frontend deletes them. There is no server-side token revocation.
- All document, chat, and flashcard queries filter by the authenticated user's ID.

## Tech Stack

| Area | Technologies |
|---|---|
| Frontend | React 19, Vite, React Router, Axios, react-markdown |
| Backend | Python 3.12, FastAPI, Uvicorn, Pydantic |
| Database | PostgreSQL, SQLAlchemy 2.0, psycopg 3 |
| Vector store | ChromaDB |
| AI | Google Gemini (`google-genai`): embeddings and text generation |
| Document processing | pypdf, python-docx, python-pptx, langchain-text-splitters |
| Auth | PyJWT, pwdlib (Argon2) |
| Testing | pytest, FastAPI TestClient, unittest.mock |

## Project Structure

```
studyvault/
├── backend/
│   ├── main.py            # FastAPI app, CORS, router registration
│   ├── database.py        # SQLAlchemy engine/session (reads DATABASE_URL)
│   ├── security.py        # Password hashing, JWT creation/verification
│   ├── deps.py            # get_current_user dependency
│   ├── init_db.py         # Create all tables
│   ├── migrate_db.py      # Add missing columns/tables to an existing DB
│   ├── verify_db.py       # Print tables and row counts (dev utility)
│   ├── models/            # SQLAlchemy models (user, document, chunk, conversation,
│   │                      #   flashcard, quiz, activity)
│   ├── schemas/           # Pydantic request/response schemas
│   ├── routers/
│   │   ├── auth.py        # /auth
│   │   ├── documents.py   # /documents: upload, extract, chunk, embed
│   │   ├── chat.py        # /chat: RAG Q&A and conversations
│   │   ├── study_tools.py # /tools: flashcard and quiz generation
│   │   └── flashcards.py  # /flashcards: decks, reviews, due cards
│   └── services/
│       └── rag.py         # Gemini + ChromaDB: embed, store, search, generate
├── frontend/
│   └── src/
│       ├── api/client.js          # Axios instance, token refresh, API calls
│       ├── context/AuthContext.jsx
│       └── components/            # Dashboard, auth forms, flashcards/
├── tests/                 # pytest suite
├── requirements.txt
└── .env.example
```

Created at runtime (git-ignored): `uploads/` (uploaded files) and `.chroma/` (vector store).

## Installation

**Prerequisites**

- Python 3.12
- Node.js and npm (a version supported by Vite 8)
- PostgreSQL (a running server and an empty database)
- A Google Gemini API key

```bash
git clone https://github.com/<your-username>/StudyVault.git
cd StudyVault

# Backend
python -m venv .venv
# Windows (PowerShell):  .venv\Scripts\Activate.ps1
# macOS/Linux:           source .venv/bin/activate
pip install -r requirements.txt

# Frontend
cd frontend
npm install
cd ..
```

Create the database (for example with `psql`):

```sql
CREATE DATABASE studyvault;
```

## Environment Variables

Copy the template and fill it in:

```bash
cp .env.example .env
```

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL URL using the psycopg 3 driver, e.g. `postgresql+psycopg://USER:PASSWORD@localhost:5432/studyvault` |
| `SECRET_KEY` | Yes | Secret used to sign JWTs. Use a long random string. |
| `GEMINI_API_KEY` | Yes | Google Gemini API key for embeddings and generation |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | No | Access token lifetime (default `30`) |
| `REFRESH_TOKEN_EXPIRE_DAYS` | No | Refresh token lifetime (default `7`) |

`.env` is git-ignored. Never commit real values.

## Running Locally

All backend commands run from the **project root** (the code uses `backend.*` package imports).

```bash
# 1. Create the database tables (first run only)
python -m backend.init_db

# 2. Start the API at http://127.0.0.1:8000 (interactive docs at /docs)
uvicorn backend.main:app --reload

# 3. In a second terminal, start the frontend at http://localhost:5173
cd frontend
npm run dev
```

The frontend expects the API at `http://127.0.0.1:8000`, and the backend allows CORS from `http://localhost:5173`.

If you're upgrading a database created by an older version, `python -m backend.migrate_db` adds the newer columns and any missing tables.

### Running tests

```bash
python -m pytest
```

Gemini calls are mocked in the chat, document, and flashcard tests, but the tests still connect to the database in `DATABASE_URL` and write test users and data to it. Point `DATABASE_URL` at a separate test database before running them.

## Screenshots

> **TODO:** Add screenshots of the dashboard (upload + chat with sources), flashcard study mode, and a generated quiz.

## Future Improvements

These are **not implemented yet**:

- Interactive quiz-taking with saved attempts and scores (the database models already exist)
- A "due for review" view in the UI (the backend endpoint already exists)
- Enabling DOCX/PPTX in the upload UI (the backend already parses them)
- Conversation history sidebar in the UI (list/rename/delete endpoints already exist)
- Spaced repetition that adapts to review history (intervals are currently fixed per rating)
- Generating study tools from the whole document instead of the first 10 chunks
- Showing the exact source passages with answers, not just document names
- Upload size limits and stricter file-type validation
- Server-side refresh-token revocation and rate limiting on auth endpoints
- Background processing for large uploads, and Docker-based setup
