"""RAG context builder — scrapes authoritative government emergency pages.

Two-tier cache:
  1. In-memory (24 h TTL): populated after any web fetch; reset on server restart.
  2. Monthly file cache (rag_monthly_cache.json): persisted to disk next to this
     file; updated at most once every 30 days per hazard.

Selection logic per (hazard, time_tier):
  URGENT (RUN / ACT — within 2 hours): avoid blocking on a web fetch.
      • If the 24 h cache is newer than the monthly cache → use the 24 h cache.
      • Else if the monthly cache is fresh (< 30 days) → use it.
      • Else if the 24 h cache exists (even if monthly is stale) → use it.
      • Last resort: fetch fresh and prime both caches.
  NON-URGENT (PREPARE — 6 hours available): fetch fresh for accuracy.
      • Skip fetch if the 24 h cache already exists and is newer than monthly.
      • On fetch failure: fall back to 24 h cache, then monthly cache.

Both caches update together whenever a live fetch succeeds:
  the in-memory entry always refreshes; the file entry only refreshes
  if more than 30 days have passed since it was last written.
"""
from __future__ import annotations

import asyncio
import json
import re
import time
from html.parser import HTMLParser
from pathlib import Path

import httpx

HEADERS = {
    "User-Agent": "CrisisToAction/0.1 (disaster-response research; crisis@example.com)",
    "Accept": "text/html,application/xhtml+xml",
    "Accept-Language": "en-US,en;q=0.9",
}

GOV_SOURCES: dict[str, list[dict]] = {
    "flood": [
        {"url": "https://www.ready.gov/floods", "title": "Ready.gov — Floods"},
        {"url": "https://www.weather.gov/safety/flood", "title": "NWS — Flood Safety"},
        {"url": "https://www.fema.gov/emergency-managers/risk-management/flood", "title": "FEMA — Flood Risk"},
    ],
    "wildfire": [
        {"url": "https://www.ready.gov/wildfires", "title": "Ready.gov — Wildfires"},
        {"url": "https://www.fire.ca.gov/ways-to-protect-yourself-from-wildfires/", "title": "CAL FIRE — Protect Yourself"},
        {"url": "https://www.weather.gov/safety/wildfire", "title": "NWS — Wildfire Safety"},
    ],
    "tornado": [
        {"url": "https://www.ready.gov/tornadoes", "title": "Ready.gov — Tornadoes"},
        {"url": "https://www.weather.gov/safety/tornado", "title": "NWS — Tornado Safety"},
        {"url": "https://www.spc.noaa.gov/faq/tornado/safety.html", "title": "NOAA SPC — Tornado Safety FAQ"},
    ],
    "earthquake": [
        {"url": "https://www.ready.gov/earthquakes", "title": "Ready.gov — Earthquakes"},
        {"url": "https://www.usgs.gov/programs/earthquake-hazards/prepare", "title": "USGS — Earthquake Preparedness"},
        {"url": "https://www.earthquakecountry.org/sevensteps/", "title": "Earthquake Country Alliance — 7 Steps"},
    ],
}

_BASE_KEYWORDS: dict[str, list[str]] = {
    "flood": ["flood", "flash flood", "evacuate", "high ground", "floodwater", "turn around", "water depth", "shelter", "vertical evacuation"],
    "wildfire": ["fire", "wildfire", "evacuate", "evacuation", "smoke", "ember", "defensible", "go bag", "air quality", "route"],
    "tornado": ["tornado", "basement", "interior room", "shelter", "mobile home", "overpass", "debris", "lowest floor", "warning"],
    "earthquake": ["earthquake", "drop cover hold", "aftershock", "gas leak", "structural", "shaking", "open ground", "power lines", "doorway"],
}

