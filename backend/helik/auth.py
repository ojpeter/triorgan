"""Authentication dependency.

REPLACE the body of `current_user` with the dependency the existing TriOrgan
backend already uses for /auth/*. Everything in this service is authenticated —
an unauthenticated screening endpoint is an open proxy to your Anthropic account.
"""

from __future__ import annotations

from dataclasses import dataclass

from fastapi import Depends, HTTPException, Request, status


@dataclass(frozen=True)
class CurrentUser:
    id: str
    email: str


async def current_user(request: Request) -> CurrentUser:
    """Resolve the caller from the bearer token.

    The placeholder below refuses everything rather than defaulting to a
    permissive stub — a service that ships with auth accidentally disabled is
    worse than one that fails loudly.
    """
    override = getattr(request.app.state, "user_resolver", None)
    if override is not None:
        return await override(request)

    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail=(
            "Authentication is not wired up. Set app.state.user_resolver, or "
            "replace helik.auth.current_user with the existing /auth dependency."
        ),
    )
