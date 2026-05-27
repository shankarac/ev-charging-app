from app.db import db


def _normalize_username(username: str) -> str:
    return str(username or "").strip().lower()


def find_by_username(username: str) -> dict | None:
    normalized = _normalize_username(username)
    if not normalized:
        return None
    row = db.fetch_one(
        """
        SELECT id, username, password, created_at, updated_at
        FROM admin_accounts
        WHERE lower(username)=:username
        """,
        {"username": normalized},
    )
    return dict(row) if row else None


def verify_credentials(username: str, password: str) -> dict | None:
    account = find_by_username(username)
    if not account or account.get("password") != password:
        return None
    return account


def upsert_account(username: str, password: str) -> dict:
    normalized = _normalize_username(username)
    if not normalized or not password:
        raise ValueError("Admin username and password are required")

    existing = find_by_username(normalized)
    if existing:
        db.execute(
            """
            UPDATE admin_accounts
            SET password=:password, updated_at=CURRENT_TIMESTAMP
            WHERE lower(username)=:username
            """,
            {"username": normalized, "password": password},
        )
        return find_by_username(normalized) or existing

    db.execute(
        """
        INSERT INTO admin_accounts(username, password)
        VALUES(:username, :password)
        """,
        {"username": normalized, "password": password},
    )
    created = find_by_username(normalized)
    if not created:
        raise RuntimeError("Failed to create admin account")
    return created


def list_accounts(limit: int = 50) -> list[dict]:
    safe_limit = max(1, min(limit, 200))
    rows = db.fetch_all(
        """
        SELECT id, username, created_at, updated_at
        FROM admin_accounts
        ORDER BY id ASC
        LIMIT :limit
        """,
        {"limit": safe_limit},
    )
    return [dict(row) for row in rows]
