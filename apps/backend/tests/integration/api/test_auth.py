from collections.abc import AsyncGenerator
from uuid import uuid4

import pytest
from fastapi import FastAPI
from freezegun import freeze_time
from httpx import ASGITransport, AsyncClient

from app.core.middleware.rate_limiter import limiter

AUTH = "/api/v1/auth"


@pytest.fixture(autouse=True)
def _reset_limiter_counters() -> None:
    # `limiter` is a module-level singleton shared by every test in this process — without a
    # reset, one test tripping /login's or /register's limit would poison the next test's
    # counters for the same client key (the test client always uses the same source IP).
    limiter.reset()


@pytest.fixture
async def client(test_app: FastAPI) -> AsyncGenerator[AsyncClient, None]:
    transport = ASGITransport(app=test_app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


async def _register(client: AsyncClient, email: str | None = None) -> dict[str, str]:
    # Random by default rather than a fixed literal: integration tests share one long-lived
    # Postgres container (session-scoped) across every test module, including
    # tests/integration/infrastructure/test_repositories.py — a hardcoded email here could
    # collide with a hardcoded email there and fail on a UNIQUE constraint that has nothing to do
    # with what either test is actually checking.
    email = email or f"{uuid4()}@example.com"
    response = await client.post(
        f"{AUTH}/register",
        json={"email": email, "name": "Alice", "password": "correct-horse-battery-staple"},
    )
    assert response.status_code == 201
    return response.json()  # type: ignore[no-any-return]


class TestRegister:
    async def test_creates_user_and_returns_token_pair(self, client: AsyncClient) -> None:
        body = await _register(client)

        assert "access_token" in body
        assert "refresh_token" in body
        assert body["token_type"] == "bearer"

    async def test_duplicate_email_is_rejected_as_conflict(self, client: AsyncClient) -> None:
        await _register(client, email="dupe@example.com")

        response = await client.post(
            f"{AUTH}/register",
            json={"email": "dupe@example.com", "name": "Someone Else", "password": "another-password"},
        )

        assert response.status_code == 409
        assert response.json()["error"]["code"] == "email_taken"

    async def test_short_password_is_rejected(self, client: AsyncClient) -> None:
        response = await client.post(
            f"{AUTH}/register",
            json={"email": "short@example.com", "name": "Short", "password": "abc123"},
        )

        assert response.status_code == 422
        assert response.json()["error"]["code"] == "validation_error"


class TestLogin:
    async def test_correct_credentials_return_token_pair(self, client: AsyncClient) -> None:
        await _register(client, email="login-ok@example.com")

        response = await client.post(
            f"{AUTH}/login",
            json={"email": "login-ok@example.com", "password": "correct-horse-battery-staple"},
        )

        assert response.status_code == 200
        assert "access_token" in response.json()

    async def test_wrong_password_returns_401_not_404(self, client: AsyncClient) -> None:
        await _register(client, email="login-wrong@example.com")

        response = await client.post(
            f"{AUTH}/login", json={"email": "login-wrong@example.com", "password": "not-the-password"}
        )

        assert response.status_code == 401
        assert response.json()["error"]["code"] == "auth_error"

    async def test_nonexistent_email_returns_401_not_404(self, client: AsyncClient) -> None:
        # Same shape as a wrong password — must not leak whether the email is registered.
        response = await client.post(
            f"{AUTH}/login", json={"email": "nobody-here@example.com", "password": "whatever"}
        )

        assert response.status_code == 401


class TestMe:
    async def test_returns_current_user_when_authenticated(self, client: AsyncClient) -> None:
        tokens = await _register(client, email="me@example.com")

        response = await client.get(
            f"{AUTH}/me", headers={"Authorization": f"Bearer {tokens['access_token']}"}
        )

        assert response.status_code == 200
        assert response.json()["email"] == "me@example.com"

    async def test_missing_token_returns_401(self, client: AsyncClient) -> None:
        response = await client.get(f"{AUTH}/me")

        assert response.status_code == 401
        assert response.json()["error"]["code"] == "missing_token"

    async def test_expired_token_returns_401_with_token_expired_code(
        self, client: AsyncClient
    ) -> None:
        with freeze_time("2026-01-01T00:00:00Z"):
            tokens = await _register(client, email="expiring@example.com")

        with freeze_time("2026-01-01T00:31:00Z"):  # past the 30-minute access-token expiry
            response = await client.get(
                f"{AUTH}/me", headers={"Authorization": f"Bearer {tokens['access_token']}"}
            )

        assert response.status_code == 401
        assert response.json()["error"]["code"] == "token_expired"


class TestRefresh:
    async def test_valid_refresh_token_returns_new_pair_and_rotates(self, client: AsyncClient) -> None:
        tokens = await _register(client, email="refresh@example.com")

        response = await client.post(f"{AUTH}/refresh", json={"refresh_token": tokens["refresh_token"]})

        assert response.status_code == 200
        new_tokens = response.json()
        assert new_tokens["refresh_token"] != tokens["refresh_token"]

    async def test_reusing_a_rotated_token_is_rejected_and_revokes_the_whole_family(
        self, client: AsyncClient
    ) -> None:
        tokens = await _register(client, email="reuse@example.com")
        first_refresh = tokens["refresh_token"]

        rotated = (
            await client.post(f"{AUTH}/refresh", json={"refresh_token": first_refresh})
        ).json()

        # Reuse: presenting the now-dead original token again.
        reuse_response = await client.post(f"{AUTH}/refresh", json={"refresh_token": first_refresh})
        assert reuse_response.status_code == 401
        assert reuse_response.json()["error"]["code"] == "token_reuse_detected"

        # The token issued by the rotation above must ALSO now be dead — reuse detection kills
        # every session for the user, not just the one token that was replayed.
        second_response = await client.post(
            f"{AUTH}/refresh", json={"refresh_token": rotated["refresh_token"]}
        )
        assert second_response.status_code == 401

    async def test_unknown_refresh_token_is_rejected(self, client: AsyncClient) -> None:
        response = await client.post(f"{AUTH}/refresh", json={"refresh_token": "not-a-real-token"})

        assert response.status_code == 401

    async def test_access_token_cannot_be_used_as_a_refresh_token(self, client: AsyncClient) -> None:
        tokens = await _register(client, email="wrong-token-type@example.com")

        response = await client.post(f"{AUTH}/refresh", json={"refresh_token": tokens["access_token"]})

        assert response.status_code == 401


class TestLogout:
    async def test_revokes_the_refresh_token(self, client: AsyncClient) -> None:
        tokens = await _register(client, email="logout@example.com")

        logout_response = await client.post(
            f"{AUTH}/logout", json={"refresh_token": tokens["refresh_token"]}
        )
        assert logout_response.status_code == 204

        refresh_response = await client.post(
            f"{AUTH}/refresh", json={"refresh_token": tokens["refresh_token"]}
        )
        assert refresh_response.status_code == 401


class TestRateLimiting:
    async def test_login_returns_429_after_exceeding_the_configured_limit(
        self, client: AsyncClient
    ) -> None:
        await _register(client, email="ratelimited@example.com")

        responses = [
            await client.post(
                f"{AUTH}/login",
                json={"email": "ratelimited@example.com", "password": "wrong-on-purpose"},
            )
            for _ in range(11)
        ]

        assert responses[-1].status_code == 429
        assert responses[-1].json()["error"]["code"] == "rate_limited"
