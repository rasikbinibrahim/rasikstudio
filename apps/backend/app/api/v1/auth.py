from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Path, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, EmailStr
from starlette import status

from app.application.auth.login import LoginRequest, LoginUseCase
from app.application.auth.logout import LogoutUseCase
from app.application.auth.oauth import (
    OAuthCallbackUseCase,
    build_authorize_url,
    consume_oauth_state,
    store_oauth_state,
)
from app.application.auth.refresh import RefreshTokenUseCase
from app.application.auth.register import RegisterRequest, RegisterUseCase
from app.application.auth.token_issuer import TokenPair
from app.core.dependencies import CurrentUserDep, DbDep, RedisDep, SettingsDep
from app.core.errors import AuthError
from app.core.middleware.rate_limiter import limiter
from app.infrastructure.db.repositories.auth_repository import AuthRepository
from app.infrastructure.db.repositories.user_repository import UserRepository

router = APIRouter(prefix="/auth", tags=["auth"])

OAuthProviderPath = Annotated[Literal["github", "google"], Path()]


class RegisterRequestSchema(BaseModel):
    email: EmailStr
    name: str
    password: str


class LoginRequestSchema(BaseModel):
    email: EmailStr
    password: str


class RefreshRequestSchema(BaseModel):
    refresh_token: str


class LogoutRequestSchema(BaseModel):
    refresh_token: str


class TokenResponseSchema(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"

    @classmethod
    def from_pair(cls, pair: TokenPair) -> TokenResponseSchema:
        return cls(
            access_token=pair.access_token, refresh_token=pair.refresh_token, token_type=pair.token_type
        )


class UserResponseSchema(BaseModel):
    id: UUID
    email: str
    name: str
    avatar_url: str | None
    created_at: datetime


@router.post("/register", status_code=status.HTTP_201_CREATED, response_model=TokenResponseSchema)
@limiter.limit("5/minute")
async def register(
    request: Request, body: RegisterRequestSchema, db: DbDep, settings: SettingsDep
) -> TokenResponseSchema:
    use_case = RegisterUseCase(UserRepository(db), AuthRepository(db), settings)
    pair = await use_case.execute(
        RegisterRequest(email=body.email, password=body.password, name=body.name)
    )
    return TokenResponseSchema.from_pair(pair)


@router.post("/login", response_model=TokenResponseSchema)
@limiter.limit("10/minute")
async def login(
    request: Request, body: LoginRequestSchema, db: DbDep, settings: SettingsDep
) -> TokenResponseSchema:
    use_case = LoginUseCase(UserRepository(db), AuthRepository(db), settings)
    pair = await use_case.execute(LoginRequest(email=body.email, password=body.password))
    return TokenResponseSchema.from_pair(pair)


@router.post("/refresh", response_model=TokenResponseSchema)
@limiter.limit("20/minute")
async def refresh(
    request: Request, body: RefreshRequestSchema, db: DbDep, settings: SettingsDep
) -> TokenResponseSchema:
    use_case = RefreshTokenUseCase(UserRepository(db), AuthRepository(db), settings)
    pair = await use_case.execute(body.refresh_token)
    return TokenResponseSchema.from_pair(pair)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(body: LogoutRequestSchema, db: DbDep) -> None:
    await LogoutUseCase(AuthRepository(db)).execute(body.refresh_token)


@router.get("/me", response_model=UserResponseSchema)
async def me(user: CurrentUserDep) -> UserResponseSchema:
    return UserResponseSchema(
        id=user.id, email=user.email, name=user.name, avatar_url=user.avatar_url,
        created_at=user.created_at,
    )


@router.get("/oauth/{provider}")
async def oauth_authorize(
    provider: OAuthProviderPath, settings: SettingsDep, redis: RedisDep
) -> RedirectResponse:
    """Initiates the OAuth2 flow — redirects to the provider's authorization URL
    (AUTHENTICATION.md §2.2). The `state` nonce is stored server-side (Redis, 10-minute TTL) and
    verified+consumed on `/callback`, so a forged callback request (an attacker's own authorization
    `code` paired with a guessed/replayed `state`) can't be used to link an attacker-controlled
    provider account to a victim's session. The desktop app's own OAuth flow (an embedded browser
    view or system browser + local callback) still hasn't been designed — deferred alongside that,
    not overlooked here."""
    url, state = build_authorize_url(provider, settings)
    await store_oauth_state(redis, provider, state)
    return RedirectResponse(url, status_code=status.HTTP_302_FOUND)


@router.get("/oauth/{provider}/callback", response_model=TokenResponseSchema)
@limiter.limit("10/minute")
async def oauth_callback(
    request: Request,
    provider: OAuthProviderPath,
    code: str,
    state: str,
    db: DbDep,
    settings: SettingsDep,
    redis: RedisDep,
) -> TokenResponseSchema:
    if not await consume_oauth_state(redis, provider, state):
        raise AuthError("Invalid or expired OAuth state")
    use_case = OAuthCallbackUseCase(UserRepository(db), AuthRepository(db), settings)
    pair = await use_case.execute(provider=provider, code=code)
    return TokenResponseSchema.from_pair(pair)
