from fastapi import APIRouter, Request
from datetime import datetime, timedelta, timezone
import secrets
from urllib.parse import urlencode
import requests
from fastapi.responses import JSONResponse, RedirectResponse

from app.core.auth_session import (
    clear_session_user,
    get_session_user,
    set_admin_console_session,
    set_session_user,
)
from app.core.config import settings
from app.core.email_policy import allowed_domains_message, normalize_email
from app.repositories import admin_accounts, users
from app.repositories.users import ADMIN_ROLE
from app.schemas.users import (
    ForgotPasswordRequest,
    ResetPasswordRequest,
    UserEmailLogin,
    UserLogin,
    UserRegister,
)


router = APIRouter(tags=["auth"])


def get_google_redirect_uri(request: Request):
    if settings.google_redirect_uri:
        return settings.google_redirect_uri
    return str(request.url_for("google_callback"))


def google_failure(reason: str):
    return RedirectResponse(f"/login.html?oauth=failed&reason={reason}")


@router.get("/auth/email-policy")
def email_policy():
    domains = settings.allowed_email_domains
    return {
        "allowed_domains": domains,
        "message": allowed_domains_message(),
    }


@router.post("/register")
def register(user: UserRegister):
    existing_email = users.find_user_by_email(user.email)

    if existing_email:
        return {"message": "User already exists"}

    base_username = user.email.split("@")[0]
    username = base_username
    suffix = 1
    while users.find_user(username):
        suffix += 1
        username = f"{base_username}{suffix}"

    users.create_user(username, user.email, user.password)
    return {"message": "Registration successful"}


@router.get("/auth/session")
def auth_session(request: Request):
    user = get_session_user(request)
    if not user:
        return JSONResponse({"authenticated": False}, status_code=401)

    db_user = users.find_user_contact(user["username"])
    if db_user:
        user["role"] = db_user.get("role", "user")
        request.session["user"]["role"] = user["role"]

    return {
        "authenticated": True,
        "username": user["username"],
        "email": user.get("email", ""),
        "role": user.get("role", "user"),
    }


@router.post("/logout")
def logout(request: Request):
    clear_session_user(request)
    return {"message": "Logged out"}


@router.post("/login")
def login(user: UserLogin, request: Request):
    valid_user = users.find_user_by_email_credentials(user.username, user.password)

    if valid_user:
        if valid_user.get("role") == ADMIN_ROLE:
            return {
                "message": "Admin accounts must use the admin sign-in page at /admin/login.html",
                "success": False,
                "admin_login_required": True,
            }
        set_session_user(request, valid_user, login_email=user.username)
        session_email = user.username
        return {
            "message": "Login successful",
            "username": valid_user["username"],
            "email": session_email,
        }

    return {"message": "Invalid credentials"}


@router.post("/login-email")
def login_with_email(user: UserEmailLogin, request: Request):
    existing_user = users.find_user_by_email(user.email)
    if not existing_user:
        return {
            "message": "No account found for this email. Please create an account first.",
            "success": False,
        }

    valid_user = users.find_user_by_email_credentials(user.email, user.password)
    if valid_user:
        set_session_user(request, valid_user, login_email=user.email)
        return {
            "message": "Login successful",
            "success": True,
            "username": valid_user["username"],
            "email": user.email,
        }

    return {
        "message": "Incorrect password. Try again or use Forgot password.",
        "success": False,
    }


@router.post("/auth/admin/login")
async def admin_login(request: Request):
    try:
        body = await request.json()
    except Exception:
        body = {}

    if not isinstance(body, dict):
        body = {}

    username = str(body.get("username") or body.get("email") or "").strip().lower()
    password = str(body.get("password") or "")

    if not username or not password:
        return JSONResponse(
            {
                "message": "Enter admin username and password.",
                "success": False,
            },
            status_code=400,
        )

    if "@" in username:
        return JSONResponse(
            {
                "message": "Use admin username, not a customer email address.",
                "success": False,
            },
            status_code=400,
        )

    account = admin_accounts.verify_credentials(username, password)
    if not account:
        return JSONResponse(
            {
                "message": "Invalid admin username or password. Customer accounts cannot sign in here.",
                "success": False,
            },
            status_code=401,
        )

    set_admin_console_session(request, account["username"])
    return {
        "message": "Admin login successful",
        "success": True,
        "username": account["username"],
        "redirect": "/admin.html",
    }


