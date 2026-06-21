"""Shared request/response shapes for the multi-hazard spine."""
from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field, field_validator

HazardType = Literal["flood", "wildfire", "tornado", "earthquake"]
ResponsePattern = Literal["routing", "shelter"]
TimeTier = Literal["RUN", "ACT", "PREPARE"]


class Resources(BaseModel):
    mobility: Literal["foot", "vehicle"] = "foot"
    hasSlowMovers: bool = False
    hasSupplies: bool = False
    atHome: bool = True
    # Vulnerability-aware triage. These change the routing-vs-shelter calculus and
    # how much lead time a plan must allow (someone who can't move fast, or depends
    # on power/medical equipment, needs to act earlier and differently).
    hasVehicle: bool = False          # a working vehicle is available
    mobilityLimited: bool = False     # wheelchair / can't move quickly / frail
    medicalNeeds: bool = False        # oxygen, dialysis, refrigerated meds, powered devices
    dependents: bool = False          # children, elderly, or pets to bring along


class Situation(BaseModel):
    """Parsed alert + whether the user is inside its polygon."""
    event: str = Field(max_length=300)
    hazardType: HazardType
    severity: str = Field(max_length=50)
    urgency: str = Field(max_length=50)
    certainty: str = Field(max_length=50)
    onset: Optional[str] = Field(None, max_length=50)
    expires: Optional[str] = Field(None, max_length=50)
    headline: Optional[str] = Field(None, max_length=500)
    description: str = Field("", max_length=8000)
    instruction: str = Field("", max_length=4000)
    officialEvacOrder: bool = False
    # Cap polygon vertices so a request can't ship a multi-megabyte ring.
    areaPolygon: Optional[list[list[float]]] = Field(None, max_length=5000)  # list of [lon, lat]
    inZone: bool = False
    source: Literal["live", "mock"] = "live"


class AlertRequest(BaseModel):
    lat: float
    lon: float
    demo: bool = False
    hazard: Optional[HazardType] = None  # demo hazard override
    tier: Optional[TimeTier] = None  # demo tier override


class PlaceRequest(BaseModel):
    """Resolve a real public place to stand the user for a picked live-demo option."""
    lat: float
    lon: float
    areaPolygon: Optional[list[list[float]]] = None  # warned-area ring [lon, lat]
    locationLabel: str = ""  # fallback label if no public place is found


class AlertStatusRequest(BaseModel):
    """Re-check the alert a user is currently viewing against the live feed, so the
    plan can react to escalation/clearing and hand off into Recover when it's over."""
    lat: float
    lon: float
    prior: Situation  # the alert the user is currently acting on
    now: Optional[str] = None  # client clock (ISO) for expiry reasoning
    demo: bool = False  # demo plans have no live feed — decide on the expiry clock only


class ScreenshotRequest(BaseModel):
    # Cap the image so this endpoint can't be abused as a free vision-API proxy or
    # with giant payloads. ~9 MB of base64 ≈ a ~6.7 MB image — ample for a phone
    # screenshot; anything larger is almost certainly abuse.
    image: str = Field(max_length=9_000_000)  # data URL or raw base64
    lat: float
    lon: float


class ModuleRequest(BaseModel):
    lat: float
    lon: float
    accuracy: Optional[float] = None
    hazardType: HazardType
    situation: Situation
    resources: Resources
    timeTier: Optional[TimeTier] = None  # the tier the user is actually on (demo override-aware)
    language: Literal["en", "fr"] = "en"  # language for the deterministic fallback plan


class RecommendRequest(BaseModel):
    lat: float
    lon: float
    accuracy: Optional[float] = None
    hazardType: HazardType
    situation: Situation
    timeTier: TimeTier
    resources: Resources
    moduleData: Optional[dict[str, Any]] = None  # output of the Stage-4 module (data + deterministic)
    userNote: str = Field("", max_length=2000)  # free-text update from the user ("what changed / I'd rather do X")
    newsContext: str = Field("", max_length=8000)  # recent local news articles about the event (demo: fake-fetched)
    locationLabel: str = Field("", max_length=300)  # human-readable place (reverse-geocoded), for live news queries
    runFollowOn: bool = False  # RUN tier: user is already doing the immediate life-safety action;
    # generate the plan for what they do NEXT, not a repeat of drop/cover/flee.
    now: Optional[str] = None  # client's current time (ISO) — lets the AI ground timing in real-world clock time
    language: Literal["en", "fr"] = "en"  # output language for the AI plan (Canada is bilingual)


