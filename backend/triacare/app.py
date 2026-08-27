"""Standalone app, for running this service on its own.

To mount on the existing TriaCare backend instead:

    from triacare.routers import screening_router, wallet_router, payment_router

    app.include_router(screening_router, prefix="/api/v1")
    app.include_router(wallet_router,    prefix="/api/v1")
    app.include_router(payment_router,   prefix="/api/v1")

and delete triacare/auth.py in favour of your own dependency.
"""

from __future__ import annotations

import logging

from fastapi import FastAPI

from .routers import payment_router, screening_router, wallet_router

logging.basicConfig(level=logging.INFO)


def create_app() -> FastAPI:
    app = FastAPI(title="TriaCare API", version="1.0.0")
    app.include_router(screening_router, prefix="/api/v1")
    app.include_router(wallet_router, prefix="/api/v1")
    app.include_router(payment_router, prefix="/api/v1")

    @app.get("/health")
    async def health():
        return {"ok": True}

    return app


app = create_app()
