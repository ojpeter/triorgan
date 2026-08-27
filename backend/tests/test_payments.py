"""Payments.

The webhook is the only place credits are granted, and it is unauthenticated by
design — the gateway calls it. The signature check is therefore the entire
access control, and these tests are what stop it silently regressing.
"""

from unittest.mock import AsyncMock, patch

import pytest

from triacare import gateway
from triacare.store import store

from conftest import USER_ID

SECRET = "webhook-secret"
TOPUP = {"package_id": "pkg_5", "method": "mtn_momo", "phone": "0771234567"}


def start(client, body=None):
    return client.post("/api/v1/payments/topup", json=body or TOPUP)


def webhook(client, payload, signature=SECRET):
    headers = {"verif-hash": signature} if signature is not None else {}
    return client.post("/api/v1/payments/webhook", json=payload, headers=headers)


def verified(tx_ref, amount=2000, status="successful"):
    return {
        "status": status,
        "amount": amount,
        "currency": "UGX",
        "tx_ref": tx_ref,
        "reference": "FLW-REF-1",
    }


@pytest.fixture
def charge():
    with patch.object(
        gateway, "start_charge", new=AsyncMock(return_value={"reference": "FLW-1", "redirect_url": None})
    ) as mock:
        yield mock


class TestStartTopUp:
    def test_returns_a_pending_payment(self, client, charge):
        response = start(client)

        assert response.status_code == 200
        body = response.json()
        assert body["status"] == "PENDING"
        assert body["payment_id"]

    # Credits must only ever come from the webhook, after money has moved.
    def test_grants_no_credits_yet(self, client, charge):
        start(client)
        assert store.wallet(USER_ID).balance_scans == 0

    # The client sends a package id; the server prices it. Anything the client
    # can name the price of, it can discount.
    def test_prices_the_package_server_side(self, client, charge):
        start(client)
        assert charge.await_args.kwargs["package"] == {"scans": 5, "ugx": 2000, "usd": 2.00}

    def test_ignores_any_amount_the_client_tries_to_send(self, client, charge):
        start(client, {**TOPUP, "amount": 1, "ugx": 1})
        assert charge.await_args.kwargs["package"]["ugx"] == 2000

    def test_normalises_the_phone_number(self, client, charge):
        start(client, {**TOPUP, "phone": "+256 771 234 567"})
        assert charge.await_args.kwargs["phone"] == "771234567"

    @pytest.mark.parametrize("phone", ["0891234567", "07712345", "not a phone"])
    def test_rejects_an_invalid_phone(self, client, charge, phone):
        assert start(client, {**TOPUP, "phone": phone}).status_code == 422

    def test_requires_a_phone_for_mobile_money(self, client, charge):
        response = start(client, {"package_id": "pkg_5", "method": "mtn_momo"})
        assert response.status_code == 400

    def test_rejects_an_unknown_package(self, client, charge):
        assert start(client, {**TOPUP, "package_id": "pkg_free"}).status_code == 422

    def test_marks_the_payment_failed_when_the_gateway_errors(self, client):
        with patch.object(
            gateway, "start_charge", new=AsyncMock(side_effect=gateway.GatewayError("declined"))
        ):
            assert start(client).status_code == 502

        assert all(p["status"] == "FAILED" for p in store.payments.values())


class TestPaymentStatus:
    def test_reports_pending_then_completed(self, client, charge):
        payment_id = start(client).json()["payment_id"]

        assert client.get(f"/api/v1/payments/{payment_id}").json()["status"] == "PENDING"

        with patch.object(gateway, "verify_transaction", new=AsyncMock(return_value=verified(payment_id))):
            webhook(client, {"tx_ref": payment_id, "status": "successful", "id": 99})

        body = client.get(f"/api/v1/payments/{payment_id}").json()
        assert body["status"] == "COMPLETED"
        assert body["wallet"]["balanceScans"] == 5

    def test_hides_another_users_payment_behind_a_404(self, client, charge):
        payment_id = start(client).json()["payment_id"]
        store.payments[payment_id]["user_id"] = "someone-else"

        assert client.get(f"/api/v1/payments/{payment_id}").status_code == 404

    def test_unknown_payment_is_404(self, client):
        assert client.get("/api/v1/payments/does-not-exist").status_code == 404


