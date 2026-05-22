import re

from app.core.config import settings

EMAIL_PATTERN = re.compile(
    r"^[a-zA-Z0-9](?:[a-zA-Z0-9._%+-]{0,62}[a-zA-Z0-9])?"
    r"@[a-zA-Z0-9](?:[a-zA-Z0-9.-]{0,62}[a-zA-Z0-9])?"
    r"\.[a-zA-Z]{2,}$"
)
ALLOWED_EMAIL_CHARS = re.compile(r"^[a-zA-Z0-9@._%+-]+$")


def email_format_error(email: str) -> str | None:
    if ".." in email:
        return "Email cannot contain consecutive dots (..)."
    if "\\" in email:
        return "Email cannot contain backslash (\\)."
    if not ALLOWED_EMAIL_CHARS.match(email):
        return (
            "Email contains invalid symbols. "
            "Use only letters, numbers, @, ., _, %, +, or -."
        )

    local, domain = email.split("@", 1)
    if local.startswith(".") or local.endswith("."):
        return "Email cannot start or end the name part with a dot."
    if domain.startswith(".") or domain.endswith("."):
        return "Email cannot start or end the domain with a dot."
    if "." not in domain:
        return "Enter a valid email address (e.g. name@company.com)."
    return None


def is_email_domain_allowed(email: str) -> bool:
    domains = settings.allowed_email_domains
    if not domains:
        return True
    domain = email.split("@", 1)[1]
    return domain in domains


def allowed_domains_message() -> str:
    domains = settings.allowed_email_domains
    if not domains:
        return ""
    formatted = ", ".join(f"@{domain}" for domain in domains)
    return f"Only {formatted} email addresses are allowed"


def normalize_email(value: str, *, enforce_allowed_domains: bool = False) -> str:
    email = (value or "").strip().lower().rstrip(".")
    if email.count("@") != 1 or email.startswith("@") or email.endswith("@"):
        raise ValueError("Enter a valid email address (e.g. name@company.com)")

    format_error = email_format_error(email)
    if format_error:
        raise ValueError(format_error)

    if not EMAIL_PATTERN.match(email):
        raise ValueError("Enter a valid email address (e.g. name@company.com)")

    if enforce_allowed_domains and not is_email_domain_allowed(email):
        message = allowed_domains_message()
        raise ValueError(message or "This email domain is not allowed")
    return email
