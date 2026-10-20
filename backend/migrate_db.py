from sqlalchemy import text
from backend.database import engine
from backend.models.base import Base

# Import all models to ensure they are registered with Base.metadata
import backend.models  # noqa: F401

# Columns added to tables that already existed in older databases.
# create_all() only creates missing tables, so each new column on an existing
# table needs an entry here. Additive only: never drop or rewrite data.
# (table, column, column definition)
ADDED_COLUMNS = [
    ("conversations", "updated_at", "TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP"),
    ("users", "is_active", "BOOLEAN NOT NULL DEFAULT TRUE"),
    ("messages", "sources", "JSON"),
    ("flashcard_progress", "ease_factor", "DOUBLE PRECISION NOT NULL DEFAULT 2.5"),
    ("flashcard_progress", "interval_days", "DOUBLE PRECISION NOT NULL DEFAULT 0"),
    ("flashcard_progress", "repetitions", "INTEGER NOT NULL DEFAULT 0"),
]


def _column_exists(conn, table: str, column: str) -> bool:
    result = conn.execute(
        text("""
            SELECT 1
            FROM information_schema.columns
            WHERE table_name = :table AND column_name = :column;
        """),
        {"table": table, "column": column},
    )
    return result.fetchone() is not None


def safe_migrate():
    print("Starting safe migration...")

    # Create missing tables first; a newly created table already has every
    # column, so the ALTERs below are skipped for it.
    print("Creating any missing tables...")
    Base.metadata.create_all(bind=engine)

    with engine.connect() as conn:
        for table, column, definition in ADDED_COLUMNS:
            try:
                if _column_exists(conn, table, column):
                    print(f"Column {column} already exists on {table}.")
                    continue
                print(f"Adding {column} column to {table} table...")
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {definition};"))
                conn.commit()
            except Exception as e:
                conn.rollback()
                print(f"Warning during ALTER TABLE {table}: {e}")

    print("[OK] Safe migration completed successfully!")

if __name__ == "__main__":
    safe_migrate()
