"""Request validation.

Everything crossing the boundary is validated here. The client sends symptom
*ids*, never free text, so a caller cannot inject arbitrary content into the
model prompt.
"""

from __future__ import annotations

import base64
import binascii
import re
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from . import config

_BASE64_RE = re.compile(r"^[A-Za-z0-9+/]+={0,2}$")
_JPEG_MAGIC = b"\xff\xd8\xff"
_PNG_MAGIC = b"\x89PNG\r\n\x1a\n"


class ImageIn(BaseModel):
    symptom_id: str = Field(max_length=64)
    data: str

    @field_validator("data")
    @classmethod
    def validate_image(cls, value: str) -> str:
        # Tolerate a data: URL prefix.
        stripped = value.strip()
        if stripped.startswith("data:") and "," in stripped[:64]:
            stripped = stripped.split(",", 1)[1]

        if not _BASE64_RE.match(stripped):
            raise ValueError("image must be plain base64")

        try:
            raw = base64.b64decode(stripped, validate=True)
        except (binascii.Error, ValueError) as exc:
            raise ValueError("image is not valid base64") from exc

        if len(raw) > config.MAX_IMAGE_BYTES:
            raise ValueError("image is too large")

        # Sniff magic bytes. Never trust a client-declared media type.
        if not (raw.startswith(_JPEG_MAGIC) or raw.startswith(_PNG_MAGIC)):
            raise ValueError("image must be JPEG or PNG")

        return stripped


class AnalyzeRequest(BaseModel):
    organ_id: Literal["heart", "kidney", "liver"]
    symptom_ids: list[str] = Field(min_length=1, max_length=config.MAX_SYMPTOMS)
    images: list[ImageIn] = Field(default_factory=list, max_length=config.MAX_IMAGES)

    @field_validator("symptom_ids")
    @classmethod
    def known_symptoms(cls, value: list[str]) -> list[str]:
        library = config.symptoms_by_id()
        unknown = [s for s in value if s not in library]
        if unknown:
            raise ValueError("unknown symptom id")
        # De-duplicate while preserving order.
        return list(dict.fromkeys(value))


class TopUpRequest(BaseModel):
    package_id: str
    method: Literal["mtn_momo", "airtel_money", "card"]
    phone: str | None = None

    @field_validator("package_id")
    @classmethod
    def known_package(cls, value: str) -> str:
        if value not in config.PACKAGES:
            raise ValueError("unknown package")
        return value

    @field_validator("phone")
    @classmethod
    def valid_ugandan_mobile(cls, value: str | None) -> str | None:
        if value is None:
            return None
        digits = re.sub(r"\D", "", value)
        local = digits[3:] if digits.startswith("256") else digits.lstrip("0")
        if not re.fullmatch(r"7\d{8}", local):
            raise ValueError("not a valid Ugandan mobile number")
        return local
