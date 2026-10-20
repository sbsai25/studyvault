# StudyVault

An AI study assistant: upload your notes, ask questions about them, and turn them into flashcards and fill-in-the-blank exercises. Built with a FastAPI + PostgreSQL backend, a ChromaDB vector store, Google Gemini, and a React frontend.

## Overview

Students collect PDFs, slides, and notes, but searching through them and turning them into revision material takes time. StudyVault turns your own documents into a searchable knowledge base:

- **Ask questions** about your documents and get answers based on retrieval-augmented generation (RAG), with the source passages listed under each answer. Follow-up questions understand the conversation so far.
- **Generate flashcards** from a document and study them with spaced repetition.
- **Practise with fill-in-the-blank exercises** generated from a document, get a score, and review past attempts.
- **Track progress**: activity history, study streaks, and average scores.

Each user has their own account. Documents, retrieval results, chats, and study material are scoped to the logged-in user.

## Features

- Email/password registration and login with JWT access tokens and single-use, revocable refresh tokens
- Rate limiting on login, registration, and token refresh
- Document upload with text extraction from **PDF, TXT, Markdown, DOCX, and PPTX**, a configurable size limit, and full cleanup if processing fails. The current UI file picker accepts PDF and TXT.
- Text chunking, Gemini embeddings, and per-user vector search in ChromaDB
- Document Q&A with sources (file name and a snippet of each passage), saved with the conversation
- Multi-turn chat (the last 6 messages are sent as context) and optional chat with a single document
- Persistent chat conversations with AI-generated titles; list, rename, and delete them
- Document listing and deletion (removes the file, database rows, vectors, and study material)
- Study material generated from the **whole document**, not just its beginning
- AI-generated flashcard decks (5–15 cards per document) with a flip-card study mode
- Spaced repetition: a modified SM-2 schedule that adapts each card's interval to your ratings
- Fill-in-the-blank exercises with forgiving answer matching and accepted alternatives
- Activity log and a stats endpoint (counts, cards due, reviews this week, averages, streaks)
- Automatic retries when Gemini is briefly overloaded; a generic error message if it still fails
- Backend test suite (pytest, 111 tests) that runs against a separate test database

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

User asks a question (optionally limited to one document)
        ↓
Query embedding: `gemini-embedding-2` (task type RETRIEVAL_QUERY)
  (for follow-ups, the previous question is included in the search text)
        ↓
ChromaDB similarity search: top 4 chunks, filtered to the current user
  (and to the chosen document, if any)
        ↓
Gemini (`GEMINI_MODEL`, default `gemini-3.5-flash-lite`) answers using the retrieved context,
  with the last 6 messages of the conversation for follow-up questions
        ↓
Answer + sources (file name, chunk index, snippet), saved to the conversation
```

If the retrieved context doesn't contain the answer, the prompt tells the model to say it couldn't find the answer in the uploaded materials. If nothing relevant is retrieved at all, the API replies with that message without calling Gemini.

Gemini calls that fail with a temporary error (5xx "high demand", or 429) are retried up to 3 times with a 1s, then 2s, wait. If they still fail, the API returns `502` with a generic message; the provider's error is only written to the server log.

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
        AUTH["/auth<br/>register · login · refresh · logout · me"]
        DOCS["/documents<br/>upload · list · delete"]
        CHAT["/chat<br/>RAG Q&A · conversations"]
        TOOLS["/tools<br/>flashcards · fill-blanks"]
        CARDS["/flashcards<br/>decks · review · due"]
        PRACTICE["/fill-blanks<br/>take · score · attempts"]
        STATS["/activity · /stats"]
        DEP["get_current_user<br/>(JWT validation)"]
        RAG["services/rag.py"]
    end

    PG[("PostgreSQL<br/>users · documents · chunks · conversations<br/>flashcards · fill-blanks<br/>activities · refresh_tokens")]
    CH[("ChromaDB<br/>persistent vector store")]
    FS[["uploads/<br/>original files"]]
    GEM["Google Gemini<br/>embeddings + generation"]

    AX -->|HTTP + Bearer token| AUTH & DOCS & CHAT & TOOLS & CARDS & PRACTICE & STATS
    DOCS & CHAT & TOOLS & CARDS & PRACTICE & STATS --> DEP
    AUTH & DOCS & CHAT & TOOLS & CARDS & PRACTICE & STATS --> PG
    DOCS --> FS
    DOCS & CHAT & TOOLS --> RAG
    RAG --> CH
    RAG --> GEM
```

