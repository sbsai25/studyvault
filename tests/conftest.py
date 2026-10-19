"""Test configuration: point the app at a disposable test database and
temporary Chroma/upload directories BEFORE any backend module is imported.

backend.database reads DATABASE_URL and backend.services.rag opens ChromaDB
at import time, so this has to happen at module level, not in a fixture.
"""
import gc
import os
import tempfile

from dotenv import load_dotenv
from sqlalchemy.engine import make_url

load_dotenv()

_ALLOWED_TEST_HOSTS = {"localhost", "127.0.0.1", "db"}

_test_url = os.getenv("TEST_DATABASE_URL")
if not _test_url:
    raise RuntimeError(
        "TEST_DATABASE_URL is not set. Point it at a separate database whose "
        "name ends in '_test' (e.g. .../studyvault_test) before running pytest."
    )

_parsed = make_url(_test_url)
if not (_parsed.database or "").endswith("_test") or _parsed.host not in _ALLOWED_TEST_HOSTS:
    raise RuntimeError(
        "Refusing to run tests: TEST_DATABASE_URL must use a database named '*_test' "
        f"on one of {sorted(_ALLOWED_TEST_HOSTS)} (got database={_parsed.database!r}, "
        f"host={_parsed.host!r})."
    )

os.environ["DATABASE_URL"] = _test_url
os.environ["CHROMA_PATH"] = tempfile.mkdtemp(prefix="studyvault_chroma_")
os.environ["UPLOAD_DIR"] = tempfile.mkdtemp(prefix="studyvault_uploads_")

import pytest  # noqa: E402
from sqlalchemy import text  # noqa: E402

import backend.models  # noqa: E402,F401  (registers every model on Base.metadata)
from backend.database import engine  # noqa: E402
from backend.models.base import Base  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def _fresh_schema():
    # Reset at the start rather than the end: some tests open sessions with
    # next(get_db()) and never close them, which would block a teardown drop.
    # Recreate the whole schema (not just the known tables) so tables left
    # over from removed features can't block the reset. Only ever runs
    # against the *_test database checked above.
    with engine.begin() as conn:
        conn.execute(text("DROP SCHEMA public CASCADE"))
        conn.execute(text("CREATE SCHEMA public"))
    Base.metadata.create_all(bind=engine)
    yield


@pytest.fixture(autouse=True)
def _reset_rate_limits():
    # Every TestClient request comes from the same "client" address, so start
    # each test with empty rate-limit windows.
    from backend.rate_limit import reset_rate_limits

    reset_rate_limits()
    yield


@pytest.fixture(autouse=True)
def _release_leaked_connections():
    # Tests use `db = next(get_db())`, which closes the session immediately;
    # later queries on it check out a connection that is only returned to the
    # pool when the session is garbage-collected. Collect after every test so
    # the pool (5 + 10 overflow) never runs dry.
    yield
    gc.collect()