# ── Recovery (post-disaster) gov sources + keywords ──────────────────────────
# These power the "Recover" flow's clean-up / re-entry guide. Same scraping +
# two-tier cache machinery as the response sources above, but pointed at the
# official "returning home / cleaning up after" pages instead of the protective-
# action pages. Cache entries are namespaced with a "recovery:" prefix so they
# never collide with the response-flow cache for the same hazard.
GOV_SOURCES_RECOVERY: dict[str, list[dict]] = {
    "flood": [
        {"url": "https://www.ready.gov/floods", "title": "Ready.gov — Floods"},
        {"url": "https://www.ready.gov/recovering-disaster", "title": "Ready.gov — Recovering After a Disaster"},
        {"url": "https://www.cdc.gov/floods/safety/index.html", "title": "CDC — Flood Safety"},
        {"url": "https://www.cdc.gov/mold/index.html", "title": "CDC — Mold Clean-Up"},
    ],
    "wildfire": [
        {"url": "https://www.ready.gov/wildfires", "title": "Ready.gov — Wildfires"},
        {"url": "https://www.ready.gov/recovering-disaster", "title": "Ready.gov — Recovering After a Disaster"},
        {"url": "https://www.cdc.gov/wildfires/safety/index.html", "title": "CDC — Wildfire Safety"},
        {"url": "https://www.epa.gov/natural-disasters/wildfires", "title": "EPA — Wildfire Smoke & Ash Cleanup"},
    ],
    "tornado": [
        {"url": "https://www.ready.gov/tornadoes", "title": "Ready.gov — Tornadoes"},
        {"url": "https://www.ready.gov/recovering-disaster", "title": "Ready.gov — Recovering After a Disaster"},
        {"url": "https://www.cdc.gov/disasters/index.html", "title": "CDC — Natural Disasters & Severe Weather"},
    ],
    "earthquake": [
        {"url": "https://www.ready.gov/earthquakes", "title": "Ready.gov — Earthquakes"},
        {"url": "https://www.ready.gov/recovering-disaster", "title": "Ready.gov — Recovering After a Disaster"},
        {"url": "https://www.cdc.gov/earthquakes/safety/index.html", "title": "CDC — Earthquake Safety"},
        {"url": "https://www.earthquakecountry.org/step6/", "title": "Earthquake Country Alliance — Restore"},
    ],
}

_RECOVERY_KEYWORDS: dict[str, list[str]] = {
    "flood": ["return home", "clean up", "mold", "floodwater", "contaminated", "drywall", "electrical", "gas", "dry out", "disinfect", "photographs", "insurance", "boil water"],
    "wildfire": ["return home", "ash", "soot", "smoke damage", "air quality", "hot spots", "debris", "hazardous", "n95", "clean up", "water safety", "insurance"],
    "tornado": ["after", "debris", "downed power lines", "gas leak", "structural", "clean up", "chainsaw", "generator", "carbon monoxide", "photographs", "insurance"],
    "earthquake": ["after", "aftershock", "gas leak", "structural", "cracks", "inspect", "shut off", "downed lines", "clean up", "photographs", "insurance"],
}

TOP_K = 7
MIN_LEN = 60
MAX_CHUNK_CHARS = 480

_MONTHLY_CACHE_PATH = Path(__file__).parent / "rag_monthly_cache.json"
_DAY_SECONDS  = 24 * 3600
_MONTH_SECONDS = 30 * 24 * 3600

# In-memory cache: hazard → {"result": dict, "ts": float}
_inmem: dict[str, dict] = {}


# ---------------------------------------------------------------------------
# HTML text extraction
# ---------------------------------------------------------------------------

class _TextExtractor(HTMLParser):
    _SKIP  = {"script", "style", "nav", "header", "footer", "aside", "noscript", "form", "button", "iframe"}
    _BREAK = {"p", "li", "h1", "h2", "h3", "h4", "h5", "br", "tr", "dt", "dd", "blockquote"}

    def __init__(self):
        super().__init__()
        self._depth_skip = 0
        self._buf: list[str] = []
        self.chunks: list[str] = []

    def handle_starttag(self, tag, attrs):
        if tag in self._SKIP:
            self._depth_skip += 1

    def handle_endtag(self, tag):
        if tag in self._SKIP:
            self._depth_skip = max(0, self._depth_skip - 1)
        if tag in self._BREAK:
            self._flush()

    def handle_data(self, data):
        if self._depth_skip:
            return
        t = data.strip()
        if t:
            self._buf.append(t)

    def _flush(self):
        if self._buf:
            text = " ".join(self._buf).strip()
            if text:
                self.chunks.append(text)
            self._buf = []

    def paragraphs(self) -> list[str]:
        self._flush()
        seen: set[str] = set()
        out: list[str] = []
        for c in self.chunks:
            c = re.sub(r"\s+", " ", c).strip()
            if len(c) >= MIN_LEN and c not in seen:
                seen.add(c)
                out.append(c[:MAX_CHUNK_CHARS])
        return out


