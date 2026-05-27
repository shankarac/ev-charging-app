#!/usr/bin/env python3
"""Create or update a separate admin console account (not a customer user)."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.db import db
from app.repositories import admin_accounts
from app.services.admin_bootstrap import bootstrap_admin_accounts


def ensure_admin_account(username: str, password: str) -> None:
    account = admin_accounts.upsert_account(username, password)
    print(f"Admin console account ready: {account['username']}")
    print("Sign in at: http://127.0.0.1:8000/admin/login.html")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Create or update EV admin console credentials (separate from customer users)"
    )
    parser.add_argument("--username", required=True, help="Admin console username (e.g. evadmin)")
    parser.add_argument("--password", required=True, help="Admin console password")
    args = parser.parse_args()

    db.initialize()
    bootstrap_admin_accounts()
    ensure_admin_account(args.username, args.password)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
