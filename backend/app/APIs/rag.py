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

What is cached is the scraped *candidate pool* (top POOL_K chunks by base hazard
keywords), not the final selection. On every call the pool is re-ranked against
base + the caller's situation keywords (`extra_keywords`) and the top TOP_K become
the context. So retrieval is situation-aware (the chunks reflect the user's own
free text) even on a pure cache hit, with no extra network and microsecond cost.
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
POOL_K = 30          # candidate chunks cached per hazard, re-ranked per request
MIN_LEN = 60
MAX_CHUNK_CHARS = 480

# Common words that carry no retrieval signal — dropped from free-text queries
# so situation keywords like "basement", "musty", "power" survive and match.
_STOPWORDS = {
    "the", "a", "an", "and", "or", "but", "is", "are", "was", "were", "be", "been",
    "being", "to", "of", "in", "on", "at", "for", "with", "from", "by", "as", "it",
    "its", "this", "that", "these", "those", "i", "we", "you", "they", "he", "she",
    "my", "our", "your", "their", "have", "has", "had", "do", "does", "did", "will",
    "would", "can", "could", "should", "about", "into", "over", "under", "near",
    "still", "just", "very", "really", "there", "here", "out", "off", "not", "yes",
    "get", "got", "getting", "going", "came", "come", "like", "some", "any", "all",
    "more", "most", "what", "when", "where", "how", "why", "which", "who", "than",
    "then", "also", "because", "been", "around", "still", "much", "many", "been",
}

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


def keywords_from_text(text: str, limit: int = 25) -> list[str]:
    """Turn free-form user text into lexical keywords for _score().

    Lowercases, splits on non-alphanumerics, drops stopwords and very short
    tokens, dedupes (order-preserving), and caps the count. The result is a list
    of substrings _score() can match against retrieved chunks — this is what makes
    retrieval situation-aware while staying purely lexical (no embeddings, no deps)."""
    if not text:
        return []
    out: list[str] = []
    seen: set[str] = set()
    for tok in re.findall(r"[a-z0-9]+", text.lower()):
        if len(tok) < 4 or tok in _STOPWORDS or tok in seen:
            continue
        seen.add(tok)
        out.append(tok)
        if len(out) >= limit:
            break
    return out


def _select(pool: list[str], keywords: list[str], k: int = TOP_K) -> str:
    """Pick the top-k chunks from a candidate pool by keyword score, deduped,
    joined into the context block. Re-ranking the cached pool here (rather than at
    fetch time) is what lets per-request situation keywords take effect even on a
    cache hit — and it's microseconds over a ~30-chunk pool."""
    if not pool:
        return ""
    scored = sorted(((_score(c, keywords), c) for c in pool), key=lambda x: x[0], reverse=True)
    seen: set[str] = set()
    top: list[str] = []
    for _, chunk in scored:
        if chunk not in seen:
            seen.add(chunk)
            top.append(chunk)
            if len(top) >= k:
                break
    return "\n\n".join(top)


def _rerank(result: dict, base_keywords: list[str], extra_keywords: list[str] | None) -> dict:
    """Rebuild the context from the cached candidate pool using base + situation
    keywords. Falls back to the stored context for older cache entries with no pool."""
    pool = result.get("pool")
    if not pool or not extra_keywords:
        return result
    keywords = list(base_keywords) + [kw.lower() for kw in extra_keywords if kw]
    out = dict(result)
    out["context"] = _select(pool, keywords, TOP_K)
    return out


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


def _pool_and_result(results: list[dict], keywords: list[str]) -> dict:
    """Shared tail of the fetch functions: rank all scraped chunks by base
    keywords, keep the top POOL_K as a re-rankable candidate pool, and seed the
    default context from it."""
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
        return {"ok": False, "context": "", "sources": source_meta, "pool": []}

    all_chunks.sort(key=lambda x: x[0], reverse=True)
    seen: set[str] = set()
    pool: list[str] = []
    for _, chunk in all_chunks:
        if chunk not in seen:
            seen.add(chunk)
            pool.append(chunk)
            if len(pool) >= POOL_K:
                break

    return {"ok": True, "context": _select(pool, keywords, TOP_K), "sources": source_meta, "pool": pool}


async def _fetch_fresh(hazard: str) -> dict:
    """Scrape all sources for a hazard and return a result dict with a cached,
    re-rankable candidate pool (scored on the hazard's base keywords)."""
    sources = GOV_SOURCES.get(hazard, [])
    if not sources:
        return {"ok": False, "context": "", "sources": [], "pool": []}

    keywords = list(_BASE_KEYWORDS.get(hazard, []))
    raw = await asyncio.gather(
        *[_fetch_source(src, keywords) for src in sources],
        return_exceptions=True,
    )
    results = [r for r in raw if isinstance(r, dict)]
    return _pool_and_result(results, keywords)


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

    # Resolve the (cached or freshly-fetched) candidate pool, then re-rank it
    # against the situation keywords below. The cache stores the pool, not the
    # final selection, so the same cached fetch serves every user while the
    # context they see still reflects their own situation.
    if is_urgent:
        # Fast path: never block on a web fetch; use whichever cache is newer.
        if inmem_fresh and inmem_is_newer:
            result = inmem_entry["result"]
        elif monthly_fresh:
            result = monthly_entry["result"]
        elif inmem_fresh:
            result = inmem_entry["result"]
        else:
            # No usable cache — fetch once to prime both caches.
            result = await _fetch_fresh(hazard)
            _store_inmem(hazard, result, now)
            _maybe_update_monthly(monthly_all, hazard, result, now)
    else:
        # Non-urgent path: fetch fresh, but skip if 24 h cache is already newer than monthly.
        if inmem_fresh and inmem_is_newer:
            result = inmem_entry["result"]
        else:
            fresh = await _fetch_fresh(hazard)
            if fresh.get("ok"):
                _store_inmem(hazard, fresh, now)
                _maybe_update_monthly(monthly_all, hazard, fresh, now)
                result = fresh
            elif inmem_fresh:
                result = inmem_entry["result"]
            elif monthly_entry:
                result = monthly_entry["result"]
            else:
                result = {"ok": False, "context": "", "sources": [], "pool": []}

    return _rerank(result, _BASE_KEYWORDS.get(hazard, []), extra_keywords)


async def _fetch_fresh_recovery(hazard: str) -> dict:
    """Scrape the recovery (clean-up / re-entry) sources for a hazard, returning a
    result dict with a re-rankable candidate pool (scored on base recovery keywords)."""
    sources = GOV_SOURCES_RECOVERY.get(hazard, [])
    if not sources:
        return {"ok": False, "context": "", "sources": [], "pool": []}

    keywords = list(_RECOVERY_KEYWORDS.get(hazard, []))
    raw = await asyncio.gather(
        *[_fetch_source(src, keywords) for src in sources],
        return_exceptions=True,
    )
    results = [r for r in raw if isinstance(r, dict)]
    return _pool_and_result(results, keywords)


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
        result = inmem_entry["result"]
    else:
        fresh = await _fetch_fresh_recovery(hazard)
        if fresh.get("ok"):
            _store_inmem(cache_key, fresh, now)
            _maybe_update_monthly(monthly_all, cache_key, fresh, now)
            result = fresh
        elif inmem_fresh:
            result = inmem_entry["result"]
        elif monthly_entry:
            result = monthly_entry["result"]
        else:
            result = {"ok": False, "context": "", "sources": [], "pool": []}

    return _rerank(result, _RECOVERY_KEYWORDS.get(hazard, []), extra_keywords)
