from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.deps import get_current_user
import backend.models
from backend.models.user import User
from backend.routers.auth import router as auth_router
from backend.routers.documents import router as documents_router
from backend.routers.chat import router as chat_router
from backend.routers.study_tools import router as tools_router

app = FastAPI(title="StudyVault API")

# CORS — allow frontend dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(auth_router)
app.include_router(documents_router)
app.include_router(chat_router)
app.include_router(tools_router)

@app.get("/")
def root():
    return {"message": "StudyVault API is running"}


@app.get("/health")
def health_check():
    return {"status": "healthy"}


@app.get("/db-test")
def database_test(db: Session = Depends(get_db)):
    return {"message": "FastAPI can access the database"}
