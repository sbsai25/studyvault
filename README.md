# StudyVault

An AI study assistant: upload your notes, ask questions about them, and turn them into flashcards and fill-in-the-blank exercises. Built with a FastAPI + PostgreSQL (pgvector) backend, Google Gemini, and a React frontend.

**Live demo:** [studyvault-amber.vercel.app](https://studyvault-amber.vercel.app). It runs on free hosting, so the first request after the API has been idle for a while takes up to a minute while the server wakes up.

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
- Document upload with text extraction from **PDF, TXT, Markdown, DOCX, and PPTX**, a configurable size limit, and full cleanup if processing fails
- Text chunking, Gemini embeddings, and per-user vector search in PostgreSQL with pgvector
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
- Backend test suite (pytest, 121 tests) that runs against a separate test database

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
Embeddings: Gemini `gemini-embedding-2`, 768 dimensions (task type RETRIEVAL_DOCUMENT),
  sent in batches of up to 100 chunks per request
        ↓
Chunks saved to PostgreSQL, each with its vector in a pgvector `embedding` column

User asks a question (optionally limited to one document)
        ↓
Query embedding: `gemini-embedding-2`, 768 dimensions (task type RETRIEVAL_QUERY)
  (for follow-ups, the previous question is included in the search text)
        ↓
pgvector cosine-distance search: top 4 chunks, filtered to the current user
  (and to the chosen document, if any)
        ↓
Gemini (`GEMINI_MODEL`, default `gemini-3.5-flash-lite`) answers using the retrieved context,
  with the last 6 messages of the conversation for follow-up questions
        ↓
Answer + sources (file name, chunk index, snippet), saved to the conversation
```

If the retrieved context doesn't contain the answer, the prompt tells the model to say it couldn't find the answer in the uploaded materials. If nothing relevant is retrieved at all, the API replies with that message without calling Gemini.

Gemini calls that fail with a temporary error (5xx "high demand", or 429) are tried up to 3 times, waiting 1s, then 2s. When a 429 comes from a per-minute quota and says how long until it resets (up to 60s), the API waits that long instead. This lets a large upload get past the free tier's embedding limit (100 chunks a minute), at the cost of a slower upload. A per-day quota is not retried. If a call still fails, the API returns `502` with a generic message; the provider's error is only written to the server log.

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

    PG[("PostgreSQL + pgvector<br/>users · documents · chunks + vectors<br/>conversations · flashcards · fill-blanks<br/>activities · refresh_tokens")]
    FS[["uploads/<br/>original files"]]
    GEM["Google Gemini<br/>embeddings + generation"]

    AX -->|HTTP + Bearer token| AUTH & DOCS & CHAT & TOOLS & CARDS & PRACTICE & STATS
    DOCS & CHAT & TOOLS & CARDS & PRACTICE & STATS --> DEP
    AUTH & DOCS & CHAT & TOOLS & CARDS & PRACTICE & STATS --> PG
    DOCS --> FS
    DOCS & CHAT & TOOLS --> RAG
    RAG --> PG
    RAG --> GEM
```

| Layer | Implementation |
|---|---|
| **Frontend** | React 19 SPA built with Vite and React Router. `AuthContext` holds the logged-in user, `ProtectedRoute` guards pages, and an Axios client attaches the access token and refreshes it on `401` (one shared refresh call even when several requests fail at once, since refresh tokens are single-use). `src/api/client.js` has a helper for every API endpoint. Assistant answers render as Markdown (`react-markdown`). |
| **Backend** | FastAPI app (`backend/main.py`) with routers for `auth`, `documents`, `chat`, `tools`, `flashcards`, `fill-blanks`, and `activity`/`stats`. CORS origins come from `CORS_ORIGINS` (default: the Vite dev server). |
| **Database** | PostgreSQL via SQLAlchemy 2.0 ORM and the psycopg 3 driver. Tables: users, documents, chunks, conversations, messages, flashcard_sets, flashcards, flashcard_progress, fill_blank_sets, fill_blank_questions, fill_blank_attempts, activities, refresh_tokens. |
| **Vector search** | The [pgvector](https://github.com/pgvector/pgvector) extension in the same PostgreSQL database: each row of `chunks` stores its 768-dimension embedding. Search is an exact cosine-distance query (no vector index; each user's chunks are few), always filtered by `user_id`, and optionally by `document_id`. |
| **AI/LLM layer** | Google Gemini via the `google-genai` SDK: `gemini-embedding-2` for embeddings and `GEMINI_MODEL` (default `gemini-3.5-flash-lite`) for answers, chat titles, flashcards, and fill-in-the-blanks. Study material uses JSON output mode (`response_mime_type="application/json"`), and each generated item is validated before it is saved. |
| **Authentication** | Argon2 password hashing (`pwdlib`), HS256 JWTs (`PyJWT`), and refresh tokens tracked in the database. See [Authentication](#authentication). |
| **Document pipeline** | Upload → check type and size → save to disk under a generated unique name (the original filename is kept only for display) → extract text → chunk → embed → store chunks with their vectors in PostgreSQL. If any step fails, the file and rows are removed. Deleting a document removes its file, database rows (chunks and vectors included), and the study material generated from it. The file is only read during upload, so losing `uploads/` (for example on a host without a persistent disk) breaks nothing. |

## Frontend

A React 19 single-page app in `frontend/`, built with Vite. Its pages:

| Page | Route | What it does |
|---|---|---|
| Dashboard | `/` | What to do next (decks due for review, or the latest conversation), this week's activity, recent documents and quick actions; an onboarding view before the first upload |
| My Library | `/library` | Upload (drag and drop or picker; PDF, DOCX, PPTX, MD, TXT) and manage documents, and create flashcards or exercises from them |
| AI Chat | `/chat` | Conversations with your documents, a conversation list, optional single-document chat, and sources under each answer |
| Flashcards | `/flashcards` | Decks, a flip-card study session with Again / Hard / Good / Easy ratings, and a summary at the end |
| Fill in the Blanks | `/fill-blanks` | Exercises, scored attempts and a review of each attempt |
| Progress | `/progress` | Stat tiles, a 14-day activity chart, streaks and an activity feed |
| Settings | `/settings` | Account details, the theme and motion preferences, and sign-out |

- **Design system:** colours, type, spacing, radii, shadows and motion timings are CSS custom properties in `src/styles/tokens.css`; components use CSS Modules. Shared building blocks (buttons, fields, dialogs, toasts, skeletons, empty and error states) live in `src/components/ui/`.
- **Motion:** animations use [Motion](https://motion.dev) with shared presets in `src/motion/presets.js`. Settings offers *Match device*, *Reduce motion* and *Full motion*; with reduced motion only fades remain.
- **Theme:** light and dark colour sets in `src/styles/tokens.css` (the dark one under `html[data-theme='dark']`). Settings offers *Match device*, *Light* and *Dark*, and the sun/moon button next to *Sign out* switches between them. An inline script in `index.html` applies the choice before the first paint.
- **Free-host cold starts:** if nothing has been heard from the API for 14 minutes and a request is still pending after 5 seconds, a "Waking up the server" notice appears until the request finishes (`onServerWaking` in `src/api/client.js`, shown by `components/layout/ServerWakeNotice.jsx`).

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
| Frontend | React 19, Vite, React Router, Axios, Motion, lucide-react, react-markdown |
| Backend | Python 3.12, FastAPI, Uvicorn, Pydantic |
| Database | PostgreSQL, SQLAlchemy 2.0, psycopg 3 |
| Vector store | pgvector (PostgreSQL extension) |
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
│   │   ├── rag.py         # Gemini + pgvector: embed, search, generate (with retries)
│   │   └── activity.py    # log_activity()
│   └── rate_limit.py      # In-memory rate limiter for auth routes
├── frontend/
│   └── src/
│       ├── api/client.js          # Axios instance, token refresh, API calls
│       ├── context/AuthContext.jsx
│       ├── pages/                 # One component per route (see Frontend)
│       ├── components/            # ui/ building blocks, layout/, and one folder per feature
│       ├── motion/                # Motion presets and the motion preference
│       ├── theme/                 # The light/dark theme preference
│       └── styles/tokens.css      # Design tokens
├── tests/                 # pytest suite (conftest.py points it at the test database)
├── docker/                # Postgres init script for Docker
├── Dockerfile
├── docker-compose.yml
├── render.yaml            # Render Blueprint for the API (free instance)
├── requirements.txt
└── .env.example
```

Created at runtime (git-ignored): `uploads/` (uploaded files). The location can be changed with `UPLOAD_DIR`.

## Installation

**Prerequisites**

- Python 3.12
- Node.js and npm (a version supported by Vite 8)
- PostgreSQL (a running server and an empty database) with the [pgvector](https://github.com/pgvector/pgvector#installation) extension installed. On Windows, pgvector is built from source with the Visual Studio C++ build tools (`nmake /F Makefile.win`, see its install guide). The app runs `CREATE EXTENSION IF NOT EXISTS vector` itself.
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
| `UPLOAD_DIR` | No | Where uploaded files are stored (default `uploads/` in the project root) |
| `FORWARDED_ALLOW_IPS` | No | Proxies whose `X-Forwarded-For` uvicorn trusts (default `127.0.0.1`; `*` on Render) |
| `VITE_API_BASE_URL` | No (frontend) | API URL baked into the frontend build (default `http://127.0.0.1:8000`) |

`.env` is git-ignored. Never commit real values.

> **Gemini quota:** free-tier keys have small per-minute and per-day limits for each model (for example 5 per minute and 20 per day on some models). Each chat message is one request (two for the first message of a conversation, which also generates a title), and each flashcard or fill-in-the-blank set is one. Embeddings are counted per chunk: on the free tier, `gemini-embedding-2` allows 100 chunks a minute, so an upload of more than 100 chunks (roughly 80,000 characters of text) waits for the limit to reset between batches. Past a limit, the API returns `502` until the limit resets; the backend log shows `429 RESOURCE_EXHAUSTED` with the quota that ran out. To keep going, set `GEMINI_MODEL` to another model and restart the API.

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

`tests/conftest.py` switches the app to `TEST_DATABASE_URL` before anything else loads, refuses to run if it doesn't look like a local `*_test` database or `ALLOW_TEST_DB_RESET` isn't `1`, and resets its tables at the start of each run. Uploads go to a temporary folder. Gemini is mocked everywhere; the vector search tests run real pgvector queries in the test database with fake embeddings, so the suite needs no API key or network (but the test database needs pgvector).

### Running with Docker

```bash
# Needs SECRET_KEY and GEMINI_API_KEY in .env
docker compose up --build
```

This starts PostgreSQL 16 with pgvector (the `pgvector/pgvector:pg16` image, exposed on host port `5433`, so it doesn't clash with a local install) and the API on `http://localhost:8000`. The API container runs `migrate_db` on start, and uploads are kept in a Docker volume. A `studyvault_test` database is created on first start, so you can run the tests from your machine against it with `TEST_DATABASE_URL=postgresql+psycopg://studyvault:studyvault@localhost:5433/studyvault_test`.

> The Docker setup has not been tested yet: Docker wasn't available on the machine it was written on.

## Deployment (Render + Neon + Vercel, free)

The API runs on a free [Render](https://render.com) web service, PostgreSQL with pgvector on [Neon](https://neon.com)'s free plan, and the React app on [Vercel](https://vercel.com). All lasting data, vectors included, is in PostgreSQL, so the API needs no persistent disk. `render.yaml` and `frontend/vercel.json` hold the settings that can live in the repo; everything else is set in the dashboards.

### 1. PostgreSQL on Neon

1. Create a Neon project. Pick the region closest to where the API will run (Render's regions are Oregon, Ohio, Virginia, Frankfurt and Singapore).
2. Under **Connect**, turn **Connection pooling off** and copy the connection string (`postgresql://...neon.tech/neondb?sslmode=require...`). The direct connection is enough for a single API instance and avoids prepared-statement issues with the pooler.

You don't need to enable pgvector by hand: every deploy runs `migrate_db`, which runs `CREATE EXTENSION IF NOT EXISTS vector` first.

### 2. API on Render

1. If your Neon region isn't US West, change `region` in `render.yaml` to the closest Render region first, and commit it. Render can't change a service's region after it is created, so `region` must keep matching the existing service afterwards, or every Blueprint sync fails.
2. **New → Blueprint**, connect this repository. Render reads `render.yaml`: it builds the root `Dockerfile` on a free instance and uses `/livez` as the health check. `/livez` only confirms the server is up and doesn't query the database, so a sleeping Neon database that is slow to wake doesn't fail Render's 5-second check and get the instance restarted. The container runs `python -m backend.migrate_db` (additive only) and then starts uvicorn on `$PORT`.
3. Fill in the variables it asks for:

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | the Neon connection string, as copied (`postgresql://` is accepted and switched to psycopg 3) |
   | `GEMINI_API_KEY` | your Gemini key (ideally a separate key/project from development, since free-tier quotas are shared per project) |
   | `CORS_ORIGINS` | the Vercel URL, e.g. `https://studyvault.vercel.app` (no trailing slash; comma-separate several). Fill it in after step 3 if you don't have it yet. |

   `SECRET_KEY` is generated by Render and `FORWARDED_ALLOW_IPS` is set to `*` (so the rate limiter sees each client's IP instead of Render's proxy). `GEMINI_MODEL` and `MAX_UPLOAD_MB` can be added under **Environment** if needed.
4. Once deployed, the API is at `https://<service-name>.onrender.com`. Check `https://<api-domain>/health` returns `{"status": "healthy"}`; it also queries the database and returns `503` if the database is unreachable.

Never set `TEST_DATABASE_URL` or `ALLOW_TEST_DB_RESET` on Render, and never run pytest or `init_db` against the production database.

### 3. Frontend on Vercel

1. **Add New → Project** and import this repository.
2. **Root Directory:** `frontend`. **Framework preset:** Vite. **Build command:** `npm run build`. **Output directory:** `dist`.
3. **Environment variable:** `VITE_API_BASE_URL` = the Render API URL (no trailing slash). It is baked into the bundle at build time, so changing it needs a redeploy. Don't put secrets in `VITE_` variables; they are public.
4. Deploy, then set `CORS_ORIGINS` on Render to the Vercel production URL (saving it redeploys the API). Vercel preview deployments get other URLs and are not allowed by CORS unless you add them.

`frontend/vercel.json` rewrites every path to `index.html`, so refreshing `/dashboard` works.

### Free-tier behaviour

- **Cold starts.** The Render instance sleeps after 15 minutes without requests, and the next request waits about a minute while it starts. Neon's database sleeps after 5 minutes and wakes in about a second; the API checks each pooled connection before using it, so a sleeping database doesn't cause errors. Opening a connection gives up after 10 seconds, so a request fails instead of hanging if the database doesn't answer.
- **Don't keep it awake with an uptime pinger.** `/health` queries the database, so pinging it keeps Neon awake around the clock and uses up the free plan's monthly compute hours in a few weeks, after which the database is suspended until the next month.
- **Storage.** Neon's free plan has 0.5 GB. A chunk (up to 1,000 characters plus a 768-number vector) takes roughly 4 KB, so that is in the order of 100,000 chunks.
- Free-plan limits change; check Render's and Neon's pricing pages.

### Operating notes

- **Run a single API instance.** Rate limits are kept in memory, so several instances would each count separately.
- **Backups:** all lasting data is in the Neon database. Back it up with `pg_dump` if it matters.
- **Migrations:** every deploy runs `migrate_db`, which enables pgvector, creates missing tables and adds missing columns, and never drops anything.
- **Existing sessions:** refresh tokens issued before rotation was added are rejected, so users log in again after the first deploy.

### Troubleshooting

| Symptom | Likely cause |
|---|---|
| Browser console shows a CORS error | `CORS_ORIGINS` doesn't exactly match the Vercel origin (scheme, no trailing slash) |
| Frontend calls `127.0.0.1:8000` | `VITE_API_BASE_URL` wasn't set when Vercel built it; set it and redeploy |
| The first request takes about a minute | The free Render instance was asleep; later requests are fast |
| Email from Render: "A sync failed for your Blueprint" | Open the Blueprint's **Syncs** page for the error. `changing region not supported` means `region` in `render.yaml` doesn't match the service's region |
| Deploy fails its health check | Check the deploy logs: `DATABASE_URL` missing or wrong, or migrations failed |
| Email from Render: "HTTP health check failed (timed out after 5 seconds)" | The instance stopped answering and Render restarted it. Check the service's health check path is `/livez`, not `/health` (under **Settings → Health Checks**; older setups used `/health`, which waits on the database) |
| `extension "vector" is not available` | pgvector isn't installed on that PostgreSQL server (see [Installation](#installation)) |
| Chat or generation returns `502` | Gemini quota or outage; the log shows the provider error (see the quota note above) |
| Every user hits `429` together | `FORWARDED_ALLOW_IPS` isn't `*`, so all requests look like they come from the proxy |
| Chat finds nothing in a document uploaded before the move to pgvector | Its chunks have no vector (they were in ChromaDB); delete the document and upload it again |

## Screenshots

**Dashboard:** what's due, study streak and recent activity.

![Dashboard](docs/screenshots/dashboard.jpg)

**AI Chat:** answers from your own documents, with the source passages listed underneath.

![AI Chat with sources](docs/screenshots/chat.jpg)

**Flashcards:** study a deck and rate each card; spaced repetition decides when it comes back.

![Flashcard study](docs/screenshots/flashcards.jpg)

**My Library:** upload PDF, DOCX, PPTX, Markdown or text files and turn them into chats, flashcards or exercises.

![My Library](docs/screenshots/library.jpg)

## Future Improvements

These are **not implemented yet**:

- Background processing for large uploads (they are currently processed during the request, which can take minutes on the free Gemini tier)
- A vector index (HNSW) on `chunks.embedding` once there is enough data for exact search to be slow
- A shared rate-limit store (e.g. Redis) so limits hold across several API workers
- A proper migration tool (Alembic) instead of `migrate_db.py`