@router.post("/forgot-password")
def forgot_password(payload: ForgotPasswordRequest):
    user = users.find_user_by_email(payload.email)
    if not user:
        return {"message": "If this email exists, reset instructions were created."}

    token = secrets.token_urlsafe(16)
    expires_at = (
        datetime.now(timezone.utc) + timedelta(minutes=15)
    ).isoformat()
    users.create_password_reset_token(user["username"], token, expires_at)

    # NOTE: In production, email this token. For now, return it for UI demo/testing.
    return {
        "message": "Reset token generated. Use it to reset password.",
        "reset_token": token,
        "expires_in_minutes": 15,
    }


@router.post("/reset-password")
def reset_password(payload: ResetPasswordRequest):
    record = users.find_valid_reset_token(payload.token)
    if not record:
        return {"message": "Invalid or expired reset token"}

    expires_at = datetime.fromisoformat(record["expires_at"])
    if datetime.now(timezone.utc) > expires_at:
        return {"message": "Invalid or expired reset token"}

    users.update_user_password(record["username"], payload.new_password)
    users.mark_reset_token_used(payload.token)
    return {"message": "Password reset successful"}


@router.get("/auth/google/start")
def google_start(request: Request):
    if not settings.google_client_id or not settings.google_client_secret:
        return google_failure("google_not_configured")

    state = secrets.token_urlsafe(16)
    request.session["oauth_state"] = state
    redirect_uri = get_google_redirect_uri(request)
    params = urlencode(
        {
            "client_id": settings.google_client_id,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": "openid email profile",
            "state": state,
            "prompt": "select_account",
            "access_type": "online",
            "include_granted_scopes": "true",
        }
    )
    return RedirectResponse(f"https://accounts.google.com/o/oauth2/v2/auth?{params}")


@router.get("/auth/google/callback")
def google_callback(request: Request, code: str = "", state: str = ""):
    oauth_error = request.query_params.get("error")
    if oauth_error:
        return google_failure(f"google_{oauth_error}")

    if not code or not state:
        return google_failure("missing_code_or_state")

    session_state = request.session.get("oauth_state")
    if not session_state or session_state != state:
        return google_failure("state_mismatch")

    token_response = requests.post(
        "https://oauth2.googleapis.com/token",
        data={
            "code": code,
            "client_id": settings.google_client_id,
            "client_secret": settings.google_client_secret,
            "redirect_uri": get_google_redirect_uri(request),
            "grant_type": "authorization_code",
        },
        timeout=10,
    )
    if token_response.status_code != 200:
        return google_failure("token_exchange_failed")

    token_data = token_response.json()
    access_token = token_data.get("access_token")
    if not access_token:
        return google_failure("missing_access_token")

    userinfo_response = requests.get(
        "https://www.googleapis.com/oauth2/v3/userinfo",
        headers={"Authorization": f"Bearer {access_token}"},
        timeout=10,
    )
    if userinfo_response.status_code != 200:
        return google_failure("userinfo_failed")

    userinfo = userinfo_response.json()
    email = userinfo.get("email")
    if not email:
        return google_failure("missing_email")

    try:
        email = normalize_email(email, enforce_allowed_domains=False)
    except ValueError:
        return google_failure("email_domain_not_allowed")

    user = users.find_user_by_email(email)
    if not user:
        base_username = email.split("@")[0]
        username = base_username
        suffix = 1
        while users.find_user(username):
            suffix += 1
            username = f"{base_username}{suffix}"
        users.create_user(username, email, secrets.token_urlsafe(24))
        user = users.find_user_by_email(email)

    if not user:
        return google_failure("user_create_failed")

    set_session_user(request, user, login_email=email)
    return RedirectResponse("/dashboard.html")
