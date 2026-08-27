"""The invariant: a user is never charged for a screening they did not receive."""

from unittest.mock import patch

import pytest

from triacare.analysis import AnalysisError
from triacare.store import store

from conftest import JPEG_B64, USER_ID

VALID_ANALYSIS = {
    "riskLevel": "MODERATE",
    "riskScore": 42,
    "riskSummary": "Some early warning signs are present.",
    "findings": [],
    "recommendations": [],
    "nextSteps": "See a clinician within two weeks.",
    "positiveNote": "Good on you for checking.",
}

BODY = {"organ_id": "heart", "symptom_ids": ["h1", "h2"]}


def post(client, body=None):
    return client.post("/api/v1/screenings/analyze", json=body or BODY)


def transactions():
    return store.transactions.get(USER_ID, [])


def types():
    return [t["type"] for t in transactions()]


class TestSuccess:
    def test_returns_analysis_and_debits_one_credit(self, client, credited):
        credited(5)
        with patch("triacare.routers.analyse", return_value=VALID_ANALYSIS):
            response = post(client)

        assert response.status_code == 200
        body = response.json()
        assert body["analysis"]["riskLevel"] == "MODERATE"
        assert body["wallet"]["balanceScans"] == 4
        assert body["wallet"]["totalScansUsed"] == 1
        assert types() == ["SCAN_DEBIT"]

    def test_wallet_payload_uses_the_field_names_the_app_reads(self, client, credited):
        credited(1)
        with patch("triacare.routers.analyse", return_value=VALID_ANALYSIS):
            wallet = post(client).json()["wallet"]

        assert set(wallet) == {
            "balanceScans", "totalScansUsed", "totalSpentUgx", "totalSpentUsd",
        }

    def test_accepts_attached_photos(self, client, credited):
        credited(1)
        body = {**BODY, "images": [{"symptom_id": "h1", "data": JPEG_B64}]}
        with patch("triacare.routers.analyse", return_value=VALID_ANALYSIS) as analyse:
            assert post(client, body).status_code == 200

        assert len(analyse.call_args.args[2]) == 1


class TestRefunds:
    @pytest.mark.parametrize(
        "reason",
        ["provider unavailable", "response truncated", "model declined", "malformed JSON"],
    )
    def test_refunds_the_credit_when_analysis_fails(self, client, credited, reason):
        credited(3)
        with patch("triacare.routers.analyse", side_effect=AnalysisError(reason)):
            response = post(client)

        assert response.status_code == 502
        assert store.wallet(USER_ID).balance_scans == 3
        assert store.wallet(USER_ID).total_scans_used == 0
        assert types() == ["REFUND", "SCAN_DEBIT"]

    def test_refunds_on_an_unexpected_bug_too(self, client, credited):
        credited(3)
        with patch("triacare.routers.analyse", side_effect=RuntimeError("boom")):
            assert post(client).status_code == 502

        assert store.wallet(USER_ID).balance_scans == 3

    def test_never_leaks_the_internal_reason_to_the_client(self, client, credited):
        credited(1)
        with patch("triacare.routers.analyse", side_effect=AnalysisError("anthropic 429 quota")):
            detail = post(client).json()["detail"]

        assert "anthropic" not in detail.lower()
        assert "credit has been returned" in detail

    # An unreadable photo is not a screening the user received.
    def test_refunds_when_the_photo_could_not_be_read(self, client, credited):
        credited(2)
        invalid = {"riskLevel": "INVALID", "riskSummary": "Not a human body part."}
        with patch("triacare.routers.analyse", return_value=invalid):
            response = post(client)

        assert response.status_code == 200
        assert response.json()["analysis"]["riskLevel"] == "INVALID"
        assert store.wallet(USER_ID).balance_scans == 2
        assert types() == ["REFUND", "SCAN_DEBIT"]


class TestNoCredit:
    def test_402_when_the_wallet_is_empty(self, client):
        with patch("triacare.routers.analyse") as analyse:
            response = post(client)

        assert response.status_code == 402
        analyse.assert_not_called()

    def test_does_not_go_negative(self, client, credited):
        credited(1)
        with patch("triacare.routers.analyse", return_value=VALID_ANALYSIS):
            assert post(client).status_code == 200
            assert post(client).status_code == 402

        assert store.wallet(USER_ID).balance_scans == 0


class TestValidation:
    def test_rejects_an_unknown_symptom_id(self, client, credited):
        credited(1)
        response = post(client, {"organ_id": "heart", "symptom_ids": ["h1", "not-real"]})
        assert response.status_code == 422
        assert store.wallet(USER_ID).balance_scans == 1

    def test_rejects_an_unknown_organ(self, client, credited):
        credited(1)
        assert post(client, {"organ_id": "spleen", "symptom_ids": ["h1"]}).status_code == 422

    def test_requires_at_least_one_symptom(self, client, credited):
        credited(1)
        assert post(client, {"organ_id": "heart", "symptom_ids": []}).status_code == 422

    def test_rejects_a_non_image_payload(self, client, credited):
        import base64

        credited(1)
        body = {
            **BODY,
            "images": [{"symptom_id": "h1", "data": base64.b64encode(b"MZ\x90\x00").decode()}],
        }
        assert post(client, body).status_code == 422

    def test_caps_the_number_of_images(self, client, credited):
        credited(1)
        body = {**BODY, "images": [{"symptom_id": "h1", "data": JPEG_B64}] * 4}
        assert post(client, body).status_code == 422


class TestAuth:
    # A service that ships with auth accidentally disabled is worse than one
    # that fails loudly.
    def test_endpoints_refuse_when_auth_is_not_wired_up(self, anon_app):
        from fastapi.testclient import TestClient

        client = TestClient(anon_app)
        assert client.post("/api/v1/screenings/analyze", json=BODY).status_code == 501
        assert client.get("/api/v1/wallet").status_code == 501
