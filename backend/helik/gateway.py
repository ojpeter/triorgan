"""Flutterwave payment gateway.

Chosen because one integration covers MTN Mobile Money, Airtel Money and cards
in Uganda. Swap this module to change provider — nothing else imports the API.

The security-critical function here is `verify_webhook_signature`. Without it,
anyone who finds the webhook URL can mint themselves unlimited scan credits,
because the webhook is the only place credits are granted.
"""

from __future__ import annotations

import hmac
import logging

import httpx

from . import config

log = logging.getLogger("helik.gateway")

API_BASE = "https://api.flutterwave.com/v3"
TIMEOUT = httpx.Timeout(20.0)


class GatewayError(RuntimeError):
    """The payment could not be started."""


def verify_webhook_signature(received: str | None) -> bool:
    """Check the `verif-hash` header against the configured secret.

    Uses a constant-time comparison so the secret cannot be recovered by timing
    the response.
    """
    if not received:
        return False
    expected = config.settings.flutterwave_webhook_secret
    return hmac.compare_digest(str(received), expected)


async def start_charge(
    *,
    payment_id: str,
    package: dict,
    method: str,
    phone: str | None,
    email: str,
) -> dict:
    """Start a charge. Returns the gateway's acknowledgement.

    The amount comes from the server-side package table, never from the client.
    """
    method_config = config.PAYMENT_METHODS[method]

    if method_config["requires_phone"]:
        url = f"{API_BASE}/charges?type={method_config['gateway']}"
        payload = {
            "tx_ref": payment_id,
            "amount": str(package["ugx"]),
            "currency": "UGX",
            "network": method_config["network"],
            "phone_number": phone,
            "email": email,
        }
    else:
        url = f"{API_BASE}/payments"
        payload = {
            "tx_ref": payment_id,
            "amount": str(package["ugx"]),
            "currency": "UGX",
            "payment_options": "card",
            "customer": {"email": email, "phonenumber": phone},
            "redirect_url": f"{config.settings.public_base_url}/api/v1/payments/return",
        }

    headers = {"Authorization": f"Bearer {config.settings.flutterwave_secret_key}"}

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            response = await client.post(url, json=payload, headers=headers)
    except httpx.HTTPError as exc:
        log.warning("Gateway request failed: %s", type(exc).__name__)
        raise GatewayError("Could not reach the payment provider.") from exc

    if response.status_code >= 400:
        # Log the provider's reason for us; never return it to the client, since
        # it can contain account detail.
        log.warning("Gateway rejected charge %s: %s", payment_id, response.text[:400])
        raise GatewayError("The payment provider rejected the request.")

    body = response.json()
    if body.get("status") != "success":
        log.warning("Gateway returned failure for %s: %s", payment_id, body.get("message"))
        raise GatewayError("The payment could not be started.")

    data = body.get("data") or {}
    return {
        "reference": data.get("flw_ref") or data.get("id"),
        # Present for card payments; the app opens it. Mobile money instead
        # pushes a USSD prompt to the handset.
        "redirect_url": data.get("link"),
    }


async def verify_transaction(transaction_id: str) -> dict:
    """Re-check a transaction with the gateway.

    Webhook payloads are attacker-controlled shapes even once the signature is
    valid, so confirm amount and status against the provider before crediting
    anything of value.
    """
    url = f"{API_BASE}/transactions/{transaction_id}/verify"
    headers = {"Authorization": f"Bearer {config.settings.flutterwave_secret_key}"}

    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        response = await client.get(url, headers=headers)

    if response.status_code >= 400:
        raise GatewayError("Could not verify the transaction.")

    data = (response.json() or {}).get("data") or {}
    return {
        "status": data.get("status"),
        "amount": data.get("amount"),
        "currency": data.get("currency"),
        "tx_ref": data.get("tx_ref"),
        "reference": data.get("flw_ref"),
    }
