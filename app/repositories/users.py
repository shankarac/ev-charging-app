from app.core.email_policy import normalize_email
from app.db import db

USER_ROLE = "user"
ADMIN_ROLE = "admin"


def _normalize_lookup_email(email: str) -> str | None:
    try:
        return normalize_email(email, enforce_allowed_domains=False)
    except ValueError:
        return None


def _user_role(row) -> str:
    if not row:
        return USER_ROLE
    role = (row["role"] if "role" in row.keys() else USER_ROLE) or USER_ROLE
    return role if role in {ADMIN_ROLE, USER_ROLE} else USER_ROLE


def find_user(username):
    row = db.fetch_one(
        """
        SELECT id, username, password, role
        FROM users
        WHERE username=:username
        """,
        {"username": username},
    )
    if not row:
        return None
    record = dict(row)
    record["role"] = _user_role(row)
    return record


def find_user_contact(username):
    row = db.fetch_one(
        """
        SELECT id, username, email, role
        FROM users
        WHERE username=:username
        """,
        {"username": username},
    )
    if not row:
        return None
    record = dict(row)
    record["role"] = _user_role(row)
    return record


def find_user_by_email(email):
    normalized = _normalize_lookup_email(email)
    if not normalized:
        return None
    row = db.fetch_one(
        """
        SELECT id, username, email, role
        FROM users
        WHERE lower(email)=:email
        """,
        {"email": normalized},
    )
    if not row:
        return None
    record = dict(row)
    record["role"] = _user_role(row)
    return record


def find_user_by_username_or_email(identifier):
    row = db.fetch_one(
        """
        SELECT id, username, email, role
        FROM users
        WHERE username=:identifier OR email=:identifier
        """,
        {"identifier": identifier},
    )
    if not row:
        return None
    record = dict(row)
    record["role"] = _user_role(row)
    return record


def find_user_by_username_credentials(username, password):
    row = db.fetch_one(
        """
        SELECT id, username, email, role
        FROM users
        WHERE username=:username AND password=:password
        """,
        {"username": username, "password": password},
    )
    if not row:
        return None
    record = dict(row)
    record["role"] = _user_role(row)
    return record


def find_user_by_email_credentials(email, password):
    normalized = _normalize_lookup_email(email)
    if not normalized:
        return None
    row = db.fetch_one(
        """
        SELECT id, username, email, role
        FROM users
        WHERE lower(email)=:email AND password=:password
        """,
        {"email": normalized, "password": password},
    )
    if not row:
        return None
    record = dict(row)
    record["role"] = _user_role(row)
    return record


def create_user(username, email, password, role: str = USER_ROLE):
    safe_role = role if role in {ADMIN_ROLE, USER_ROLE} else USER_ROLE
    return db.execute(
        """
        INSERT INTO users(username, email, password, role)
        VALUES(:username, :email, :password, :role)
        """,
        {"username": username, "email": email, "password": password, "role": safe_role},
    )


def set_user_role(username: str, role: str) -> None:
    safe_role = role if role in {ADMIN_ROLE, USER_ROLE} else USER_ROLE
    db.execute(
        """
        UPDATE users
        SET role=:role
        WHERE username=:username
        """,
        {"username": username, "role": safe_role},
    )


def list_users(limit: int = 100) -> list[dict]:
    safe_limit = max(1, min(limit, 500))
    rows = db.fetch_all(
        """
        SELECT id, username, email, role, created_at
        FROM users
        ORDER BY id DESC
        LIMIT :limit
        """,
        {"limit": safe_limit},
    )
    results = []
    for row in rows:
        record = dict(row)
        record["role"] = _user_role(row)
        results.append(record)
    return results


def count_admins() -> int:
    row = db.fetch_one(
        """
        SELECT COUNT(*) AS total
        FROM users
        WHERE role=:role
        """,
        {"role": ADMIN_ROLE},
    )
    return int(row["total"]) if row else 0


def create_password_reset_token(username, token, expires_at):
    return db.execute(
        """
        INSERT INTO password_reset_tokens(username, token, expires_at)
        VALUES(:username, :token, :expires_at)
        """,
        {"username": username, "token": token, "expires_at": expires_at},
    )


def find_valid_reset_token(token):
    return db.fetch_one(
        """
        SELECT id, username, token, expires_at, used
        FROM password_reset_tokens
        WHERE token=:token AND used=0
        """,
        {"token": token},
    )


def mark_reset_token_used(token):
    db.execute(
        """
        UPDATE password_reset_tokens
        SET used=1
        WHERE token=:token
        """,
        {"token": token},
    )


def update_user_password(username, password):
    db.execute(
        """
        UPDATE users
        SET password=:password
        WHERE username=:username
        """,
        {"username": username, "password": password},
    )
