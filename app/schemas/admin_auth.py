from pydantic import BaseModel, model_validator


class AdminConsoleLogin(BaseModel):
    password: str
    username: str | None = None
    email: str | None = None

    @model_validator(mode="after")
    def resolve_username(self):
        ident = (self.username or self.email or "").strip()
        if not ident:
            raise ValueError("Admin username is required")
        if "@" in ident:
            raise ValueError("Use admin username, not customer email")
        if len(ident) > 64:
            raise ValueError("Admin username is too long")
        self.username = ident.lower()
        return self
