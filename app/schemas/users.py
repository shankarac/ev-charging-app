from pydantic import BaseModel, field_validator, model_validator

from app.core.email_policy import normalize_email


class UserLogin(BaseModel):
    username: str
    password: str

    @field_validator("username")
    @classmethod
    def username_must_be_email(cls, value: str) -> str:
        return normalize_email(value, enforce_allowed_domains=False)


class UserEmailLogin(BaseModel):
    email: str
    password: str

    @field_validator("email")
    @classmethod
    def email_must_be_valid(cls, value: str) -> str:
        return normalize_email(value, enforce_allowed_domains=False)


class UserRegister(BaseModel):
    email: str
    password: str
    confirm_password: str

    @field_validator("email")
    @classmethod
    def email_must_be_valid(cls, value: str) -> str:
        return normalize_email(value, enforce_allowed_domains=False)

    @model_validator(mode="after")
    def passwords_must_match(self):
        if self.password != self.confirm_password:
            raise ValueError("Passwords do not match")
        return self


class ForgotPasswordRequest(BaseModel):
    email: str

    @field_validator("email")
    @classmethod
    def email_must_be_valid(cls, value: str) -> str:
        return normalize_email(value, enforce_allowed_domains=False)


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str