# ---------------------------------------------------------------------------
# Scoring
# ---------------------------------------------------------------------------

def _score(chunk: str, keywords: list[str]) -> int:
    lower = chunk.lower()
    return sum(1 for kw in keywords if kw in lower)


# ---------------------------------------------------------------------------
# Network fetch
# ---------------------------------------------------------------------------

async def _fetch_html(url: str) -> str | None:
    try:
        async with httpx.AsyncClient(timeout=5.0, headers=HEADERS, follow_redirects=True) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            return resp.text
    except Exception:
        return None


async def _fetch_source(src: dict, keywords: list[str]) -> dict:
    failed = {"url": src["url"], "title": src["title"], "ok": False, "paragraphs": 0, "chunks": []}
    try:
        html = await _fetch_html(src["url"])
        if not html:
            return failed
        parser = _TextExtractor()
        parser.feed(html)
        paras = parser.paragraphs()
        scored = sorted(
            ((_score(p, keywords), p) for p in paras),
            key=lambda x: x[0],
            reverse=True,
        )
        return {
            "url": src["url"],
            "title": src["title"],
            "ok": True,
            "paragraphs": len(paras),
            "chunks": [p for _, p in scored],
        }
    except Exception:
        return failed


async def _fetch_fresh(hazard: str, extra_keywords: list[str] | None = None) -> dict:
    """Scrape all sources for a hazard, score, and return a result dict."""
    sources = GOV_SOURCES.get(hazard, [])
    if not sources:
        return {"ok": False, "context": "", "sources": []}

    keywords = list(_BASE_KEYWORDS.get(hazard, []))
    if extra_keywords:
        keywords += [kw.lower() for kw in extra_keywords if kw]

    raw = await asyncio.gather(
        *[_fetch_source(src, keywords) for src in sources],
        return_exceptions=True,
    )
    results = [r for r in raw if isinstance(r, dict)]

    all_chunks: list[tuple[int, str]] = []
    source_meta = []
    for res in results:
        source_meta.append({
            "url": res["url"],
            "title": res["title"],
            "ok": res["ok"],
            "paragraphs": res["paragraphs"],
        })
        for chunk in res["chunks"]:
            all_chunks.append((_score(chunk, keywords), chunk))

    if not all_chunks:
        return {"ok": False, "context": "", "sources": source_meta}

    all_chunks.sort(key=lambda x: x[0], reverse=True)

    seen: set[str] = set()
    top: list[str] = []
    for _, chunk in all_chunks:
        if chunk not in seen and len(top) < TOP_K:
            seen.add(chunk)
            top.append(chunk)

    return {"ok": True, "context": "\n\n".join(top), "sources": source_meta}


# ---------------------------------------------------------------------------
# Cache helpers
# ---------------------------------------------------------------------------

def _load_monthly() -> dict:
    try:
        if _MONTHLY_CACHE_PATH.exists():
            return json.loads(_MONTHLY_CACHE_PATH.read_text())
    except Exception:
        pass
    return {}


def _save_monthly(monthly: dict) -> None:
    try:
        _MONTHLY_CACHE_PATH.write_text(json.dumps(monthly))
    except Exception:
        pass


def _store_inmem(hazard: str, result: dict, ts: float) -> None:
    _inmem[hazard] = {"result": result, "ts": ts}


