from app.core.config import settings
from app.repositories import admin_accounts


def bootstrap_admin_accounts() -> None:
    username = (settings.admin_bootstrap_username or "").strip().lower()
    password = (settings.admin_bootstrap_password or "").strip()

    if not username and (settings.admin_bootstrap_email or "").strip() and password:
        username = "admin"

    if not username or not password:
        return

    admin_accounts.upsert_account(username, password)
