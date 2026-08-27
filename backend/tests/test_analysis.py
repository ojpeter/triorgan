"""The model boundary.

Covers the two things the old mobile client got wrong: it read content[0].text
(which breaks once a thinking block leads the response) and never checked
stop_reason (so a truncated or refused answer became a generic connection error).
"""

from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

from triacare import analysis
from triacare.analysis import AnalysisError, analyse, build_content, extract_json

from conftest import JPEG_B64, PNG_B64

VALID_JSON = (
    '{"riskLevel": "LOW", "riskScore": 12, "riskSummary": "All clear.", '
    '"findings": [], "recommendations": [], "nextSteps": "Keep it up.", '
    '"positiveNote": "Nice."}'
)


def block(kind, **kwargs):
    return SimpleNamespace(type=kind, **kwargs)


def fake_message(content, stop_reason="end_turn"):
    return SimpleNamespace(content=content, stop_reason=stop_reason)


def stream_returning(message):
    """Mimic client.messages.stream(...) as a context manager."""
    stream = MagicMock()
    stream.__enter__.return_value.get_final_message.return_value = message
    client = MagicMock()
    client.messages.stream.return_value = stream
    return client


class TestBuildContent:
    def test_puts_images_before_the_text(self):
        content = build_content("heart", ["h1"], [{"symptom_id": "h1", "data": JPEG_B64}])

        assert content[0]["type"] == "image"
        assert content[-1]["type"] == "text"

    def test_detects_png_and_jpeg(self):
        jpeg = build_content("heart", ["h1"], [{"symptom_id": "h1", "data": JPEG_B64}])
        png = build_content("heart", ["h1"], [{"symptom_id": "h1", "data": PNG_B64}])

        assert jpeg[0]["source"]["media_type"] == "image/jpeg"
        assert png[0]["source"]["media_type"] == "image/png"

    def test_says_so_when_no_photo_was_provided(self):
        text = build_content("heart", ["h1"], [])[-1]["text"]
        assert "No photo was provided" in text

    def test_includes_every_attached_photo(self):
        images = [{"symptom_id": "h1", "data": JPEG_B64} for _ in range(3)]
        content = build_content("heart", ["h1"], images)
        assert sum(1 for c in content if c["type"] == "image") == 3

    def test_refuses_when_no_symptom_is_recognised(self):
        with pytest.raises(AnalysisError):
            build_content("heart", ["nope"], [])


class TestExtractJson:
    def test_pulls_json_out_of_surrounding_prose(self):
        assert extract_json(f"Here you go:\n{VALID_JSON}\nHope that helps.")["riskScore"] == 12

    def test_raises_when_there_is_no_json(self):
        with pytest.raises(AnalysisError):
            extract_json("I am unable to help with that.")

    def test_raises_on_malformed_json(self):
        with pytest.raises(AnalysisError):
            extract_json('{"riskLevel": "LOW", ')


class TestAnalyse:
    def test_returns_the_parsed_analysis(self):
        message = fake_message([block("text", text=VALID_JSON)])
        with patch.object(analysis, "get_client", return_value=stream_returning(message)):
            assert analyse("heart", ["h1"], [])["riskLevel"] == "LOW"

    # content[0] is not necessarily text once thinking is enabled.
    def test_skips_a_leading_thinking_block(self):
        message = fake_message(
            [block("thinking", thinking="considering..."), block("text", text=VALID_JSON)]
        )
        with patch.object(analysis, "get_client", return_value=stream_returning(message)):
            assert analyse("heart", ["h1"], [])["riskScore"] == 12

    def test_joins_multiple_text_blocks(self):
        half = len(VALID_JSON) // 2
        message = fake_message(
            [block("text", text=VALID_JSON[:half]), block("text", text=VALID_JSON[half:])]
        )
        with patch.object(analysis, "get_client", return_value=stream_returning(message)):
            assert analyse("heart", ["h1"], [])["riskLevel"] == "LOW"

    # The old client capped max_tokens at 1500 and never checked this, so a
    # truncated response reached users as "check your internet connection".
    def test_raises_when_the_response_was_truncated(self):
        message = fake_message([block("text", text='{"riskLevel": "LO')], stop_reason="max_tokens")
        with patch.object(analysis, "get_client", return_value=stream_returning(message)):
            with pytest.raises(AnalysisError, match="truncated"):
                analyse("heart", ["h1"], [])

    def test_raises_when_the_model_refuses(self):
        message = fake_message([], stop_reason="refusal")
        with patch.object(analysis, "get_client", return_value=stream_returning(message)):
            with pytest.raises(AnalysisError, match="declined"):
                analyse("heart", ["h1"], [])

    def test_requests_streaming_and_adaptive_thinking(self):
        message = fake_message([block("text", text=VALID_JSON)])
        client = stream_returning(message)
        with patch.object(analysis, "get_client", return_value=client):
            analyse("heart", ["h1"], [])

        kwargs = client.messages.stream.call_args.kwargs
        assert kwargs["thinking"] == {"type": "adaptive"}
        assert kwargs["max_tokens"] >= 8000
        assert "screening tool" in kwargs["system"].lower()
