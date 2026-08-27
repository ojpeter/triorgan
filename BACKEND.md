# Backend contract

The app no longer holds the Anthropic API key or the scan-credit balance. Both
now live on the server. This document is the contract the app expects.

A working implementation of every endpoint below is in [`backend/`](backend/) —
three FastAPI routers you can mount on the existing TriOrgan backend that already
serves `/auth/*`. It ships with **69 tests** (`cd backend && python -m pytest`)
covering the refund invariant, webhook signature verification, idempotent
crediting and concurrent-debit safety. See [`backend/README.md`](backend/README.md)
to run it.

Two things still need your input before it can take a real payment:

1. **Auth** — replace `helik/auth.py`'s `current_user` with the JWT dependency
   your `/auth/*` routes already use. It returns 501 until you do.
2. **Storage** — `helik/store.py` is in-memory. Swap it for your database,
   preserving the per-user locking and the idempotent credit.

---

## Do this first

1. **Revoke the leaked Anthropic key.** The key that was in
   `src/services/claudeService.js:8` is compromised — it sat in plaintext in a
   shared folder and was compiled into every build. Revoke it at
   [console.anthropic.com](https://console.anthropic.com/settings/keys) and
   issue a new one. Deleting the line from source does not un-leak it.
2. **Put the new key in the backend's environment**, never in the app:
   ```bash
   export ANTHROPIC_API_KEY=sk-ant-...
   ```
   Not in `app.config.js`, not in `.env` for Expo, not in an `EXPO_PUBLIC_*`
   variable — those are all inlined into the JavaScript bundle exactly like a
   string literal.
3. **Set the production API URL** in `app.config.js` (`ENVIRONMENTS.production.apiBase`).

---

## Endpoints

All endpoints are authenticated with the existing `Authorization: Bearer <jwt>`.
An unauthenticated screening endpoint is an open proxy to your Anthropic account.

### `POST /screenings/analyze`

The one that matters. Debits a credit, calls the model, refunds on any failure.

**Request**
```json
{
  "organ_id": "heart",
  "symptom_ids": ["h1", "h3"],
  "images": [{ "symptom_id": "h1", "data": "<base64 jpeg/png>" }]
}
```
The client sends symptom **ids**, never free text, so a caller cannot inject
arbitrary content into the prompt. At most 3 images, 5 MB each.

**Response `200`**
```json
{
  "analysis": {
    "riskLevel": "MODERATE",
    "riskScore": 45,
    "riskSummary": "…",
    "findings": [{ "symptom": "…", "significance": "…", "urgency": "soon" }],
    "recommendations": [{ "category": "Diet", "title": "…", "detail": "…" }],
    "nextSteps": "…",
    "positiveNote": "…"
  },
  "wallet": { "balanceScans": 4, "totalScansUsed": 6, "totalSpentUgx": 2000, "totalSpentUsd": 2.0 }
}
```

`riskLevel: "INVALID"` (photo not a human body part) returns only `riskLevel`
and `riskSummary`, and **must refund** — an unreadable photo is not a screening
the user received.

**Response `402`** — no credits. The app maps this to the top-up sheet.

**Rules the server must hold:**
- Debit and model call are one unit of work. Any failure — model error, timeout,
  refusal, truncated output, unparseable JSON — refunds the credit before the
  error is returned.
- Never return the API key, the system prompt, or a raw provider error to the
  client.

### `GET /wallet`
```json
{ "wallet": { "balanceScans": 4, "totalScansUsed": 6, "totalSpentUgx": 2000, "totalSpentUsd": 2.0 } }
```
Field names matter — the app reads exactly these. (The old app read
`totalScans`/`totalSpent`, which never existed, so both wallet tiles showed zero
forever.)

### `GET /wallet/transactions`
```json
{ "transactions": [{
  "id": "…", "type": "TOPUP" | "SCAN_DEBIT" | "REFUND", "status": "SUCCESS",
  "createdAt": "2026-08-27T10:00:00Z", "reference": "…",
  "scans": 5, "amountUgx": 2000, "amountUsd": 2.0,
  "description": "Top-up — 5 scans", "paymentMethod": "mtn_momo", "phone": "771234567"
}] }
```

### `POST /payments/topup`
```json
{ "package_id": "pkg_5", "method": "mtn_momo", "phone": "771234567" }
```
**The client never sends an amount** — only a package id, which the server
prices from its own table. Anything the client can name the price of, it can
discount.

Returns `{"status": "PENDING", "payment_id": "…", "redirect_url": null}`.
Mobile money pushes a USSD prompt to the handset, so `redirect_url` is null and
the app just polls. Card payments return a hosted checkout link, which the app
opens before polling.

### `GET /payments/{payment_id}`
Polled by the app every 3s for up to 2 minutes while the user approves the USSD
prompt. Returns `PENDING`, `COMPLETED` (with `wallet`), or `FAILED` (with
`message`).

### `POST /payments/webhook`
The gateway callback, and **the only place credits are granted**.

Two things are non-negotiable before this ships:
1. **Verify the gateway signature.** Without it, anyone who finds the URL can
   mint themselves unlimited credits.
2. **Make it idempotent.** Gateways retry; a double-credit is a refund
   conversation later.

---

## Model configuration

The implementation uses:

| Setting | Value | Why |
|---|---|---|
| Model | `claude-opus-5` | Strongest current model, on a task where a careless answer becomes health guidance. `claude-sonnet-5` is the cheaper option if per-screening cost dominates. |
| `max_tokens` | `8000` | The old client's 1500 truncated multi-symptom responses mid-JSON, surfacing to users as "check your internet connection". |
| `thinking` | `{"type": "adaptive"}` | Risk assessment is a reasoning task. |
| Streaming | yes | A long response cannot hit an HTTP timeout. |

Two things the old client got wrong that the reference fixes: it read
`content[0].text`, which breaks as soon as a thinking block leads the response
(iterate and match `block.type == "text"`), and it never checked `stop_reason`,
so a truncated or refused response became a generic connection error.

---

## Until the endpoints exist

`app.config.js` sets `allowLocalWalletFallback: true` for the **development**
profile only. When the wallet endpoints return 404, the app falls back to an
on-device wallet stub (`src/services/localWallet.js`) so UI work is not blocked.

That fallback is double-gated on the config flag **and** `__DEV__`, so a release
build cannot use it. It is not a security boundary — an on-device balance is
trivially editable, which is the whole reason the real balance must live here.

`/screenings/analyze` has **no** fallback. There is no secure way to call the
model from the device, so screening does not work until this endpoint exists.
That is deliberate.

---

## Checklist before release

- [ ] Old Anthropic key revoked
- [ ] New key in the server environment only; `grep -r "sk-ant" src/` is empty
- [ ] `/screenings/analyze` refunds on every failure path (test: kill the network mid-call)
- [ ] Webhook signature verification enabled
- [ ] Webhook is idempotent under replay
- [ ] Wallet balance is read from the database, never from the request
- [ ] Rate limit `/screenings/analyze` per user — it costs you money per call
- [ ] `production` profile builds against HTTPS (`usesCleartextTraffic` is off)
