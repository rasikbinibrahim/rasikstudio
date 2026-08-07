from uuid import uuid4

import jwt
import pytest
from freezegun import freeze_time

from app.core.config import Settings
from app.core.security import (
    create_access_token,
    decrypt_secret,
    encrypt_secret,
    generate_machine_id,
    generate_refresh_token,
    hash_password,
    hash_refresh_token,
    verify_password,
)


@pytest.fixture
def settings() -> Settings:
    return Settings(_env_file=None)  # type: ignore[call-arg]


class TestPasswords:
    def test_hash_then_verify_round_trips(self) -> None:
        hashed = hash_password("correct-horse-battery-staple")

        assert verify_password("correct-horse-battery-staple", hashed)

    def test_wrong_password_does_not_verify(self) -> None:
        hashed = hash_password("correct-horse-battery-staple")

        assert not verify_password("wrong-password", hashed)

    def test_same_password_hashes_differently_each_time(self) -> None:
        # bcrypt salts randomly per call — two hashes of the same password must differ.
        assert hash_password("same-password") != hash_password("same-password")


class TestAccessToken:
    def test_encode_then_decode_round_trips_claims(self, settings: Settings) -> None:
        user_id = uuid4()
        token = create_access_token(user_id=user_id, email="alice@example.com", settings=settings)

        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.jwt_algorithm])

        assert payload["sub"] == str(user_id)
        assert payload["email"] == "alice@example.com"
        assert "iat" in payload
        assert "exp" in payload
        assert "jti" in payload

    def test_two_tokens_for_the_same_user_have_different_jti(self, settings: Settings) -> None:
        user_id = uuid4()
        token_a = create_access_token(user_id=user_id, email="a@example.com", settings=settings)
        token_b = create_access_token(user_id=user_id, email="a@example.com", settings=settings)

        claims_a = jwt.decode(token_a, settings.secret_key, algorithms=[settings.jwt_algorithm])
        claims_b = jwt.decode(token_b, settings.secret_key, algorithms=[settings.jwt_algorithm])
        assert claims_a["jti"] != claims_b["jti"]

    def test_expired_token_raises_on_decode(self, settings: Settings) -> None:
        with freeze_time("2026-01-01T00:00:00Z"):
            token = create_access_token(user_id=uuid4(), email="a@example.com", settings=settings)

        # 31 minutes later — past the 30-minute expiry.
        with freeze_time("2026-01-01T00:31:00Z"), pytest.raises(jwt.ExpiredSignatureError):
            jwt.decode(token, settings.secret_key, algorithms=[settings.jwt_algorithm])

    def test_token_signed_with_wrong_secret_is_rejected(self, settings: Settings) -> None:
        token = create_access_token(user_id=uuid4(), email="a@example.com", settings=settings)

        with pytest.raises(jwt.InvalidSignatureError):
            jwt.decode(
                token, "a-completely-different-secret-key-value", algorithms=[settings.jwt_algorithm]
            )

    def test_token_decoded_with_wrong_algorithm_is_rejected(self, settings: Settings) -> None:
        token = create_access_token(user_id=uuid4(), email="a@example.com", settings=settings)

        with pytest.raises(jwt.InvalidAlgorithmError):
            jwt.decode(token, settings.secret_key, algorithms=["HS384"])


class TestRefreshToken:
    def test_generated_tokens_are_unique(self) -> None:
        assert generate_refresh_token() != generate_refresh_token()

    def test_hash_is_deterministic(self) -> None:
        token = generate_refresh_token()

        assert hash_refresh_token(token) == hash_refresh_token(token)

    def test_different_tokens_hash_differently(self) -> None:
        assert hash_refresh_token(generate_refresh_token()) != hash_refresh_token(generate_refresh_token())


class TestAesGcmEncryption:
    def test_encrypt_then_decrypt_round_trips(self, settings: Settings) -> None:
        plaintext = "sk-super-secret-anthropic-api-key"

        encrypted = encrypt_secret(plaintext, settings)

        assert decrypt_secret(encrypted, settings) == plaintext

    def test_two_encryptions_of_the_same_plaintext_produce_different_ciphertext(
        self, settings: Settings
    ) -> None:
        # Random 12-byte IV per call (AUTHENTICATION.md §5) — same plaintext, same key, different
        # output every time.
        first = encrypt_secret("same-plaintext", settings)
        second = encrypt_secret("same-plaintext", settings)

        assert first != second
        assert decrypt_secret(first, settings) == "same-plaintext"
        assert decrypt_secret(second, settings) == "same-plaintext"

    def test_decrypting_with_the_wrong_key_fails(self, settings: Settings) -> None:
        encrypted = encrypt_secret("secret", settings)
        wrong_key_settings = Settings(
            encryption_key="a-totally-different-32-byte-key!", _env_file=None
        )  # type: ignore[call-arg]

        with pytest.raises(Exception):  # noqa: B017 — cryptography raises InvalidTag, not ours to wrap
            decrypt_secret(encrypted, wrong_key_settings)


class TestMachineId:
    def test_is_deterministic_on_the_same_machine(self) -> None:
        assert generate_machine_id() == generate_machine_id()

    def test_is_a_sha256_hex_digest(self) -> None:
        machine_id = generate_machine_id()

        assert len(machine_id) == 64
        int(machine_id, 16)  # raises ValueError if not valid hex
