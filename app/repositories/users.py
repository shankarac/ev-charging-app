from app.core.email_policy import normalize_email
from app.db import db


def _normalize_lookup_email(email: str) -> str | None:
    try:
        return normalize_email(email, enforce_allowed_domains=False)
    except ValueError:
        return None


def find_user(username):
    return db.fetch_one(
        """
        SELECT id, username, password
        FROM users
        WHERE username=:username
        """,
        {"username": username},
    )


def find_user_contact(username):
    return db.fetch_one(
        """
        SELECT id, username, email
        FROM users
        WHERE username=:username
        """,
        {"username": username},
    )


def find_user_by_email(email):
    normalized = _normalize_lookup_email(email)
    if not normalized:
        return None
    return db.fetch_one(
        """
        SELECT id, username, email
        FROM users
        WHERE lower(email)=:email
        """,
        {"email": normalized},
    )


def find_user_by_username_or_email(identifier):
    return db.fetch_one(
        """
        SELECT id, username, email
        FROM users
        WHERE username=:identifier OR email=:identifier
        """,
        {"identifier": identifier},
    )


def find_user_by_username_credentials(username, password):
    return db.fetch_one(
        """
        SELECT id, username, email
        FROM users
        WHERE username=:username AND password=:password
        """,
        {"username": username, "password": password},
    )


def find_user_by_email_credentials(email, password):
    normalized = _normalize_lookup_email(email)
    if not normalized:
        return None
    return db.fetch_one(
        """
        SELECT id, username, email
        FROM users
        WHERE lower(email)=:email AND password=:password
        """,
        {"email": normalized, "password": password},
    )


def create_user(username, email, password):
    return db.execute(
        """
        INSERT INTO users(username, email, password)
        VALUES(:username, :email, :password)
        """,
        {"username": username, "email": email, "password": password},
    )


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
