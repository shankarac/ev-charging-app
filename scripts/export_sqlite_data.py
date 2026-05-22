from pathlib import Path
import csv
import sqlite3


BASE_DIR = Path(__file__).resolve().parents[1]
SQLITE_PATH = Path(BASE_DIR / "data" / "sqlite" / "ev_app.db")
EXPORT_DIR = Path(BASE_DIR / "data" / "exports")
TABLES = ("users", "bookings", "password_reset_tokens")


def export_table(conn: sqlite3.Connection, table_name: str) -> None:
    rows = conn.execute(f"SELECT * FROM {table_name}").fetchall()
    columns = [column[1] for column in conn.execute(f"PRAGMA table_info({table_name})")]
    export_path = EXPORT_DIR / f"{table_name}.csv"

    with export_path.open("w", newline="", encoding="utf-8") as csv_file:
        writer = csv.writer(csv_file)
        writer.writerow(columns)
        writer.writerows(rows)


def main() -> None:
    if not SQLITE_PATH.exists():
        raise FileNotFoundError(f"SQLite database not found: {SQLITE_PATH}")

    EXPORT_DIR.mkdir(parents=True, exist_ok=True)

    with sqlite3.connect(SQLITE_PATH) as conn:
        for table_name in TABLES:
            export_table(conn, table_name)

    print(f"CSV export complete: {EXPORT_DIR}")


if __name__ == "__main__":
    main()
