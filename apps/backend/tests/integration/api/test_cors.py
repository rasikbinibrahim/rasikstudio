from httpx import ASGITransport, AsyncClient

from app.main import create_app

# Doesn't need the Postgres/Redis testcontainers (unlike test_health.py) — CORS is enforced by
# middleware ahead of any route that would touch either, so building the app directly here avoids
# paying for containers this test doesn't exercise.


async def test_allowed_origin_gets_cors_headers() -> None:
    app = create_app()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/health", headers={"Origin": "http://localhost:5173"})

    assert response.headers.get("access-control-allow-origin") == "http://localhost:5173"


async def test_disallowed_origin_gets_no_cors_header() -> None:
    app = create_app()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/health", headers={"Origin": "https://evil.example"})

    assert "access-control-allow-origin" not in response.headers


async def test_preflight_for_disallowed_origin_is_rejected() -> None:
    app = create_app()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.options(
            "/health",
            headers={
                "Origin": "https://evil.example",
                "Access-Control-Request-Method": "GET",
            },
        )

    assert "access-control-allow-origin" not in response.headers
