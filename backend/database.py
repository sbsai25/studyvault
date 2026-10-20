import os

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

load_dotenv()



def normalize_database_url(url: str) -> str:
    """Use the psycopg 3 driver for plain postgres:// or postgresql:// URLs.

    Hosts such as Railway hand out driverless URLs, which SQLAlchemy would
    otherwise map to psycopg2 (not installed).
    """
    for prefix in ("postgres://", "postgresql://"):
        if url.startswith(prefix):
            return "postgresql+psycopg://" + url[len(prefix):]
    return url


DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL is not set")

DATABASE_URL = normalize_database_url(DATABASE_URL)

engine = create_engine(DATABASE_URL)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)

from backend.models.base import Base
from backend.models.user import User
from backend.models.document import Document
from backend.models.chunk import Chunk

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
