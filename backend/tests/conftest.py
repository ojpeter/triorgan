import base64
import os
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# Set before anything imports config, so the required-env checks pass.
os.environ.setdefault("ANTHROPIC_API_KEY", "sk-ant-test")
os.environ.setdefault("FLUTTERWAVE_SECRET_KEY", "FLWSECK-test")
os.environ.setdefault("FLUTTERWAVE_WEBHOOK_SECRET", "webhook-secret")
os.environ.setdefault("PUBLIC_BASE_URL", "https://test.local")

from corvia.app import create_app  # noqa: E402
from corvia.auth import CurrentUser  # noqa: E402
from corvia.store import Wallet, store  # noqa: E402

USER_ID = "user-1"
USER_EMAIL = "amara@example.com"

# Smallest valid JPEG and PNG headers, enough to pass the magic-byte check.
JPEG_BYTES = b"\xff\xd8\xff" + b"\x00" * 32
PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32

JPEG_B64 = base64.b64encode(JPEG_BYTES).decode()
PNG_B64 = base64.b64encode(PNG_BYTES).decode()


@pytest.fixture(autouse=True)
def clean_store():
    store.wallets.clear()
    store.transactions.clear()
    store.payments.clear()
    yield
    store.wallets.clear()
    store.transactions.clear()
    store.payments.clear()


@pytest.fixture
def app():
    application = create_app()

    async def resolver(_request):
        return CurrentUser(id=USER_ID, email=USER_EMAIL)

    application.state.user_resolver = resolver
    return application


@pytest.fixture
def client(app):
    return TestClient(app)


@pytest.fixture
def anon_app():
    """App with auth left unwired, to prove endpoints are not open by default."""
    return create_app()


@pytest.fixture
def credited():
    """Give the test user some scan credits."""

    def _credit(scans=5):
        store.wallets[USER_ID] = Wallet(balance_scans=scans)
        return store.wallets[USER_ID]

    return _credit
