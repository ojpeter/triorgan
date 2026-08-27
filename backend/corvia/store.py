"""Wallet, transaction and payment persistence.

This is an in-memory reference implementation with the right *shape*. Swap the
body of each method for your database — the important properties to preserve
are marked.

Two invariants the rest of the service depends on:

  1. `wallet_lock(user_id)` serialises read-modify-write on one user's balance.
     In SQL this is `SELECT ... FOR UPDATE` on the wallet row inside a
     transaction. Without it, two concurrent screenings both read the same
     balance and both write balance-1, so one scan runs free.

  2. `credit_for_payment` is idempotent per payment id. Gateways retry their
     webhooks; crediting twice is a refund conversation later.
"""

from __future__ import annotations

import threading
import uuid
from contextlib import contextmanager
from dataclasses import dataclass, field
from datetime import datetime, timezone

MAX_TRANSACTIONS = 200


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass
class Wallet:
    balance_scans: int = 0
    total_scans_used: int = 0
    total_spent_ugx: int = 0
    total_spent_usd: float = 0.0

    def as_payload(self) -> dict:
        # These key names are the API contract — the app reads exactly these.
        return {
            "balanceScans": self.balance_scans,
            "totalScansUsed": self.total_scans_used,
            "totalSpentUgx": self.total_spent_ugx,
            "totalSpentUsd": round(self.total_spent_usd, 2),
        }


@dataclass
class Store:
    wallets: dict[str, Wallet] = field(default_factory=dict)
    transactions: dict[str, list[dict]] = field(default_factory=dict)
    payments: dict[str, dict] = field(default_factory=dict)
    _locks: dict[str, threading.Lock] = field(default_factory=dict)
    _locks_guard: threading.Lock = field(default_factory=threading.Lock)

    # ── Locking ──────────────────────────────────────────────────────────────

    @contextmanager
    def wallet_lock(self, user_id: str):
        """Per-user lock, so two users never block each other."""
        with self._locks_guard:
            lock = self._locks.setdefault(user_id, threading.Lock())
        with lock:
            yield

    # ── Wallet ───────────────────────────────────────────────────────────────

    def wallet(self, user_id: str) -> Wallet:
        return self.wallets.setdefault(user_id, Wallet())

    def add_transaction(self, user_id: str, tx: dict) -> dict:
        record = {"id": str(uuid.uuid4()), "createdAt": _now(), "status": "SUCCESS", **tx}
        entries = self.transactions.setdefault(user_id, [])
        entries.insert(0, record)
        del entries[MAX_TRANSACTIONS:]
        return record

    # ── Payments ─────────────────────────────────────────────────────────────

    def create_payment(self, user_id: str, package_id: str, method: str) -> str:
        payment_id = str(uuid.uuid4())
        self.payments[payment_id] = {
            "id": payment_id,
            "user_id": user_id,
            "package_id": package_id,
            "method": method,
            "status": "PENDING",
            "message": None,
            "created_at": _now(),
        }
        return payment_id

    def payment(self, payment_id: str) -> dict | None:
        return self.payments.get(payment_id)

    def fail_payment(self, payment_id: str, message: str) -> None:
        payment = self.payments.get(payment_id)
        if payment and payment["status"] == "PENDING":
            payment["status"] = "FAILED"
            payment["message"] = message

    def credit_for_payment(self, payment_id: str, package: dict, reference: str | None) -> bool:
        """Credit a wallet for a settled payment. Idempotent.

        Returns True if this call performed the credit, False if the payment was
        already settled (a webhook retry).
        """
        payment = self.payments.get(payment_id)
        if payment is None or payment["status"] != "PENDING":
            return False

        user_id = payment["user_id"]
        with self.wallet_lock(user_id):
            # Re-check inside the lock: two concurrent retries can both pass the
            # check above.
            if payment["status"] != "PENDING":
                return False
            payment["status"] = "COMPLETED"

            wallet = self.wallet(user_id)
            wallet.balance_scans += package["scans"]
            wallet.total_spent_ugx += package["ugx"]
            wallet.total_spent_usd += package["usd"]

            self.add_transaction(
                user_id,
                {
                    "type": "TOPUP",
                    "scans": package["scans"],
                    "amountUgx": package["ugx"],
                    "amountUsd": package["usd"],
                    "description": f"Top-up — {package['scans']} scans",
                    "paymentMethod": payment["method"],
                    "reference": reference or payment_id,
                },
            )
        return True


store = Store()
