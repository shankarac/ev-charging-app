from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.middleware.sessions import SessionMiddleware

from app.core.auth_session import get_session_user
from app.core.config import BASE_DIR, settings
from app.db import db
from app.routers import auth, bookings, stations

PROTECTED_PAGE_FILES = {
    "dashboard.html",
    "payment.html",
    "station-inbox.html",
}
PROTECTED_PAGE_PATHS = {
    "/dashboard",
    "/dashboard.html",
    "/payment.html",
    "/station-inbox.html",
}


def require_login_page(request: Request):
    if not get_session_user(request):
        return RedirectResponse(url="/login.html", status_code=302)
    return None


class ProtectAuthenticatedPagesMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        static_name = path.rsplit("/", 1)[-1] if path.startswith("/static/") else ""
        needs_login = path in PROTECTED_PAGE_PATHS or static_name in PROTECTED_PAGE_FILES
        if needs_login and not get_session_user(request):
            return RedirectResponse(url="/login.html", status_code=302)
        return await call_next(request)


def create_app():
    db.initialize()

    app = FastAPI(title=settings.app_name)
    app.add_middleware(ProtectAuthenticatedPagesMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.add_middleware(SessionMiddleware, secret_key=settings.session_secret)

    @app.middleware("http")
    async def add_no_cache_headers(request: Request, call_next):
        response = await call_next(request)
        path = request.url.path
        if path.endswith((".html", ".js", ".css")):
            response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
            response.headers["Pragma"] = "no-cache"
            response.headers["Expires"] = "0"
        return response

    app.include_router(auth.router)
    app.include_router(bookings.router)
    app.include_router(stations.router)
    app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")

    @app.get("/")
    def home():
        return RedirectResponse(url="/login.html", status_code=302)

    @app.get("/login.html")
    def login_page():
        return FileResponse(BASE_DIR / "static" / "login.html")

    @app.get("/dashboard")
    def dashboard_shortcut(request: Request):
        redirect = require_login_page(request)
        if redirect:
            return redirect
        return RedirectResponse(url="/dashboard.html", status_code=302)

    @app.get("/register.html")
    def register_page():
        return FileResponse(BASE_DIR / "static" / "register.html")

    @app.get("/forgot-password.html")
    def forgot_password_page():
        return FileResponse(BASE_DIR / "static" / "forgot-password.html")

    @app.get("/dashboard.html")
    def dashboard_page(request: Request):
        redirect = require_login_page(request)
        if redirect:
            return redirect
        return FileResponse(BASE_DIR / "static" / "dashboard.html")

    @app.get("/payment.html")
    def payment_page(request: Request):
        redirect = require_login_page(request)
        if redirect:
            return redirect
        return FileResponse(BASE_DIR / "static" / "payment.html")

    @app.get("/station-inbox.html")
    def station_inbox_page(request: Request):
        redirect = require_login_page(request)
        if redirect:
            return redirect
        return FileResponse(BASE_DIR / "static" / "station-inbox.html")

    return app


app = create_app()
