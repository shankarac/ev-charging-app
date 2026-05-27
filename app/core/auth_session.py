from fastapi import Request

USER_ROLE = "user"
ADMIN_ROLE = "admin"
ADMIN_CONSOLE_AUTH = "admin_console"


def normalize_user_record(user) -> dict:
    if isinstance(user, dict):
        record = user
    else:
        record = dict(user)
    role = (record.get("role") or USER_ROLE).strip().lower()
    if role not in {ADMIN_ROLE, USER_ROLE}:
        role = USER_ROLE
    record["role"] = role
    return record


def get_session_user(request: Request) -> dict | None:
    user = request.session.get("user")
    if not user or not user.get("username"):
        return None
    return user


def set_session_user(request: Request, user, login_email: str = "") -> None:
    record = normalize_user_record(user)
    stored_email = (record.get("email") or "").strip()
    login_email = (login_email or "").strip()
    request.session["user"] = {
        "username": record["username"],
        "email": login_email or stored_email,
        "role": record.get("role") or USER_ROLE,
    }


def clear_session_user(request: Request) -> None:
    request.session.clear()


def set_admin_console_session(request: Request, username: str) -> None:
    request.session["user"] = {
        "username": str(username or "").strip(),
        "email": "",
        "role": ADMIN_ROLE,
        "auth_kind": ADMIN_CONSOLE_AUTH,
    }


def is_admin_console_session(request: Request) -> bool:
    user = get_session_user(request)
    return bool(user and user.get("auth_kind") == ADMIN_CONSOLE_AUTH)
