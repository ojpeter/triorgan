"""HTTP routes.

The invariant enforced here: a user is never charged for a screening they did
not receive. Debit and analysis are one unit of work, and every failure path
refunds before returning.
"""

from __future__ import annotations

import logging
import uuid

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status

from . import config, gateway
from .analysis import AnalysisError, analyse
from .auth import CurrentUser, current_user
from .schemas import AnalyzeRequest, TopUpRequest
from .store import store

log = logging.getLogger("corvia.routers")

screening_router = APIRouter(tags=["screening"])
wallet_router = APIRouter(tags=["wallet"])
payment_router = APIRouter(tags=["payments"])


# ── Credit movement ──────────────────────────────────────────────────────────


def _debit_one(user_id: str, organ_name: str) -> str:
    """Take one credit. Raises 402 when there are none. Returns the reference."""
    with store.wallet_lock(user_id):
        wallet = store.wallet(user_id)
        if wallet.balance_scans <= 0:
            # The app maps 402 to "open the top-up sheet".
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail="No scan credits remaining.",
            )
        wallet.balance_scans -= 1
        wallet.total_scans_used += 1
        reference = f"SCAN-{uuid.uuid4().hex[:10].upper()}"
        store.add_transaction(
            user_id,
            {
                "type": "SCAN_DEBIT",
                "scans": -1,
                "amountUgx": config.SCAN_PRICE_UGX,
                "amountUsd": config.SCAN_PRICE_USD,
                "description": f"{organ_name} screening",
                "reference": reference,
            },
        )
    return reference


def _refund_one(user_id: str, reason: str, original_reference: str) -> None:
    with store.wallet_lock(user_id):
        wallet = store.wallet(user_id)
        wallet.balance_scans += 1
        wallet.total_scans_used = max(0, wallet.total_scans_used - 1)
        store.add_transaction(
            user_id,
            {
                "type": "REFUND",
                "scans": 1,
                "amountUgx": config.SCAN_PRICE_UGX,
                "amountUsd": config.SCAN_PRICE_USD,
                "description": f"Refund — {reason}",
                "reference": f"REF-{original_reference}",
            },
        )


# ── Screening ────────────────────────────────────────────────────────────────


@screening_router.post("/screenings/analyze")
async def analyze_screening(req: AnalyzeRequest, user: CurrentUser = Depends(current_user)):
    organ_name = config.organ_name(req.organ_id)
    reference = _debit_one(user.id, organ_name)

    try:
        analysis = analyse(
            req.organ_id,
            req.symptom_ids,
            [{"symptom_id": i.symptom_id, "data": i.data} for i in req.images],
        )
    except AnalysisError as exc:
        _refund_one(user.id, str(exc), reference)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="The analysis could not be completed. Your credit has been returned.",
        ) from exc
    except Exception as exc:  # noqa: BLE001 — an unexpected bug must still refund
        log.exception("Unexpected analysis failure for user %s", user.id)
        _refund_one(user.id, "Unexpected error", reference)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="The analysis could not be completed. Your credit has been returned.",
        ) from exc

    # A photo the model could not read is not a screening the user received.
    if analysis.get("riskLevel") == "INVALID":
        _refund_one(user.id, "Photo could not be read", reference)

    return {"analysis": analysis, "wallet": store.wallet(user.id).as_payload()}


# ── Wallet ───────────────────────────────────────────────────────────────────


@wallet_router.get("/wallet")
async def get_wallet(user: CurrentUser = Depends(current_user)):
    return {"wallet": store.wallet(user.id).as_payload()}


@wallet_router.get("/wallet/transactions")
async def get_transactions(user: CurrentUser = Depends(current_user)):
    return {"transactions": store.transactions.get(user.id, [])}


# ── Payments ─────────────────────────────────────────────────────────────────


@payment_router.post("/payments/topup")
async def start_topup(req: TopUpRequest, user: CurrentUser = Depends(current_user)):
    """Start a payment. Credits are NOT granted here — only by the webhook."""
    package = config.PACKAGES[req.package_id]
    method = config.PAYMENT_METHODS[req.method]

    if method["requires_phone"] and not req.phone:
        raise HTTPException(status_code=400, detail="A phone number is required for mobile money.")

    payment_id = store.create_payment(user.id, req.package_id, req.method)

    try:
        result = await gateway.start_charge(
            payment_id=payment_id,
            package=package,
            method=req.method,
            phone=req.phone,
            email=user.email,
        )
    except gateway.GatewayError as exc:
        store.fail_payment(payment_id, str(exc))
        raise HTTPException(status_code=502, detail="Could not start the payment.") from exc

    return {
        "status": "PENDING",
        "payment_id": payment_id,
        "redirect_url": result.get("redirect_url"),
    }


@payment_router.get("/payments/{payment_id}")
async def payment_status(payment_id: str, user: CurrentUser = Depends(current_user)):
    payment = store.payment(payment_id)
    # Same 404 whether it does not exist or belongs to someone else, so payment
    # ids cannot be probed.
    if payment is None or payment["user_id"] != user.id:
        raise HTTPException(status_code=404, detail="Payment not found.")

    body: dict = {"status": payment["status"]}
    if payment["status"] == "COMPLETED":
        body["wallet"] = store.wallet(user.id).as_payload()
    if payment["status"] == "FAILED":
        body["message"] = payment.get("message") or "The payment was declined or cancelled."
    return body


@payment_router.post("/payments/webhook")
async def payment_webhook(request: Request, verif_hash: str | None = Header(None, alias="verif-hash")):
    """Gateway callback. The ONLY place credits are granted.

    Unauthenticated by design — the gateway calls it — so the signature is the
    entire access control. Without it anyone who finds this URL can mint credits.
    """
    if not gateway.verify_webhook_signature(verif_hash):
        log.warning("Rejected webhook with bad or missing signature")
        raise HTTPException(status_code=401, detail="Invalid signature.")

    payload = await request.json()
    payment_id = payload.get("txRef") or payload.get("tx_ref")
    payment = store.payment(payment_id) if payment_id else None
    if payment is None:
        # 200 so the gateway stops retrying something we will never recognise.
        log.warning("Webhook for unknown payment %s", payment_id)
        return {"ok": True}

    if payload.get("status") != "successful":
        store.fail_payment(payment_id, "The payment was not completed.")
        return {"ok": True}

    package = config.PACKAGES[payment["package_id"]]

    # Re-verify with the gateway before granting anything of value: a valid
    # signature proves the sender, not that the amount in the body is real.
    transaction_id = payload.get("id")
    if transaction_id is not None:
        try:
            verified = await gateway.verify_transaction(str(transaction_id))
        except gateway.GatewayError:
            log.warning("Could not verify transaction for payment %s", payment_id)
            return {"ok": True}  # Leave PENDING; the gateway will retry.

        if verified["status"] != "successful" or verified["tx_ref"] != payment_id:
            store.fail_payment(payment_id, "The payment could not be verified.")
            return {"ok": True}

        if float(verified["amount"] or 0) < float(package["ugx"]):
            log.warning(
                "Underpayment for %s: expected %s, got %s",
                payment_id, package["ugx"], verified["amount"],
            )
            store.fail_payment(payment_id, "The amount paid did not match the package.")
            return {"ok": True}

        reference = verified["reference"]
    else:
        reference = payload.get("flwRef")

    # Idempotent: a webhook retry returns False and credits nothing twice.
    store.credit_for_payment(payment_id, package, reference)
    return {"ok": True}
