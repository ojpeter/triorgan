"""Configuration and the symptom library.

Every secret is read from the environment. Nothing here is ever returned to a
client or written to a log.
"""

from __future__ import annotations

import json
import os
from functools import lru_cache
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent


def _required(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(
            f"{name} is not set. Copy backend/.env.example to .env and fill it in."
        )
    return value


class Settings:
    """Lazily-read settings, so importing this module never explodes in tests."""

    @property
    def anthropic_api_key(self) -> str:
        return _required("ANTHROPIC_API_KEY")

    @property
    def flutterwave_secret_key(self) -> str:
        return _required("FLUTTERWAVE_SECRET_KEY")

    @property
    def flutterwave_webhook_secret(self) -> str:
        return _required("FLUTTERWAVE_WEBHOOK_SECRET")

    @property
    def public_base_url(self) -> str:
        return os.environ.get("PUBLIC_BASE_URL", "http://localhost:8000")

    @property
    def model(self) -> str:
        # Claude Opus 5 — the strongest current model, which matters on a task
        # whose output becomes health guidance. Set TRIACARE_MODEL=claude-sonnet-5
        # if per-screening cost dominates.
        return os.environ.get("TRIACARE_MODEL", "claude-opus-5")


settings = Settings()

# ── Limits ───────────────────────────────────────────────────────────────────

MAX_TOKENS = 8000
MAX_IMAGES = 3
MAX_IMAGE_BYTES = 5 * 1024 * 1024
MAX_SYMPTOMS = 40

SCAN_PRICE_UGX = 500
SCAN_PRICE_USD = 0.50

# Server-side price list. The client sends a package id and nothing else — never
# an amount. Anything the client can name the price of, it can discount.
# Keep in sync with src/constants/payments.js.
PACKAGES: dict[str, dict] = {
    "pkg_1": {"scans": 1, "ugx": 500, "usd": 0.50},
    "pkg_5": {"scans": 5, "ugx": 2000, "usd": 2.00},
    "pkg_10": {"scans": 10, "ugx": 3500, "usd": 3.50},
    "pkg_20": {"scans": 20, "ugx": 6000, "usd": 6.00},
}

PAYMENT_METHODS = {
    "mtn_momo": {"gateway": "mobilemoneyuganda", "network": "MTN", "requires_phone": True},
    "airtel_money": {"gateway": "mobilemoneyuganda", "network": "AIRTEL", "requires_phone": True},
    "card": {"gateway": "card", "network": None, "requires_phone": False},
}


# ── Symptom library ──────────────────────────────────────────────────────────
# Generated from the app's src/constants/symptoms.js by
# `npm run export:symptoms`, so the two cannot drift. Do not hand-edit.


@lru_cache(maxsize=1)
def _library() -> dict:
    path = BASE_DIR / "symptoms.json"
    if not path.exists():
        raise RuntimeError(
            "backend/symptoms.json is missing. Run `npm run export:symptoms` "
            "from the project root."
        )
    return json.loads(path.read_text(encoding="utf-8"))


def organs() -> dict[str, dict]:
    return _library()["organs"]


def organ_name(organ_id: str) -> str:
    return organs()[organ_id]["name"]


@lru_cache(maxsize=1)
def symptoms_by_id() -> dict[str, dict]:
    """Flat id -> symptom map across every organ."""
    flat: dict[str, dict] = {}
    for organ_id, entries in _library()["symptoms"].items():
        for entry in entries:
            flat[entry["id"]] = {**entry, "organ_id": organ_id}
    return flat


def describe_symptoms(organ_id: str, symptom_ids: list[str]) -> str:
    """Render the reported symptoms for the prompt.

    Unknown ids are dropped rather than echoed. The client sends ids only, so a
    caller cannot inject arbitrary text into the prompt this way.
    """
    library = symptoms_by_id()
    lines = []
    for symptom_id in symptom_ids:
        entry = library.get(symptom_id)
        if entry and entry["organ_id"] == organ_id:
            lines.append(f"- {entry['name']}: {entry['description']} ({entry['why']})")
    return "\n".join(lines)
