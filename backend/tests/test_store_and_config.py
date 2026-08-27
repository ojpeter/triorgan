"""Storage concurrency and the symptom library."""

import json
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pytest
from fastapi import HTTPException

from corvia import config
from corvia.routers import _debit_one, _refund_one
from corvia.store import Wallet, store

from conftest import USER_ID

BACKEND_DIR = Path(__file__).resolve().parent.parent
PROJECT_DIR = BACKEND_DIR.parent


class TestConcurrentDebits:
    """The bug this prevents: two concurrent screenings both read the same
    balance and both write balance-1, so one scan runs free."""

    def test_concurrent_debits_do_not_lose_a_credit(self):
        store.wallets[USER_ID] = Wallet(balance_scans=10)

        with ThreadPoolExecutor(max_workers=10) as pool:
            list(pool.map(lambda _: _debit_one(USER_ID, "Heart"), range(10)))

        assert store.wallet(USER_ID).balance_scans == 0
        assert store.wallet(USER_ID).total_scans_used == 10
        assert len(store.transactions[USER_ID]) == 10

    def test_concurrent_debits_never_oversell(self):
        store.wallets[USER_ID] = Wallet(balance_scans=3)

        def attempt(_):
            try:
                _debit_one(USER_ID, "Heart")
                return True
            except HTTPException:
                return False

        with ThreadPoolExecutor(max_workers=12) as pool:
            results = list(pool.map(attempt, range(12)))

        assert sum(results) == 3
        assert store.wallet(USER_ID).balance_scans == 0

    def test_debit_and_refund_leave_the_user_whole(self):
        store.wallets[USER_ID] = Wallet(balance_scans=4)

        def cycle(_):
            reference = _debit_one(USER_ID, "Heart")
            _refund_one(USER_ID, "test", reference)

        with ThreadPoolExecutor(max_workers=8) as pool:
            list(pool.map(cycle, range(8)))

        assert store.wallet(USER_ID).balance_scans == 4
        assert store.wallet(USER_ID).total_scans_used == 0

    def test_wallets_are_isolated_per_user(self):
        store.wallets["a"] = Wallet(balance_scans=2)
        store.wallets["b"] = Wallet(balance_scans=2)

        with ThreadPoolExecutor(max_workers=4) as pool:
            list(pool.map(lambda uid: _debit_one(uid, "Heart"), ["a", "b", "a", "b"]))

        assert store.wallet("a").balance_scans == 0
        assert store.wallet("b").balance_scans == 0


class TestIdempotentCredit:
    def test_concurrent_webhook_retries_credit_once(self):
        payment_id = store.create_payment(USER_ID, "pkg_5", "mtn_momo")
        package = config.PACKAGES["pkg_5"]

        with ThreadPoolExecutor(max_workers=8) as pool:
            results = list(
                pool.map(lambda _: store.credit_for_payment(payment_id, package, "ref"), range(8))
            )

        assert sum(results) == 1
        assert store.wallet(USER_ID).balance_scans == 5
        assert len(store.transactions[USER_ID]) == 1


class TestSymptomLibrary:
    def test_every_organ_has_symptoms(self):
        for organ_id in config.organs():
            entries = [s for s in config.symptoms_by_id().values() if s["organ_id"] == organ_id]
            assert entries, f"{organ_id} has no symptoms"

    def test_describe_renders_only_matching_symptoms(self):
        text = config.describe_symptoms("heart", ["h1"])
        assert "h1" not in text  # the id itself is never echoed
        assert config.symptoms_by_id()["h1"]["name"] in text

    # Unknown ids are dropped, so a caller cannot use them to inject prompt text.
    def test_unknown_and_cross_organ_ids_are_dropped(self):
        assert config.describe_symptoms("heart", ["not-a-real-id"]) == ""

        kidney_id = next(
            s["id"] for s in config.symptoms_by_id().values() if s["organ_id"] == "kidney"
        )
        assert config.describe_symptoms("heart", [kidney_id]) == ""

    def test_ids_are_unique_across_organs(self):
        library = json.loads((BACKEND_DIR / "symptoms.json").read_text(encoding="utf-8"))
        ids = [s["id"] for entries in library["symptoms"].values() for s in entries]
        assert len(ids) == len(set(ids))


class TestSymptomsStayInSyncWithTheApp:
    """symptoms.json is generated from the app's src/constants/symptoms.js.

    If it drifts, the server prompts users about symptoms the app never showed
    them. This regenerates it and fails if the committed file differs.
    """

    def test_generated_file_matches_the_app_source(self):
        if not (PROJECT_DIR / "node_modules").exists():
            pytest.skip("node_modules not installed")

        before = (BACKEND_DIR / "symptoms.json").read_text(encoding="utf-8")

        result = subprocess.run(
            ["node", "scripts/export-symptoms.js"],
            cwd=PROJECT_DIR,
            capture_output=True,
            text=True,
            shell=(sys.platform == "win32"),
        )
        assert result.returncode == 0, result.stderr

        after = (BACKEND_DIR / "symptoms.json").read_text(encoding="utf-8")
        assert before == after, (
            "backend/symptoms.json is out of date. "
            "Run `npm run export:symptoms` and commit the result."
        )
