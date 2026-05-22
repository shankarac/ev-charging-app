from contextlib import contextmanager
from pathlib import Path

from app.db.sql_utils import to_postgres_named_params


class PostgresDatabase:
    def __init__(self, dsn: str, migrations_dir: Path):
        self.dsn = dsn
        self.migrations_dir = migrations_dir

    def initialize(self) -> None:
        self._apply_migrations()

    @contextmanager
    def connection(self):
        try:
            import psycopg
            from psycopg.rows import dict_row
        except ImportError as error:
            raise RuntimeError(
                "PostgreSQL driver is missing. Install it with: pip install psycopg[binary]"
            ) from error

        with psycopg.connect(self.dsn, row_factory=dict_row) as conn:
            yield conn
            conn.commit()

    def _apply_migrations(self) -> None:
        with self.connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    CREATE TABLE IF NOT EXISTS schema_migrations(
                        version TEXT PRIMARY KEY,
                        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                    )
                    """
                )
                cur.execute("SELECT version FROM schema_migrations")
                applied_versions = {row["version"] for row in cur.fetchall()}

                migration_files = sorted(self.migrations_dir.glob("*.sql"))
                for migration in migration_files:
                    if migration.name in applied_versions:
                        continue

                    cur.execute(migration.read_text(encoding="utf-8"))
                    cur.execute(
                        """
                        INSERT INTO schema_migrations(version)
                        VALUES(%s)
                        """,
                        (migration.name,),
                    )

    def _compile_query(self, query: str) -> str:
        return to_postgres_named_params(query)

    def fetch_one(self, query, params=None):
        compiled_query = self._compile_query(query)
        with self.connection() as conn:
            with conn.cursor() as cur:
                cur.execute(compiled_query, params or {})
                return cur.fetchone()

    def fetch_all(self, query, params=None):
        compiled_query = self._compile_query(query)
        with self.connection() as conn:
            with conn.cursor() as cur:
                cur.execute(compiled_query, params or {})
                return cur.fetchall()

    def execute(self, query, params=None):
        compiled_query = self._compile_query(query)
        with self.connection() as conn:
            with conn.cursor() as cur:
                cur.execute(compiled_query, params or {})
                if cur.description:
                    row = cur.fetchone()
                    if row:
                        return next(iter(row.values()))
                return cur.rowcount