class TestWebhookSignature:
    # Without this check, anyone who finds the URL can mint unlimited credits.
    @pytest.mark.parametrize("signature", [None, "", "wrong-secret", "webhook-secre"])
    def test_rejects_a_bad_or_missing_signature(self, client, charge, signature):
        payment_id = start(client).json()["payment_id"]

        response = webhook(client, {"tx_ref": payment_id, "status": "successful"}, signature)

        assert response.status_code == 401
        assert store.wallet(USER_ID).balance_scans == 0

    def test_accepts_a_valid_signature(self, client, charge):
        payment_id = start(client).json()["payment_id"]

        with patch.object(gateway, "verify_transaction", new=AsyncMock(return_value=verified(payment_id))):
            response = webhook(client, {"tx_ref": payment_id, "status": "successful", "id": 99})

        assert response.status_code == 200
        assert store.wallet(USER_ID).balance_scans == 5

    def test_signature_comparison_is_constant_time(self):
        # Guards against someone "simplifying" this to ==, which leaks the
        # secret to a timing attack.
        import inspect

        source = inspect.getsource(gateway.verify_webhook_signature)
        assert "compare_digest" in source


class TestWebhookCrediting:
    def test_credits_the_package_and_records_the_transaction(self, client, charge):
        payment_id = start(client).json()["payment_id"]

        with patch.object(gateway, "verify_transaction", new=AsyncMock(return_value=verified(payment_id))):
            webhook(client, {"tx_ref": payment_id, "status": "successful", "id": 99})

        wallet = store.wallet(USER_ID)
        assert wallet.balance_scans == 5
        assert wallet.total_spent_ugx == 2000
        assert [t["type"] for t in store.transactions[USER_ID]] == ["TOPUP"]

    # Gateways retry. A double credit is a refund conversation later.
    def test_is_idempotent_under_retries(self, client, charge):
        payment_id = start(client).json()["payment_id"]
        payload = {"tx_ref": payment_id, "status": "successful", "id": 99}

        with patch.object(gateway, "verify_transaction", new=AsyncMock(return_value=verified(payment_id))):
            for _ in range(4):
                assert webhook(client, payload).status_code == 200

        assert store.wallet(USER_ID).balance_scans == 5
        assert len(store.transactions[USER_ID]) == 1

    def test_marks_a_declined_payment_failed_without_crediting(self, client, charge):
        payment_id = start(client).json()["payment_id"]

        webhook(client, {"tx_ref": payment_id, "status": "failed"})

        assert store.wallet(USER_ID).balance_scans == 0
        assert client.get(f"/api/v1/payments/{payment_id}").json()["status"] == "FAILED"

    # A valid signature proves the sender, not that the body is truthful.
    def test_rejects_an_underpayment(self, client, charge):
        payment_id = start(client).json()["payment_id"]

        with patch.object(
            gateway, "verify_transaction", new=AsyncMock(return_value=verified(payment_id, amount=1))
        ):
            webhook(client, {"tx_ref": payment_id, "status": "successful", "id": 99})

        assert store.wallet(USER_ID).balance_scans == 0
        assert client.get(f"/api/v1/payments/{payment_id}").json()["status"] == "FAILED"

    def test_rejects_a_transaction_for_a_different_payment(self, client, charge):
        payment_id = start(client).json()["payment_id"]

        with patch.object(
            gateway, "verify_transaction", new=AsyncMock(return_value=verified("someone-elses-ref"))
        ):
            webhook(client, {"tx_ref": payment_id, "status": "successful", "id": 99})

        assert store.wallet(USER_ID).balance_scans == 0

    def test_leaves_the_payment_pending_when_verification_is_unavailable(self, client, charge):
        payment_id = start(client).json()["payment_id"]

        with patch.object(
            gateway, "verify_transaction", new=AsyncMock(side_effect=gateway.GatewayError("down"))
        ):
            assert webhook(client, {"tx_ref": payment_id, "status": "successful", "id": 99}).status_code == 200

        # Still PENDING, so the gateway's retry can settle it.
        assert store.payments[payment_id]["status"] == "PENDING"
        assert store.wallet(USER_ID).balance_scans == 0

    def test_acknowledges_an_unknown_payment_without_crediting(self, client):
        response = webhook(client, {"tx_ref": "never-seen", "status": "successful"})

        assert response.status_code == 200
        assert store.wallets == {}
