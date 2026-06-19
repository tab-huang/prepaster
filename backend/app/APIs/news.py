"""Local-news fetch for the live (non-demo) flow.

Uses Google News' RSS search endpoint — free, no API key. We pull a few recent
headlines for the hazard + location and hand them to the AI so the plan can
reference real road closures, open shelters, and on-the-ground specifics.
Never raises; returns [] on any failure so the plan still generates.
"""
from __future__ import annotations

import re
from xml.etree import ElementTree

import httpx

_RSS_URL = "https://news.google.com/rss/search"
_HEADERS = {"User-Agent": "CrisisToAction/0.1 (disaster-response demo; crisis@example.com)"}
_TAG_RE = re.compile(r"<[^>]+>")
_WS_RE = re.compile(r"\s+")


def _clean(text: str) -> str:
    return _WS_RE.sub(" ", _TAG_RE.sub(" ", text or "")).strip()


async def fetch_news(query: str, limit: int = 3) -> list[dict]:
    """Return up to `limit` recent articles ({title, snippet}) for the query."""
    if not query.strip():
        return []
    params = {"q": query, "hl": "en-US", "gl": "US", "ceid": "US:en"}
    try:
        async with httpx.AsyncClient(timeout=5.0, headers=_HEADERS, follow_redirects=True) as client:
            resp = await client.get(_RSS_URL, params=params)
            resp.raise_for_status()
            root = ElementTree.fromstring(resp.text)
    except Exception:
        return []

    out: list[dict] = []
    for item in root.findall(".//item")[:limit]:
        title = _clean(item.findtext("title") or "")
        snippet = _clean(item.findtext("description") or "")
        if title:
            out.append({"title": title[:200], "snippet": snippet[:300]})
    return out
