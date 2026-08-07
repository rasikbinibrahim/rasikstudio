from __future__ import annotations

import asyncio
import ipaddress
import socket
from urllib.parse import urlparse

# Only the schemes a real web page can use — blocks file://, data:, chrome://, javascript:, etc.,
# every one of which would let `browser_navigate` read local files or run in a privileged context
# instead of just browsing the web.
_ALLOWED_SCHEMES = {"http", "https"}


class SSRFBlockedError(Exception):
    """Raised by `validate_url_for_navigation` — the caller (`PlaywrightBrowserService.navigate`)
    turns this into the tool's `Error: ...` result rather than letting the browser attempt the
    request at all. The check happens *before* any network call, not as a response-time filter."""


def _is_blocked_ip(ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    # `is_private` alone already covers loopback/link-local/reserved for both address families in
    # modern `ipaddress` (they're implemented as subsets), but listing them explicitly documents
    # exactly which categories are blocked and doesn't rely on that implementation detail holding
    # forever — this is a security boundary, not a place to be implicit for brevity.
    return (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_multicast
        or ip.is_reserved
        or ip.is_unspecified
    )


def _check_sync(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme not in _ALLOWED_SCHEMES:
        raise SSRFBlockedError(f"Disallowed URL scheme: {parsed.scheme!r}")
    if not parsed.hostname:
        raise SSRFBlockedError("URL has no hostname")

    try:
        # AF_UNSPEC resolves both A and AAAA records — an IPv6-only private/link-local address
        # would otherwise slip past a v4-only check. A literal IP (e.g. "http://127.0.0.1") also
        # resolves correctly here, with no real DNS lookup needed for it.
        addr_infos = socket.getaddrinfo(parsed.hostname, None, family=socket.AF_UNSPEC)
    except socket.gaierror as exc:
        raise SSRFBlockedError(f"Could not resolve host: {parsed.hostname}") from exc

    for _family, _type, _proto, _canonname, sockaddr in addr_infos:
        ip = ipaddress.ip_address(sockaddr[0])
        if _is_blocked_ip(ip):
            raise SSRFBlockedError(f"URL resolves to a blocked address: {ip}")


async def validate_url_for_navigation(url: str) -> None:
    """Raises `SSRFBlockedError` if `url` isn't safe for the agent's headless browser to visit.
    DNS resolution is blocking, so it runs in a thread (same `asyncio.to_thread` pattern
    `search_tools.py`'s glob search already uses for blocking work) rather than stalling the
    event loop — this runs once per navigation, not on a hot path, so the thread-hop cost is
    negligible next to the network round-trip Playwright is about to make anyway."""
    await asyncio.to_thread(_check_sync, url)
