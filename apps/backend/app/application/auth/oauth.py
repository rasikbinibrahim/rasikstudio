from __future__ import annotations

import secrets
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Literal
from uuid import uuid4

import httpx

from app.application.auth.token_issuer import TokenPair, issue_token_pair
from app.core.config import Settings
from app.core.errors import AuthError, ValidationError
from app.domain.models.user import User
from app.domain.ports.user_repository import UserRepository
from app.infrastructure.db.repositories.auth_repository import AuthRepository

OAuthProviderName = Literal["github", "google"]

_GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token"
_GITHUB_USER_URL = "https://api.github.com/user"
_GITHUB_EMAILS_URL = "https://api.github.com/user/emails"
_GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
_GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"


@dataclass(frozen=True, slots=True)
class OAuthProfile:
    email: str
    name: str
    avatar_url: str | None


def callback_redirect_uri(provider: OAuthProviderName, settings: Settings) -> str:
    return f"{settings.oauth_redirect_base_url}/api/v1/auth/oauth/{provider}/callback"


def build_authorize_url(provider: OAuthProviderName, settings: Settings) -> tuple[str, str]:
    """Returns (authorize_url, state) — state is a CSRF nonce the caller is responsible for
    stashing (e.g. in a short-lived cookie or Redis key) and checking against the value the
    provider echoes back on `/callback`."""
    state = secrets.token_urlsafe(24)
    redirect_uri = callback_redirect_uri(provider, settings)

    if provider == "github":
        url = (
            "https://github.com/login/oauth/authorize"
            f"?client_id={settings.github_client_id}"
            f"&redirect_uri={redirect_uri}"
            f"&scope=read:user user:email"
            f"&state={state}"
        )
    elif provider == "google":
        url = (
            "https://accounts.google.com/o/oauth2/v2/auth"
            f"?client_id={settings.google_client_id}"
            f"&redirect_uri={redirect_uri}"
            "&response_type=code"
            "&scope=openid email profile"
            f"&state={state}"
        )
    else:
        raise ValidationError(f"Unsupported OAuth provider: {provider}")

    return url, state


class OAuthCallbackUseCase:
    """GitHub/Google authorization-code exchange → profile fetch → upsert user → issue tokens
    (AUTHENTICATION.md §2.2). `http_client` is injectable so tests can supply a mocked transport
    instead of making real network calls; production code leaves it unset and gets a real client
    scoped to the single call."""

    def __init__(
        self,
        user_repo: UserRepository,
        auth_repo: AuthRepository,
        settings: Settings,
        http_client: httpx.AsyncClient | None = None,
    ) -> None:
        self._user_repo = user_repo
        self._auth_repo = auth_repo
        self._settings = settings
        self._http_client = http_client

    async def execute(self, *, provider: OAuthProviderName, code: str) -> TokenPair:
        profile = await self._fetch_profile(provider, code)

        user = await self._user_repo.get_by_email(profile.email)
        if user is None:
            now = datetime.now(UTC)
            user = await self._user_repo.create(
                User(
                    id=uuid4(),
                    email=profile.email,
                    name=profile.name,
                    avatar_url=profile.avatar_url,
                    auth_provider=provider,
                    hashed_password=None,
                    is_active=True,
                    settings={},
                    created_at=now,
                    updated_at=now,
                )
            )

        return await issue_token_pair(user, self._auth_repo, self._settings)

    async def _fetch_profile(self, provider: OAuthProviderName, code: str) -> OAuthProfile:
        owns_client = self._http_client is None
        client = self._http_client or httpx.AsyncClient()
        try:
            if provider == "github":
                return await self._fetch_github_profile(client, code)
            if provider == "google":
                return await self._fetch_google_profile(client, code)
            raise ValidationError(f"Unsupported OAuth provider: {provider}")
        finally:
            if owns_client:
                await client.aclose()

    async def _fetch_github_profile(self, client: httpx.AsyncClient, code: str) -> OAuthProfile:
        token_response = await client.post(
            _GITHUB_TOKEN_URL,
            data={
                "client_id": self._settings.github_client_id,
                "client_secret": self._settings.github_client_secret,
                "code": code,
                "redirect_uri": callback_redirect_uri("github", self._settings),
            },
            headers={"Accept": "application/json"},
        )
        token_response.raise_for_status()
        access_token = token_response.json().get("access_token")
        if not access_token:
            raise AuthError("GitHub did not return an access token")

        auth_header = {"Authorization": f"Bearer {access_token}", "Accept": "application/json"}
        user_response = await client.get(_GITHUB_USER_URL, headers=auth_header)
        user_response.raise_for_status()
        data = user_response.json()

        email = data.get("email")
        if not email:
            # GitHub only includes `email` on /user if the user made it public — fall back to the
            # dedicated emails endpoint and use the primary, verified address.
            emails_response = await client.get(_GITHUB_EMAILS_URL, headers=auth_header)
            emails_response.raise_for_status()
            primary = next(
                (e for e in emails_response.json() if e.get("primary") and e.get("verified")), None
            )
            email = primary["email"] if primary else None
        if not email:
            raise AuthError("GitHub account has no verified email address")

        return OAuthProfile(
            email=email, name=data.get("name") or data.get("login") or "GitHub User",
            avatar_url=data.get("avatar_url"),
        )

    async def _fetch_google_profile(self, client: httpx.AsyncClient, code: str) -> OAuthProfile:
        token_response = await client.post(
            _GOOGLE_TOKEN_URL,
            data={
                "client_id": self._settings.google_client_id,
                "client_secret": self._settings.google_client_secret,
                "code": code,
                "redirect_uri": callback_redirect_uri("google", self._settings),
                "grant_type": "authorization_code",
            },
        )
        token_response.raise_for_status()
        access_token = token_response.json().get("access_token")
        if not access_token:
            raise AuthError("Google did not return an access token")

        user_response = await client.get(
            _GOOGLE_USERINFO_URL, headers={"Authorization": f"Bearer {access_token}"}
        )
        user_response.raise_for_status()
        data = user_response.json()

        email = data.get("email")
        if not email:
            raise AuthError("Google account has no email address")

        return OAuthProfile(
            email=email, name=data.get("name") or "Google User", avatar_url=data.get("picture")
        )
