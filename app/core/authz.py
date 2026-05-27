from fastapi import HTTPException, Request

from app.core.auth_session import ADMIN_CONSOLE_AUTH, get_session_user, is_admin_console_session
from app.repositories import users

ADMIN_ROLE = "admin"
USER_ROLE = "user"


def is_admin(user: dict | None) -> bool:
    return bool(user and user.get("auth_kind") == ADMIN_CONSOLE_AUTH)


def refresh_session_role(request: Request, user: dict) -> dict:
    db_user = users.find_user_contact(user["username"])
    if db_user:
        user["role"] = db_user.get("role", USER_ROLE)
        request.session["user"]["role"] = user["role"]
    return user


def require_session_user(request: Request) -> dict:
    user = get_session_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    return refresh_session_role(request, user)


def resolve_session_admin(request: Request) -> dict | None:
    user = get_session_user(request)
    if not user:
        return None
    user = refresh_session_role(request, user)
    return user if is_admin(user) else None


def require_admin(request: Request) -> dict:
    admin = resolve_session_admin(request)
    if not admin:
        raise HTTPException(status_code=403, detail="Admin console sign-in required")
    return admin