| Layer | Implementation |
|---|---|
| **Frontend** | React 19 SPA built with Vite and React Router. `AuthContext` holds the logged-in user, `ProtectedRoute` guards pages, and an Axios client attaches the access token and refreshes it on `401` (one shared refresh call even when several requests fail at once, since refresh tokens are single-use). `src/api/client.js` has a helper for every API endpoint. Assistant answers render as Markdown (`react-markdown`). |
| **Backend** | FastAPI app (`backend/main.py`) with routers for `auth`, `documents`, `chat`, `tools`, `flashcards`, `fill-blanks`, and `activity`/`stats`. CORS origins come from `CORS_ORIGINS` (default: the Vite dev server). |
| **Database** | PostgreSQL via SQLAlchemy 2.0 ORM and the psycopg 3 driver. Tables: users, documents, chunks, conversations, messages, flashcard_sets, flashcards, flashcard_progress, fill_blank_sets, fill_blank_questions, fill_blank_attempts, activities, refresh_tokens. |
| **Vector database** | ChromaDB `PersistentClient` stored in `.chroma/` (or `CHROMA_PATH`), with one collection (`studyvault_chunks`). Every query is filtered by `user_id`, and optionally by `document_id`. |
| **AI/LLM layer** | Google Gemini via the `google-genai` SDK: `gemini-embedding-2` for embeddings and `GEMINI_MODEL` (default `gemini-3.5-flash-lite`) for answers, chat titles, flashcards, and fill-in-the-blanks. Study material uses JSON output mode (`response_mime_type="application/json"`), and each generated item is validated before it is saved. |
| **Authentication** | Argon2 password hashing (`pwdlib`), HS256 JWTs (`PyJWT`), and refresh tokens tracked in the database. See [Authentication](#authentication). |
| **Document pipeline** | Upload → check type and size → save to disk under a generated unique name (the original filename is kept only for display) → extract text → chunk → store chunks in PostgreSQL → embed → store in ChromaDB. If any step fails, the file, rows, and vectors are removed. Deleting a document removes its vectors, file, database rows, and the study material generated from it. |

## Study material generation

Flashcards and fill-in-the-blanks are generated from the **whole document**, within a 24,000-character budget. If the document is longer, the largest number of evenly spaced chunks that fits is used, always including the first and last chunk and keeping document order. If generation produces no valid items, the API returns `502` and saves nothing.

## Flashcards

1. On the dashboard, choose **Flashcards** next to an uploaded document (`POST /tools/flashcards`).
2. The backend asks Gemini for 5–15 question/answer pairs in JSON (see [Study material generation](#study-material-generation)).
3. A `FlashcardSet` is created (titled from the filename) along with its `Flashcard` rows. The UI then shows a confirmation page.
4. **Study mode** (`/flashcards/:setId`) shows one card at a time. Click a card to flip it, then rate it **Again / Hard / Good / Easy**.
5. Each rating is saved to `FlashcardProgress` (`POST /flashcards/{id}/review`) and schedules the next review with a **modified SM-2** algorithm:
   - **Again**: the card comes back in 10 minutes and its streak of successful reviews resets.
   - **Hard / Good / Easy**: 1 day after the first successful review, 6 days after the second, then *previous interval × ease factor* (× 0.8 for Hard, × 1.3 for Easy).
   - Each card has an **ease factor** (starts at 2.5, never below 1.3) that the rating adjusts with the standard SM-2 formula: Hard lowers it, Good keeps it, Easy raises it, Again lowers it a lot. The interval uses the ease factor from *before* the rating.
   - Example: Good, Good, Good gives intervals of 1, 6, and 15 days.
6. At the end of a deck, a summary shows how many cards got each rating.

Other flashcard endpoints: list decks (`GET /flashcards`), view a deck with per-card progress (`GET /flashcards/{set_id}`), delete a deck (`DELETE /flashcards/{set_id}`), cards due for review across all decks (`GET /flashcards/due`), and cards to study now in one deck, meaning never reviewed or overdue (`GET /flashcards/{set_id}/due`). The "due" endpoints are not yet shown in the UI.

## Fill-in-the-blanks

1. `POST /tools/fill-blanks` (optional `num_questions` from 3 to 20, default 10) asks Gemini for sentences from the document with one key term replaced by `____`, the answer, any accepted alternatives (synonyms, abbreviations), and a hint.
2. `GET /fill-blanks/{id}` returns the sentences and hints **without** answers. `POST /fill-blanks/{id}/submit` takes `{"answers": [{"question_id", "answer"}]}` and returns `score` (correct answers), `total` (all questions in the set), `percentage`, and per-question results with the correct answer. Unanswered questions count as wrong; answering the same question twice, or a question from another set, returns `422`. Every submission is saved as a new attempt.
3. Answer matching ignores case, extra spaces, and sentence punctuation, quotes, or brackets at the ends (`"Photosynthesis."` matches `photosynthesis`). Characters inside an answer, and symbols that change its meaning, still count: `co-op` ≠ `coop`, `3.5` ≠ `35`, `C++` ≠ `C`.

The same list, attempts, attempt review, and delete endpoints exist under `/fill-blanks`.

## Progress and stats

Successful actions are recorded in an activity log: uploads, chat messages, generating study material, flashcard reviews, and fill-in-the-blank submissions (with their scores). A failed or rejected request records nothing.

- `GET /activity?limit=20&offset=0`: the user's recent activity, newest first.
- `GET /stats`: counts of documents, decks, cards (and cards never reviewed), and fill-in-the-blank sets; cards due now; reviews in the last 7 days; fill-in-the-blank attempts and average percentage; activity per day for the last 14 days; and the current and longest **study streak** (consecutive UTC days with any activity; the current streak still counts yesterday until today ends).

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
    U->>A: On 401: POST /auth/refresh {refresh_token}
    A->>DB: lock the token's row, revoke it, store the new one
    A-->>U: New access + refresh token pair
    U->>A: POST /auth/logout {refresh_token}
    A->>DB: revoke the token
```

- Passwords are hashed with **Argon2** (`pwdlib`'s recommended hasher). Emails are validated with Pydantic `EmailStr`.
- JWTs are signed with HS256 using `SECRET_KEY`. Each token carries `sub` (user ID) and `type` (`access` or `refresh`). Protected routes only accept `access` tokens, and `/auth/refresh` only accepts `refresh` tokens.
- **Refresh tokens are single-use.** Each one has a unique `jti` stored in the `refresh_tokens` table. Refreshing locks that row, revokes the token, and issues a new pair in one transaction, so two simultaneous refreshes with the same token can't both succeed.
- **Reuse detection:** if a token we issued is used again after it was rotated or logged out, every refresh token for that user is revoked (they must log in again everywhere). Forged, expired, or unknown tokens just get `401` and never trigger this.
- **Logout** (`POST /auth/logout {refresh_token}`) revokes that refresh token. It always returns `200`. Access tokens can't be revoked and stay valid until they expire (at most `ACCESS_TOKEN_EXPIRE_MINUTES`).
- Refresh tokens are sent in the JSON body, never in the URL, so they don't end up in logs.
- **Rate limits:** login and register allow 5 requests per minute per IP, and refresh 20 per minute; beyond that the API returns `429` with a `Retry-After` header. Limits are kept in memory, per API process: several workers or containers each count separately, and a restart resets them.
- Lifetimes come from `ACCESS_TOKEN_EXPIRE_MINUTES` (default 30) and `REFRESH_TOKEN_EXPIRE_DAYS` (default 7).
- All data queries filter by the authenticated user's ID.

> **Upgrading:** refresh tokens issued before token rotation was added have no `jti` and are rejected, so existing users need to log in once after the upgrade.

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
│   │                      #   flashcard, fill_blank, activity, refresh_token)
│   ├── schemas/           # Pydantic request/response schemas
│   ├── routers/
│   │   ├── auth.py        # /auth
│   │   ├── documents.py   # /documents: upload, extract, chunk, embed
│   │   ├── chat.py        # /chat: RAG Q&A and conversations
│   │   ├── study_tools.py # /tools: flashcard and fill-in-the-blank generation
│   │   ├── flashcards.py  # /flashcards: decks, SM-2 reviews, due cards
│   │   ├── fill_blanks.py # /fill-blanks: take, score, attempts
│   │   └── activity.py    # /activity and /stats
│   ├── services/
│   │   ├── rag.py         # Gemini + ChromaDB: embed, store, search, generate (with retries)
│   │   └── activity.py    # log_activity()
│   └── rate_limit.py      # In-memory rate limiter for auth routes
├── frontend/
│   └── src/
│       ├── api/client.js          # Axios instance, token refresh, API calls
│       ├── context/AuthContext.jsx
│       └── components/            # Dashboard, auth forms, flashcards/
├── tests/                 # pytest suite (conftest.py points it at the test database)
├── docker/                # Postgres init script for Docker
├── Dockerfile
├── docker-compose.yml
├── requirements.txt
└── .env.example
```

Created at runtime (git-ignored): `uploads/` (uploaded files) and `.chroma/` (vector store). Both locations can be changed with `UPLOAD_DIR` and `CHROMA_PATH`.

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
| `TEST_DATABASE_URL` | For tests | Separate database for pytest. Its name must end in `_test` and it must be on `localhost`, `127.0.0.1`, or the Docker `db` host. **The test suite drops and recreates every table in it.** |
| `ALLOW_TEST_DB_RESET` | For tests | Must be `1`, or pytest refuses to start. A deliberate opt-in before the test database is reset. |
| `GEMINI_MODEL` | No | Gemini model for answers, titles, and study material (default `gemini-3.5-flash-lite`). Each model has its own free-tier quota, so switching models is a quick fix when one runs out. |
| `CORS_ORIGINS` | No | Comma-separated allowed frontend origins (default `http://localhost:5173`) |
| `MAX_UPLOAD_MB` | No | Maximum upload size in megabytes (default `20`) |
| `CHROMA_PATH` | No | Where ChromaDB stores vectors (default `.chroma/` in the project root) |
| `UPLOAD_DIR` | No | Where uploaded files are stored (default `uploads/` in the project root) |
| `FORWARDED_ALLOW_IPS` | No | Proxies whose `X-Forwarded-For` uvicorn trusts (default `127.0.0.1`; `*` on Railway) |
| `VITE_API_BASE_URL` | No (frontend) | API URL baked into the frontend build (default `http://127.0.0.1:8000`) |

`.env` is git-ignored. Never commit real values.

> **Gemini quota:** free-tier keys have small per-minute and per-day limits for each model (for example 5 per minute and 20 per day on some models). Each chat message is one request (two for the first message of a conversation, which also generates a title), and each flashcard or fill-in-the-blank set is one. Past a limit, the API returns `502` until the limit resets; the backend log shows `429 RESOURCE_EXHAUSTED` with the quota that ran out. To keep going, set `GEMINI_MODEL` to another model and restart the API.

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

The frontend calls the API at `http://127.0.0.1:8000` unless `VITE_API_BASE_URL` is set (see `frontend/.env.example`), and the backend allows CORS from `http://localhost:5173` by default.

**Upgrading an existing database:** run `python -m backend.migrate_db`. It creates missing tables and adds newer columns (for example `messages.sources` and the spaced-repetition columns on `flashcard_progress`), and it is safe to run more than once. It never drops tables or deletes rows. Existing flashcard progress starts the new schedule from scratch at its next review.

### Running tests

```bash
# One-time: create the test database
psql -U postgres -c "CREATE DATABASE studyvault_test;"
# and set TEST_DATABASE_URL in .env, e.g.
# TEST_DATABASE_URL=postgresql+psycopg://USER:PASSWORD@localhost:5432/studyvault_test
# ALLOW_TEST_DB_RESET=1

python -m pytest
```

`tests/conftest.py` switches the app to `TEST_DATABASE_URL` before anything else loads, refuses to run if it doesn't look like a local `*_test` database or `ALLOW_TEST_DB_RESET` isn't `1`, and resets its tables at the start of each run. ChromaDB and uploads go to temporary folders. Gemini is mocked everywhere, except one test that runs the document filter against a real temporary ChromaDB with fake embeddings, so the suite needs no API key or network.

### Running with Docker

```bash
# Needs SECRET_KEY and GEMINI_API_KEY in .env
docker compose up --build
```

This starts PostgreSQL 16 (exposed on host port `5433`, so it doesn't clash with a local install) and the API on `http://localhost:8000`. The API container runs `migrate_db` on start, and uploads and vectors are kept in Docker volumes. A `studyvault_test` database is created on first start, so you can run the tests from your machine against it with `TEST_DATABASE_URL=postgresql+psycopg://studyvault:studyvault@localhost:5433/studyvault_test`.

> The Docker setup has not been tested yet: Docker wasn't available on the machine it was written on.

## Deployment (Railway + Vercel)

The API and PostgreSQL run on [Railway](https://railway.com), and the React app on [Vercel](https://vercel.com). `railway.json` and `frontend/vercel.json` hold the settings that can live in the repo; everything else is set in the two dashboards.

### 1. Backend and PostgreSQL on Railway

1. **New Project → Deploy from GitHub repo** and pick this repository. Railway reads `railway.json`: it builds the root `Dockerfile`, runs one replica, and uses `/health` as the health check. The container runs `python -m backend.migrate_db` (additive only) and then starts uvicorn on `$PORT`.
2. **Add PostgreSQL:** in the project, choose **+ Create → Database → PostgreSQL**.
3. **Add a volume** to the API service (right-click the service → **Attach volume**), mounted at **`/data`**. Uploaded files and ChromaDB both live there, so they survive redeploys.
4. **Variables** on the API service:

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (the private network URL; `postgresql://` is accepted and switched to psycopg 3) |
   | `SECRET_KEY` | a new random value: `python -c "import secrets; print(secrets.token_urlsafe(64))"`. Don't reuse the development one. |
   | `GEMINI_API_KEY` | your Gemini key (ideally a separate key/project from development, since free-tier quotas are shared per project) |
   | `GEMINI_MODEL` | `gemini-3.5-flash-lite` (optional) |
   | `CORS_ORIGINS` | the Vercel URL, e.g. `https://studyvault.vercel.app` (no trailing slash; comma-separate several) |
   | `MAX_UPLOAD_MB` | `20` (optional) |
   | `UPLOAD_DIR` | `/data/uploads` (already the image default) |
   | `CHROMA_PATH` | `/data/chroma` (already the image default) |
   | `FORWARDED_ALLOW_IPS` | `*`, so the rate limiter sees each client's IP instead of Railway's proxy |
   | `RAILWAY_RUN_UID` | `0`. Railway mounts volumes as root, and the image otherwise runs as a non-root user that can't write to `/data`. |

5. **Settings → Networking → Generate Domain** to get the public API URL, e.g. `https://studyvault-production.up.railway.app`. Check `https://<api-domain>/health` returns `{"status": "healthy"}`; it returns `503` if the database is unreachable.

Never set `TEST_DATABASE_URL` or `ALLOW_TEST_DB_RESET` on Railway, and never run pytest or `init_db` against the production database.

### 2. Frontend on Vercel

1. **Add New → Project** and import this repository.
2. **Root Directory:** `frontend`. **Framework preset:** Vite. **Build command:** `npm run build`. **Output directory:** `dist`.
3. **Environment variable:** `VITE_API_BASE_URL` = the Railway API URL (no trailing slash). It is baked into the bundle at build time, so changing it needs a redeploy. Don't put secrets in `VITE_` variables; they are public.
4. Deploy, then set `CORS_ORIGINS` on Railway to the Vercel production URL (Railway redeploys automatically). Vercel preview deployments get other URLs and are not allowed by CORS unless you add them.

`frontend/vercel.json` rewrites every path to `index.html`, so refreshing `/dashboard` works.

### Operating notes

- **Run a single API instance.** ChromaDB is a local folder on the volume and rate limits are kept in memory, so several replicas would each see different data.
- **A volume is not a backup.** PostgreSQL (Railway's Postgres service) and the files and vectors (the `/data` volume) are stored separately; back up both if the data matters.
- **Migrations:** every deploy runs `migrate_db`, which creates missing tables and adds missing columns and never drops anything.
- **Existing sessions:** refresh tokens issued before rotation was added are rejected, so users log in again after the first deploy.

### Troubleshooting

| Symptom | Likely cause |
|---|---|
| Browser console shows a CORS error | `CORS_ORIGINS` doesn't exactly match the Vercel origin (scheme, no trailing slash) |
| Frontend calls `127.0.0.1:8000` | `VITE_API_BASE_URL` wasn't set when Vercel built it; set it and redeploy |
| Deploy fails its health check | Check the deploy logs: `DATABASE_URL` missing or wrong, or migrations failed |
| Uploads fail with `500`, log shows `PermissionError` on `/data` | `RAILWAY_RUN_UID=0` isn't set, or the volume isn't mounted at `/data` |
| Chat or generation returns `502` | Gemini quota or outage; the log shows the provider error (see the quota note above) |
| Every user hits `429` together | `FORWARDED_ALLOW_IPS` isn't `*`, so all requests look like they come from the proxy |
| Documents listed but chat finds nothing after a redeploy | No volume at `/data`, so ChromaDB was lost with the old container |

## Screenshots

> **TODO:** Add screenshots of the dashboard (upload + chat with sources), and flashcard study mode.

## Future Improvements

These are **not implemented yet**:

- UI for the newer backend features: fill-in-the-blanks, attempt history, "due for review" views, a stats/progress page, a conversation history sidebar, per-document chat, and source snippets. The API and the `client.js` helpers already exist.
- Enabling DOCX, PPTX, and Markdown in the upload file picker (the backend already parses them)
- Background processing for large uploads (they are currently processed during the request)
- A shared rate-limit store (e.g. Redis) so limits hold across several API workers
- A proper migration tool (Alembic) instead of `migrate_db.py`
