from fastapi import Request


def normalize_user_record(user) -> dict:
    if isinstance(user, dict):
        return user
    return dict(user)


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
    }


def clear_session_user(request: Request) -> None:
    request.session.clear()
