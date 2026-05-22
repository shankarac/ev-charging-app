from contextlib import contextmanager
from pathlib import Path
import sqlite3


class SQLiteDatabase:
    def __init__(self, database_path: Path, migrations_dir: Path):
        self.database_path = database_path
        self.migrations_dir = migrations_dir

    def initialize(self) -> None:
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        self._apply_migrations()

    def _apply_migrations(self) -> None:
        with self.connection() as conn:
            # Upgrade legacy SQLite databases before running file migrations.
            self._apply_runtime_migrations(conn)

            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS schema_migrations(
                    version TEXT PRIMARY KEY,
                    applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """
            )

            applied_versions = {
                row["version"]
                for row in conn.execute(
                    "SELECT version FROM schema_migrations"
                ).fetchall()
            }

            migration_files = sorted(self.migrations_dir.glob("*.sql"))
            for migration in migration_files:
                if migration.name in applied_versions:
                    continue

                conn.executescript(migration.read_text(encoding="utf-8"))
                conn.execute(
                    """
                    INSERT INTO schema_migrations(version)
                    VALUES(:version)
                    """,
                    {"version": migration.name},
                )

            self._apply_runtime_migrations(conn)

    def _apply_runtime_migrations(self, conn: sqlite3.Connection) -> None:
        has_users_table = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='users'"
        ).fetchone()

        if not has_users_table:
            return

        user_columns = {
            row["name"]
            for row in conn.execute("PRAGMA table_info(users)").fetchall()
        }
        if "email" not in user_columns:
            conn.execute("ALTER TABLE users ADD COLUMN email TEXT")
            conn.execute(
                "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email)"
            )

        has_reset_table = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='password_reset_tokens'"
        ).fetchone()
        if not has_reset_table:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS password_reset_tokens(
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT NOT NULL,
                    token TEXT UNIQUE NOT NULL,
                    expires_at TEXT NOT NULL,
                    used INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY(username) REFERENCES users(username)
                );
                CREATE INDEX IF NOT EXISTS idx_reset_tokens_token
                ON password_reset_tokens(token);
                """
            )

        booking_columns = {
            row["name"]
            for row in conn.execute("PRAGMA table_info(bookings)").fetchall()
        }
        if "status" not in booking_columns and has_users_table:
            conn.execute("ALTER TABLE bookings ADD COLUMN status TEXT")
            conn.execute(
                "UPDATE bookings SET status='Booked' WHERE status IS NULL OR status=''"
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status)"
            )
            booking_columns.add("status")
        elif has_users_table:
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status)"
            )
        if "payment_status" not in booking_columns and has_users_table:
            conn.execute(
                "ALTER TABLE bookings ADD COLUMN payment_status TEXT DEFAULT 'Pending'"
            )
            conn.execute(
                "UPDATE bookings SET payment_status='Pending' WHERE payment_status IS NULL OR payment_status=''"
            )

        has_notifications_table = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='station_notifications'"
        ).fetchone()
        if not has_notifications_table:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS station_notifications(
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    event_type TEXT NOT NULL,
                    username TEXT NOT NULL,
                    station_name TEXT NOT NULL,
                    station_address TEXT NOT NULL,
                    distance TEXT NOT NULL,
                    booking_time TEXT NOT NULL,
                    charger_type TEXT NOT NULL,
                    units INTEGER NOT NULL,
                    price REAL NOT NULL,
                    booking_history_url TEXT NOT NULL,
                    app_dashboard_url TEXT NOT NULL,
                    payment_page_url TEXT NOT NULL,
                    station_map_url TEXT NOT NULL,
                    payment_reference TEXT,
                    payment_status TEXT,
                    is_read INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                );
                CREATE INDEX IF NOT EXISTS idx_station_notifications_station_name
                ON station_notifications(station_name);
                CREATE INDEX IF NOT EXISTS idx_station_notifications_is_read
                ON station_notifications(is_read);
                """
            )
        else:
            notification_columns = {
                row["name"]
                for row in conn.execute("PRAGMA table_info(station_notifications)").fetchall()
            }
            if "distance" not in notification_columns:
                conn.execute(
                    "ALTER TABLE station_notifications ADD COLUMN distance TEXT NOT NULL DEFAULT ''"
                )
            if "booking_history_url" not in notification_columns:
                conn.execute(
                    "ALTER TABLE station_notifications ADD COLUMN booking_history_url TEXT NOT NULL DEFAULT ''"
                )
            if "app_dashboard_url" not in notification_columns:
                conn.execute(
                    "ALTER TABLE station_notifications ADD COLUMN app_dashboard_url TEXT NOT NULL DEFAULT ''"
                )
            if "payment_page_url" not in notification_columns:
                conn.execute(
                    "ALTER TABLE station_notifications ADD COLUMN payment_page_url TEXT NOT NULL DEFAULT ''"
                )
            if "station_map_url" not in notification_columns:
                conn.execute(
                    "ALTER TABLE station_notifications ADD COLUMN station_map_url TEXT NOT NULL DEFAULT ''"
                )
            if "payment_reference" not in notification_columns:
                conn.execute(
                    "ALTER TABLE station_notifications ADD COLUMN payment_reference TEXT"
                )
            if "payment_status" not in notification_columns:
                conn.execute(
                    "ALTER TABLE station_notifications ADD COLUMN payment_status TEXT"
                )
            if "is_read" not in notification_columns:
                conn.execute(
                    "ALTER TABLE station_notifications ADD COLUMN is_read INTEGER NOT NULL DEFAULT 0"
                )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_station_notifications_station_name ON station_notifications(station_name)"
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_station_notifications_is_read ON station_notifications(is_read)"
            )

    @contextmanager
    def connection(self):
        conn = sqlite3.connect(self.database_path, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
            conn.commit()
        finally:
            conn.close()

    def fetch_one(self, query, params=None):
        with self.connection() as conn:
            return conn.execute(query, params or {}).fetchone()

    def fetch_all(self, query, params=None):
        with self.connection() as conn:
            return conn.execute(query, params or {}).fetchall()

    def execute(self, query, params=None):
        with self.connection() as conn:
            cursor = conn.execute(query, params or {})
            if cursor.description:
                row = cursor.fetchone()
                if row:
                    return row[0] if len(row.keys()) else row
            return cursor.lastrowid
