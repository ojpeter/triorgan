"""The Claude call.

This is the only place the Anthropic API key is used, and it never leaves the
server. The mobile app used to hold the key in a source file and call
api.anthropic.com directly, which meant it shipped inside every APK.
"""

from __future__ import annotations

import base64
import json
import logging
import re

import anthropic

from . import config

log = logging.getLogger("helik.analysis")

SYSTEM_PROMPT = """You are HeLiK AI, a medical health screening assistant specialised in early warning detection of heart, kidney and liver disease for East Africa (Uganda).

STEP 1 — IMAGE VALIDATION (only if a photo was provided):
If an image does NOT show a human body part relevant to the screening (it shows an animal, object, food, scenery, or anything non-human), return exactly this JSON and nothing else:
{"riskLevel": "INVALID", "riskSummary": "The photo provided does not appear to show a human body part. Please take a clear photo of the relevant body area — such as your eyes, nails, hands, skin or ankles — and run the screening again."}

STEP 2 — ANALYSIS (only if the image is valid, or no image was provided):
Rules:
1. You are a SCREENING TOOL ONLY — never diagnose, never replace professional medical advice.
2. Always recommend seeing a qualified healthcare provider for proper diagnosis.
3. Be compassionate, clear, and culturally sensitive to East African users.
4. Use simple language — many users have limited health literacy.
5. Give urgent-care guidance whenever critical symptoms are present.
6. Base the risk level on the REPORTED symptoms only. Never invent a symptom that was not reported.

Return ONLY a JSON object with this exact shape:
{
  "riskLevel": "LOW" | "MODERATE" | "HIGH" | "CRITICAL",
  "riskScore": <integer 0-100>,
  "riskSummary": "<1-2 plain-English sentences>",
  "findings": [{"symptom": "<name>", "significance": "<why it matters, one sentence>", "urgency": "routine" | "soon" | "urgent" | "emergency"}],
  "recommendations": [{"category": "Lifestyle" | "Diet" | "Medical" | "Monitoring", "title": "<short>", "detail": "<2-3 actionable sentences>"}],
  "nextSteps": "<specific guidance including urgency>",
  "positiveNote": "<one encouraging sentence>"
}"""


class AnalysisError(RuntimeError):
    """The analysis could not be produced. Always triggers a refund."""


_client: anthropic.Anthropic | None = None


def get_client() -> anthropic.Anthropic:
    global _client
    if _client is None:
        _client = anthropic.Anthropic(api_key=config.settings.anthropic_api_key)
    return _client


def _media_type(raw: bytes) -> str:
    return "image/png" if raw.startswith(b"\x89PNG\r\n\x1a\n") else "image/jpeg"


def build_content(organ_id: str, symptom_ids: list[str], images: list[dict]) -> list[dict]:
    organ = config.organ_name(organ_id)
    symptom_text = config.describe_symptoms(organ_id, symptom_ids)
    if not symptom_text:
        raise AnalysisError("No recognised symptoms were supplied.")

    content: list[dict] = []
    for image in images:
        raw = base64.b64decode(image["data"], validate=True)
        content.append(
            {
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": _media_type(raw),
                    "data": image["data"],
                },
            }
        )

    note = (
        f"{len(images)} photo(s) provided for visual assessment."
        if images
        else "No photo was provided — assess from reported symptoms only."
    )
    content.append(
        {
            "type": "text",
            "text": (
                f"Patient self-reports the following visible {organ.upper()} disease "
                f"warning signs:\n\n{symptom_text}\n\n{note}\n\n"
                "Patient location context: East Africa (Uganda). Provide the screening "
                "assessment in the specified JSON structure."
            ),
        }
    )
    return content


def extract_json(text: str) -> dict:
    match = re.search(r"\{.*\}", text, re.S)
    if not match:
        raise AnalysisError("The model did not return JSON.")
    try:
        return json.loads(match.group(0))
    except json.JSONDecodeError as exc:
        raise AnalysisError("The model returned malformed JSON.") from exc


def analyse(organ_id: str, symptom_ids: list[str], images: list[dict]) -> dict:
    """Run the screening. Raises AnalysisError on any failure — the caller refunds."""
    content = build_content(organ_id, symptom_ids, images)

    try:
        # Streaming so a long response cannot hit an HTTP timeout, and adaptive
        # thinking because risk assessment is a reasoning task.
        with get_client().messages.stream(
            model=config.settings.model,
            max_tokens=config.MAX_TOKENS,
            system=SYSTEM_PROMPT,
            thinking={"type": "adaptive"},
            messages=[{"role": "user", "content": content}],
        ) as stream:
            message = stream.get_final_message()
    except anthropic.APIError as exc:
        log.warning("Anthropic call failed: %s", type(exc).__name__)
        raise AnalysisError("The analysis provider is unavailable.") from exc

    if message.stop_reason == "refusal":
        raise AnalysisError("The model declined to answer this request.")
    if message.stop_reason == "max_tokens":
        # The old client capped output at 1500 tokens and never checked this, so
        # a truncated response surfaced to users as a connection error.
        raise AnalysisError("The response was truncated.")

    # Iterate and match on type — content[0] is not necessarily text once a
    # thinking block leads the response.
    text = "".join(block.text for block in message.content if block.type == "text")
    return extract_json(text)
