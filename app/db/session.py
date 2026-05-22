from app.core.config import settings
from app.db.contracts import DatabaseAdapter
from app.db.engines.postgres import PostgresDatabase
from app.db.engines.sqlite import SQLiteDatabase


def build_database() -> DatabaseAdapter:
    if settings.database_engine == "sqlite":
        return SQLiteDatabase(
            settings.sqlite_path,
            settings.sqlite_migrations_dir,
        )

    if settings.database_engine in {"postgres", "postgresql"}:
        if not settings.postgres_dsn:
            raise RuntimeError(
                "POSTGRES_DSN is required when DATABASE_ENGINE=postgres"
            )
        return PostgresDatabase(
            settings.postgres_dsn,
            settings.postgres_migrations_dir,
        )

    raise RuntimeError(
        f"Unsupported DATABASE_ENGINE '{settings.database_engine}'. "
        "Use 'sqlite' or 'postgres'."
    )


db = build_database()