class FollowUpRequest(BaseModel):
    message: str = Field(max_length=2000)
    mode: Literal["instruction", "question"]
    hazardType: HazardType
    timeTier: TimeTier
    headline_action: str = Field("", max_length=2000)
    existing_steps: list[dict] = Field(default_factory=list, max_length=50)
    expires: Optional[str] = None  # alert expiry (ISO) — for computing remaining time
    now: Optional[str] = None  # client's current time (ISO) — for elapsed/remaining reasoning
    planAge: Optional[str] = None  # human-readable age of the plan ("8 minutes ago")
    language: Literal["en", "fr"] = "en"  # output language for the AI answer/step


class CleanupRequest(BaseModel):
    """Recover flow, Part A — generate a clean-up / re-entry slideshow plan."""
    hazardType: HazardType
    damageCategories: list[str] = Field(default_factory=list, max_length=12)
    situationText: str = Field("", max_length=2000)  # free-text "what you're seeing"
    # Optional insurance/FEMA/aid document text — extracted (David's engine) and
    # folded into the clean-up plan so the paperwork phase cites real deadlines.
    # Generous cap (~40k words): real insurance policies / FEMA letters run many pages.
    documentText: str = Field("", max_length=150000)
    # Optional page(s) of the insurance/FEMA/aid letter — OCR'd to text, then run
    # through the same extractor as a pasted document. Up to 10 pages (a PDF can
    # be rendered to one image per page on the client).
    documentImages: list[str] = Field(default_factory=list, max_length=10)
    now: Optional[str] = None  # client clock (ISO) for deadline-day computation
    # Optional damage photos (data URLs). Capped count; each capped like the
    # screenshot endpoint so this can't be abused as a free vision proxy.
    images: list[str] = Field(default_factory=list, max_length=4)
    language: Literal["en", "fr"] = "en"

    @field_validator("images")
    @classmethod
    def _cap_images(cls, v: list[str]) -> list[str]:
        return [img for img in v if isinstance(img, str) and len(img) <= 9_000_000][:4]

    @field_validator("documentImages")
    @classmethod
    def _cap_doc_images(cls, v: list[str]) -> list[str]:
        return [img for img in v if isinstance(img, str) and len(img) <= 9_000_000][:10]


class RecoveryFollowUpRequest(BaseModel):
    """Follow-up on the recovery clean-up plan — add a step or ask a question."""
    hazardType: HazardType
    mode: Literal["instruction", "question"]
    message: str = Field(max_length=2000)
    headline_action: str = Field("", max_length=2000)
    existing_steps: list[dict] = Field(default_factory=list, max_length=50)
    language: Literal["en", "fr"] = "en"


class PaperworkRequest(BaseModel):
    """Recover flow, Part B — analyze redacted recovery paperwork."""
    hazardType: HazardType
    documentText: str = Field("", max_length=150000)  # ~40k words; real insurance/FEMA letters run many pages
    # Optional page(s) of the letter — OCR'd to text, then run through the same
    # extractor as a pasted document. Up to 10 pages (a PDF renders to one image
    # per page on the client). Mirrors the clean-up intake.
    documentImages: list[str] = Field(default_factory=list, max_length=10)
    insurerName: str = Field("", max_length=120)
    claimStatus: str = Field("", max_length=40)
    damageCategories: list[str] = Field(default_factory=list, max_length=12)
    now: Optional[str] = None  # client's current time (ISO) — anchors deadline-day computation
    language: Literal["en", "fr"] = "en"

    @field_validator("documentImages")
    @classmethod
    def _cap_doc_images(cls, v: list[str]) -> list[str]:
        return [img for img in v if isinstance(img, str) and len(img) <= 9_000_000][:10]


class Recommendation(BaseModel):
    headline_action: str
    destination_name: Optional[str] = None
    direction: Optional[str] = None
    distance: Optional[str] = None
    reason: str = ""
    supplies_enroute: Optional[str] = None
    confidence: Literal["high", "medium", "low"] = "medium"
    uncertainty_note: str = ""
    official_order_present: bool = False
    official_order_text: str = ""
    # Coordinates + provenance the frontend needs to draw the final path.
    dest_lat: Optional[float] = None
    dest_lon: Optional[float] = None
    responsePattern: ResponsePattern = "routing"
    engine: Literal["ai", "rule-based"] = "rule-based"
