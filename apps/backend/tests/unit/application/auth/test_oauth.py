from __future__ import annotations

from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

import httpx
import pytest

from app.application.auth.oauth import OAuthCallbackUseCase
from app.core.config import Settings
from app.core.errors import AuthError
from app.domain.models.user import User

# Fakes conforming structurally to what OAuthCallbackUseCase needs — domain/ports/README.md's
# whole rationale for Protocol-based ports: no DB, no inheritance, just matching methods.


class FakeUserRepository:
    def __init__(self) -> None:
        self.by_email: dict[str, User] = {}

    async def get_by_id(self, user_id: UUID) -> User | None:
        return next((u for u in self.by_email.values() if u.id == user_id), None)

    async def get_by_email(self, email: str) -> User | None:
        return self.by_email.get(email)

    async def create(self, user: User) -> User:
        self.by_email[user.email] = user
        return user

    async def update(self, user: User) -> User:
        self.by_email[user.email] = user
        return user


class FakeAuthRepository:
    def __init__(self) -> None:
        self.stored: list[dict[str, Any]] = []

    async def store(self, *, user_id: UUID, token_hash: str, expires_at: datetime) -> None:
        self.stored.append({"user_id": user_id, "token_hash": token_hash, "expires_at": expires_at})


@pytest.fixture
def settings() -> Settings:
    return Settings(
        github_client_id="test-github-id",
        github_client_secret="test-github-secret",
        google_client_id="test-google-id",
        google_client_secret="test-google-secret",
        _env_file=None,
    )  # type: ignore[call-arg]


MockHandler = Callable[[httpx.Request], "Awaitable[httpx.Response] | httpx.Response"]


def _client_for(handler: MockHandler) -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=httpx.MockTransport(handler))  # type: ignore[arg-type]


class TestGitHubOAuth:
    async def test_creates_a_new_user_from_public_email(self, settings: Settings) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            if request.url.path == "/login/oauth/access_token":
                return httpx.Response(200, json={"access_token": "gh-access-token"})
            if request.url.path == "/user":
                return httpx.Response(
                    200, json={"email": "octocat@example.com", "name": "Octocat", "avatar_url": "https://x/a.png"}
                )
            raise AssertionError(f"unexpected request to {request.url}")

        user_repo, auth_repo = FakeUserRepository(), FakeAuthRepository()
        use_case = OAuthCallbackUseCase(user_repo, auth_repo, settings, http_client=_client_for(handler))  # type: ignore[arg-type]

        pair = await use_case.execute(provider="github", code="the-code")

        assert pair.access_token
        assert "octocat@example.com" in user_repo.by_email
        assert len(auth_repo.stored) == 1

    async def test_falls_back_to_emails_endpoint_when_profile_email_is_private(
        self, settings: Settings
    ) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            if request.url.path == "/login/oauth/access_token":
                return httpx.Response(200, json={"access_token": "gh-access-token"})
            if request.url.path == "/user":
                return httpx.Response(200, json={"email": None, "name": "Private Email", "login": "priv"})
            if request.url.path == "/user/emails":
                return httpx.Response(
                    200,
                    json=[
                        {"email": "secondary@example.com", "primary": False, "verified": True},
                        {"email": "primary@example.com", "primary": True, "verified": True},
                    ],
                )
            raise AssertionError(f"unexpected request to {request.url}")

        user_repo, auth_repo = FakeUserRepository(), FakeAuthRepository()
        use_case = OAuthCallbackUseCase(user_repo, auth_repo, settings, http_client=_client_for(handler))  # type: ignore[arg-type]

        await use_case.execute(provider="github", code="the-code")

        assert "primary@example.com" in user_repo.by_email

    async def test_no_verified_email_anywhere_raises_auth_error(self, settings: Settings) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            if request.url.path == "/login/oauth/access_token":
                return httpx.Response(200, json={"access_token": "gh-access-token"})
            if request.url.path == "/user":
                return httpx.Response(200, json={"email": None, "login": "noemail"})
            if request.url.path == "/user/emails":
                return httpx.Response(
                    200, json=[{"email": "x@example.com", "primary": True, "verified": False}]
                )
            raise AssertionError(f"unexpected request to {request.url}")

        use_case = OAuthCallbackUseCase(
            FakeUserRepository(), FakeAuthRepository(), settings, http_client=_client_for(handler)  # type: ignore[arg-type]
        )

        with pytest.raises(AuthError):
            await use_case.execute(provider="github", code="the-code")

    async def test_reuses_an_existing_user_with_the_same_email(self, settings: Settings) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            if request.url.path == "/login/oauth/access_token":
                return httpx.Response(200, json={"access_token": "gh-access-token"})
            if request.url.path == "/user":
                return httpx.Response(200, json={"email": "existing@example.com", "name": "New Name"})
            raise AssertionError(f"unexpected request to {request.url}")

        user_repo, auth_repo = FakeUserRepository(), FakeAuthRepository()
        existing = User(
            id=UUID(int=1), email="existing@example.com", name="Existing", avatar_url=None,
            auth_provider="local", hashed_password="hashed", is_active=True, settings={},
            created_at=datetime.now(UTC), updated_at=datetime.now(UTC),
        )
        user_repo.by_email["existing@example.com"] = existing

        use_case = OAuthCallbackUseCase(user_repo, auth_repo, settings, http_client=_client_for(handler))  # type: ignore[arg-type]
        await use_case.execute(provider="github", code="the-code")

        # Still the original user (name unchanged) — not silently overwritten by the OAuth profile.
        assert user_repo.by_email["existing@example.com"].name == "Existing"
        assert len(user_repo.by_email) == 1


class TestGoogleOAuth:
    async def test_creates_a_new_user(self, settings: Settings) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            if request.url.path == "/token":
                return httpx.Response(200, json={"access_token": "google-access-token"})
            if request.url.path == "/oauth2/v3/userinfo":
                return httpx.Response(
                    200, json={"email": "googler@example.com", "name": "Googler", "picture": "https://x/a.png"}
                )
            raise AssertionError(f"unexpected request to {request.url}")

        user_repo, auth_repo = FakeUserRepository(), FakeAuthRepository()
        use_case = OAuthCallbackUseCase(user_repo, auth_repo, settings, http_client=_client_for(handler))  # type: ignore[arg-type]

        pair = await use_case.execute(provider="google", code="the-code")

        assert pair.access_token
        assert "googler@example.com" in user_repo.by_email

    async def test_no_email_in_userinfo_raises_auth_error(self, settings: Settings) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            if request.url.path == "/token":
                return httpx.Response(200, json={"access_token": "google-access-token"})
            if request.url.path == "/oauth2/v3/userinfo":
                return httpx.Response(200, json={"name": "No Email"})
            raise AssertionError(f"unexpected request to {request.url}")

        use_case = OAuthCallbackUseCase(
            FakeUserRepository(), FakeAuthRepository(), settings, http_client=_client_for(handler)  # type: ignore[arg-type]
        )

        with pytest.raises(AuthError):
            await use_case.execute(provider="google", code="the-code")
