import os

from dotenv import load_dotenv
from sqlalchemy import create_engine, text
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

# Serverless Postgres (e.g. Neon) drops idle connections when it scales to
# zero, so check each pooled connection before handing it out
engine = create_engine(DATABASE_URL, pool_pre_ping=True)


def create_vector_extension(conn):
    """Enables pgvector (chunk embeddings); needed before creating tables."""
    conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))

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
