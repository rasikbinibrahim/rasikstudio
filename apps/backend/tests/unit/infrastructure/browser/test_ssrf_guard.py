import socket
from unittest.mock import patch

import pytest

from app.infrastructure.browser.ssrf_guard import SSRFBlockedError, validate_url_for_navigation


def _addrinfo(ip: str, family: int = socket.AF_INET) -> list[tuple]:
    sockaddr = (ip, 0) if family == socket.AF_INET else (ip, 0, 0, 0)
    return [(family, socket.SOCK_STREAM, 6, "", sockaddr)]


class TestSchemeValidation:
    async def test_blocks_file_scheme(self) -> None:
        with pytest.raises(SSRFBlockedError, match="scheme"):
            await validate_url_for_navigation("file:///etc/passwd")

    async def test_blocks_javascript_scheme(self) -> None:
        with pytest.raises(SSRFBlockedError, match="scheme"):
            await validate_url_for_navigation("javascript:alert(1)")

    async def test_blocks_data_scheme(self) -> None:
        with pytest.raises(SSRFBlockedError, match="scheme"):
            await validate_url_for_navigation("data:text/html,<script>alert(1)</script>")

    async def test_blocks_url_with_no_hostname(self) -> None:
        with pytest.raises(SSRFBlockedError, match="hostname"):
            await validate_url_for_navigation("http:///no-host")


class TestIpBlocking:
    async def test_blocks_loopback_v4(self) -> None:
        with (
            patch("socket.getaddrinfo", return_value=_addrinfo("127.0.0.1")),
            pytest.raises(SSRFBlockedError, match="blocked address"),
        ):
            await validate_url_for_navigation("http://localhost:5432")

    async def test_blocks_loopback_v6(self) -> None:
        with (
            patch("socket.getaddrinfo", return_value=_addrinfo("::1", socket.AF_INET6)),
            pytest.raises(SSRFBlockedError),
        ):
            await validate_url_for_navigation("http://ipv6-localhost")

    async def test_blocks_cloud_metadata_link_local_address(self) -> None:
        with (
            patch("socket.getaddrinfo", return_value=_addrinfo("169.254.169.254")),
            pytest.raises(SSRFBlockedError, match="blocked address"),
        ):
            await validate_url_for_navigation("http://169.254.169.254")

    @pytest.mark.parametrize(
        "private_ip",
        ["10.0.0.5", "172.16.0.5", "172.31.255.254", "192.168.1.1"],
    )
    async def test_blocks_rfc1918_private_ranges(self, private_ip: str) -> None:
        with (
            patch("socket.getaddrinfo", return_value=_addrinfo(private_ip)),
            pytest.raises(SSRFBlockedError, match="blocked address"),
        ):
            await validate_url_for_navigation("http://internal.example")

    async def test_blocks_unspecified_address(self) -> None:
        with (
            patch("socket.getaddrinfo", return_value=_addrinfo("0.0.0.0")),
            pytest.raises(SSRFBlockedError),
        ):
            await validate_url_for_navigation("http://zero.example")

    async def test_blocks_multicast_address(self) -> None:
        with (
            patch("socket.getaddrinfo", return_value=_addrinfo("224.0.0.1")),
            pytest.raises(SSRFBlockedError),
        ):
            await validate_url_for_navigation("http://multicast.example")

    async def test_allows_a_public_address(self) -> None:
        with patch("socket.getaddrinfo", return_value=_addrinfo("93.184.216.34")):
            await validate_url_for_navigation("https://example.com")  # does not raise

    async def test_blocks_if_any_resolved_address_is_private_even_when_another_is_public(self) -> None:
        # A hostname that round-robins between a public and a private/internal IP — every
        # resolved address must be safe, not just the first one returned.
        mixed = _addrinfo("93.184.216.34") + _addrinfo("10.0.0.5")
        with (
            patch("socket.getaddrinfo", return_value=mixed),
            pytest.raises(SSRFBlockedError, match="blocked address"),
        ):
            await validate_url_for_navigation("https://mixed.example")

    async def test_blocks_when_dns_resolution_fails(self) -> None:
        with (
            patch("socket.getaddrinfo", side_effect=socket.gaierror("not found")),
            pytest.raises(SSRFBlockedError, match="Could not resolve"),
        ):
            await validate_url_for_navigation("https://does-not-exist.invalid")