def _maybe_update_monthly(monthly: dict, hazard: str, result: dict, ts: float) -> None:
    """Write the monthly cache entry only if it's absent or more than 30 days old."""
    entry = monthly.get(hazard)
    if not entry or (ts - entry["ts"]) >= _MONTH_SECONDS:
        monthly[hazard] = {"result": result, "ts": ts}
        _save_monthly(monthly)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def fetch_rag_context(
    hazard: str,
    extra_keywords: list[str] | None = None,
    time_tier: str = "PREPARE",
) -> dict:
    """
    Return RAG context for the hazard, applying the two-tier cache strategy.

    Returns:
        {"ok": bool, "context": str, "sources": [...]}
    """
    now = time.time()
    is_urgent = time_tier in ("RUN", "ACT")

    inmem_entry  = _inmem.get(hazard)
    inmem_fresh  = bool(inmem_entry and (now - inmem_entry["ts"]) < _DAY_SECONDS)

    monthly_all   = _load_monthly()
    monthly_entry = monthly_all.get(hazard)
    monthly_fresh = bool(monthly_entry and (now - monthly_entry["ts"]) < _MONTH_SECONDS)

    inmem_ts       = inmem_entry["ts"]  if inmem_entry  else 0.0
    monthly_ts     = monthly_entry["ts"] if monthly_entry else 0.0
    inmem_is_newer = inmem_ts > monthly_ts

    if is_urgent:
        # Fast path: never block on a web fetch; use whichever cache is newer.
        if inmem_fresh and inmem_is_newer:
            return inmem_entry["result"]
        if monthly_fresh:
            return monthly_entry["result"]
        if inmem_fresh:
            return inmem_entry["result"]
        # No usable cache — fetch once to prime both caches.
        result = await _fetch_fresh(hazard, extra_keywords)
        _store_inmem(hazard, result, now)
        _maybe_update_monthly(monthly_all, hazard, result, now)
        return result
    else:
        # Non-urgent path: fetch fresh, but skip if 24 h cache is already newer than monthly.
        if inmem_fresh and inmem_is_newer:
            return inmem_entry["result"]
        result = await _fetch_fresh(hazard, extra_keywords)
        if result.get("ok"):
            _store_inmem(hazard, result, now)
            _maybe_update_monthly(monthly_all, hazard, result, now)
            return result
        # Fetch failed — fall back to best available cache.
        if inmem_fresh:
            return inmem_entry["result"]
        if monthly_entry:
            return monthly_entry["result"]
        return {"ok": False, "context": "", "sources": []}


async def _fetch_fresh_recovery(hazard: str, extra_keywords: list[str] | None = None) -> dict:
    """Scrape the recovery (clean-up / re-entry) sources for a hazard."""
    sources = GOV_SOURCES_RECOVERY.get(hazard, [])
    if not sources:
        return {"ok": False, "context": "", "sources": []}

    keywords = list(_RECOVERY_KEYWORDS.get(hazard, []))
    if extra_keywords:
        keywords += [kw.lower() for kw in extra_keywords if kw]

    raw = await asyncio.gather(
        *[_fetch_source(src, keywords) for src in sources],
        return_exceptions=True,
    )
    results = [r for r in raw if isinstance(r, dict)]

    all_chunks: list[tuple[int, str]] = []
    source_meta = []
    for res in results:
        source_meta.append({"url": res["url"], "title": res["title"], "ok": res["ok"], "paragraphs": res["paragraphs"]})
        for chunk in res["chunks"]:
            all_chunks.append((_score(chunk, keywords), chunk))

    if not all_chunks:
        return {"ok": False, "context": "", "sources": source_meta}

    all_chunks.sort(key=lambda x: x[0], reverse=True)
    seen: set[str] = set()
    top: list[str] = []
    for _, chunk in all_chunks:
        if chunk not in seen and len(top) < TOP_K:
            seen.add(chunk)
            top.append(chunk)
    return {"ok": True, "context": "\n\n".join(top), "sources": source_meta}


async def fetch_recovery_rag(hazard: str, extra_keywords: list[str] | None = None) -> dict:
    """Recovery-flow RAG context (official return-home / clean-up guidance).

    Recovery is never time-critical, so this always prefers fresh accuracy but
    falls back to cache on failure. Cache key is namespaced 'recovery:<hazard>'
    so it never collides with the response-flow cache. Returns the same shape as
    fetch_rag_context: {"ok", "context", "sources"}.
    """
    now = time.time()
    cache_key = f"recovery:{hazard}"

    inmem_entry = _inmem.get(cache_key)
    inmem_fresh = bool(inmem_entry and (now - inmem_entry["ts"]) < _DAY_SECONDS)

    monthly_all = _load_monthly()
    monthly_entry = monthly_all.get(cache_key)
    monthly_ts = monthly_entry["ts"] if monthly_entry else 0.0
    inmem_ts = inmem_entry["ts"] if inmem_entry else 0.0

    if inmem_fresh and inmem_ts > monthly_ts:
        return inmem_entry["result"]

    result = await _fetch_fresh_recovery(hazard, extra_keywords)
    if result.get("ok"):
        _store_inmem(cache_key, result, now)
        _maybe_update_monthly(monthly_all, cache_key, result, now)
        return result
    if inmem_fresh:
        return inmem_entry["result"]
    if monthly_entry:
        return monthly_entry["result"]
    return {"ok": False, "context": "", "sources": []}
