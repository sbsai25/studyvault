import logging
import os

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

import backend.database  # loads .env before the routers read their settings
import backend.models
from backend.services.rag import AIServiceError
from backend.routers.auth import router as auth_router
from backend.routers.documents import router as documents_router
from backend.routers.chat import router as chat_router
from backend.routers.study_tools import router as tools_router
from backend.routers.flashcards import router as flashcards_router
from backend.routers.quizzes import router as quizzes_router

app = FastAPI(title="StudyVault API")

logger = logging.getLogger("studyvault")


@app.exception_handler(AIServiceError)
async def ai_service_error_handler(request: Request, exc: AIServiceError):
    # Log the provider error for debugging, but never send it to the client
    logger.error("AI service error on %s %s: %s", request.method, request.url.path, exc)
    return JSONResponse(
        status_code=502,
        content={"detail": "The AI service failed to process this request. Please try again."},
    )

# CORS — comma-separated origins, defaults to the Vite dev server
CORS_ORIGINS = [
    o.strip()
    for o in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")
    if o.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(auth_router)
app.include_router(documents_router)
app.include_router(chat_router)
app.include_router(tools_router)
app.include_router(flashcards_router)
app.include_router(quizzes_router)

@app.get("/")
def root():
    return {"message": "StudyVault API is running"}


@app.get("/health")
def health_check():
    return {"status": "healthy"}
