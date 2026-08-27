# TriOrgan / HeLiK — Technical Review

> ## ⚠️ STATUS — remediated 2026-08-27
>
> The findings below have been **fixed in the client**. This document is kept as
> the record of what was wrong and why. Two items need work outside this repo:
>
> | Finding | Status |
> |---|---|
> | **S1** API key in the bundle | Key removed from source; app now calls a backend proxy. **You must still revoke the leaked key** — see [BACKEND.md](BACKEND.md) |
> | **S2** Client-side credit enforcement | Client no longer enforces; working implementation in [`backend/`](backend/). **Needs auth wired, storage swapped, and deploying** |
> | **T1** No tests / lint / CI | ESLint clean; **149 app tests + 69 backend tests**; GitHub Actions CI in [`.github/workflows/ci.yml`](.github/workflows/ci.yml), mirrored locally by `npm run verify` |
> | **D2** Expo SDK 51 outdated | Upgraded to **SDK 54** (React 19.1, RN 0.81.5, React Navigation 7). `expo-doctor` 18/18, all tests green. **Needs device testing** — New Architecture is now on |
> | Everything else (S3–S5, A1–A3, M1–M5, C1–C7, P1–P3, TS1–TS2, AX1–AX2, D1, D3, U1) | Fixed |
> | **U2** PaymentModal phone step | Investigated — not a bug; the step had a working Continue button |
>
> Verified: ESLint clean (0 errors, 0 warnings), `npm test` → 148 passing, all
> files parse, no unresolved imports, `grep -r sk-ant src/` empty, environment
> switching confirmed via `expo config`.
>
> Regression tests now pin the specific bugs found here: the concurrent-debit
> race (C7), the missing refund on every failure path (C3), the unvalidated model
> response (TS1), the API base leaking into user-facing errors (S3), and the
> account-enumeration-safe login and reset messages (S4-adjacent).

**Reviewed:** 2026-08-27 · read-only, no code changed
**Stack:** React Native 0.74.5 / Expo SDK ~51 / React 18.2.0 · React Navigation 6 · AsyncStorage · raw `fetch` · JavaScript (no TypeScript, no ESLint, no tests)
**Scope:** `App.js`, `src/` (13 screens, 4 components, 4 services, 1 context), root `screens/` `constants/` `utils/`, build config.

Findings are grouped by the requested dimensions and ordered by severity within each. Repeated problems are reported once as a pattern with the full file list.

---

## 1. Security

### S1 — CRITICAL · Live Anthropic API key hardcoded in the app bundle
**Location:** `src/services/claudeService.js:8`

```js
const CLAUDE_API_KEY = 'sk-ant-api03-Hkxs...ImX9gAA'; // 🔑 Replace this
```

A real, working secret key is a string literal in a client module. React Native has no server side — Metro inlines this into `index.android.bundle` / the iOS JSBundle, which ships inside every APK/IPA. Extracting it is `unzip app.apk && strings assets/index.android.bundle | grep sk-ant`. There is no obfuscation step that changes this; it is not a "hide it better" problem, it is an architecture problem.

**Who this breaks:** the account owner. Anyone who downloads the app gets an uncapped key billed to your Anthropic org, and can use it for anything, at any volume, until it is revoked. It also cannot be rotated without shipping a new app version to every user.

Good news: `git log` shows **zero commits and no remote**, so the key is not yet in version history. That window closes on the first `git push`.

**Fix:** revoke this key at console.anthropic.com **today** — assume it is compromised, because it is on disk in a directory you have been sharing. Then move the call server-side. You already run a backend (`authService.js:6`), so add one endpoint to it and have the app call that:

```js
// src/services/claudeService.js
import { API_BASE } from './authService';
export async function analyzeSymptoms({ organ, selectedSymptoms, allSymptoms, imageBase64 }) {
  const token = await AsyncStorage.getItem('triorgan_token');
  const res = await fetch(`${API_BASE}/screenings/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ organ, selectedSymptoms, imageBase64 }),
  });
  // backend holds the Anthropic key, verifies the JWT, checks + debits credit, calls Claude
}
```

The backend then owns the key, the system prompt, and the credit check — which also fixes S2, C3 and M1.

**Effort:** revoke — 5 minutes. Backend proxy endpoint + client swap — 1 day.

---

### S2 — CRITICAL · Paid access is enforced only on the device
**Location:** `src/services/paymentService.js:25-99` (wallet lives entirely in AsyncStorage), gate at `src/screens/DetectionScreen.js:118-130`

The scan-credit balance is a JSON blob under the AsyncStorage key `triorgan_wallet_<userId>`, written by the client and never validated anywhere. `hasScansAvailable()` and `deductScanCredit()` both read and write that blob locally. `topUpWallet()` (`paymentService.js:60-80`) does not call a payment gateway at all — it `await`s a 2.2-second `setTimeout` and then credits the wallet:

```js
export async function topUpWallet({ userId, packageId, ... }) {
  await new Promise(r => setTimeout(r, 2200)); // simulate gateway call
  ...
  wallet.balanceScans += pkg.scans;   // money never changes hands
```

**Who this breaks:** you. On an emulator, a rooted device, or via `adb`, the wallet file is editable in seconds — and even without that, the modal's "payment" is a timer, so *every* user gets free credits by tapping through it. Each granted credit spends real money on the key from S1. The app currently charges UGX 500 for something that costs you an Anthropic call and enforces neither side of that trade.

**Fix:** balance and debit must live on the server, in the same transaction as the model call — the proxy from S1 is where this belongs. The client keeps a *display* copy only. Wire a real gateway (Flutterwave covers MTN MoMo + Airtel + card in Uganda in one integration) and credit the wallet from its **webhook**, never from the client:

```
POST /screenings/analyze  →  verify JWT → SELECT balance FOR UPDATE
                          →  if balance < 1: 402 → else debit, call Claude
                          →  on model error: rollback the debit
POST /payments/webhook    →  verify gateway signature → credit balance
```

**Effort:** 2-3 days including the gateway.

---

### S3 — HIGH · Production build points at a laptop on someone's LAN
**Location:** `src/services/authService.js:5-6`

```js
// const API_BASE = 'https://triorgan-backend.onrender.com/api/v1';
const API_BASE = 'http://10.44.201.158:8000/api/v1';
```

The deployed URL is commented out and a private RFC1918 address is live. `eas.json:14-16` has a `production` profile that will happily build and ship this. Every login, registration and password reset in a released build hits an unroutable host and dies in the 15-second timeout at `authService.js:27` — the user sees "Cannot connect to server… Is your backend running at http://10.44.201.158:8000/api/v1?", which also leaks your internal topology into a user-facing string (`authService.js:42`).

Plain `http://` is a second problem: Android blocks cleartext by default from API 28 up unless you opt in, and iOS ATS blocks it — so this fails even on the right network in a release build.

**Fix:** environment-select it, never hand-edit it.

```js
// app.json → "extra": { "apiBase": "https://triorgan-backend.onrender.com/api/v1" }
import Constants from 'expo-constants';
const API_BASE = Constants.expoConfig.extra.apiBase;
```

Use an `app.config.js` that switches on `process.env.EAS_BUILD_PROFILE` so dev keeps the LAN IP and production cannot. Also drop `API_BASE` from the user-facing error text.

**Effort:** 30 minutes.

---

### S4 — HIGH · The app tells users their health data never leaves the device, while sending it to a third party
**Location:** claim at `src/screens/HistoryScreen.js:142` and `src/screens/LoginScreen.js:100`; behaviour at `src/services/claudeService.js:103-116`

> "Your screening history is stored securely on this device only. **GOMO does not upload your health data to any server.**" — `HistoryScreen.js:142`
> "Your health data is stored only on this device." — `LoginScreen.js:100`

Meanwhile `analyzeSymptoms()` POSTs the selected symptoms *and a base64 photograph of the user's body* to `api.anthropic.com`. `AuthPromptModal.js:38` repeats the claim ("All data stays on your device") as a selling point for creating an account.

**Who this breaks:** users, who consent to a screening on the basis of a statement that is not true, and you — this is the kind of misrepresentation that regulators and app stores act on, and it concerns health data in a jurisdiction (Uganda) with a Data Protection and Privacy Act.

I am flagging the code contradiction, which is unambiguous; whether your actual policy is compliant is a legal question, not one I can answer from the repo.

**Fix:** change the copy to match the behaviour, and say so before the upload, not after:

```jsx
<Text style={styles.historyNote}>
  Screening results are stored on this device. To analyse a scan, your selected
  symptoms and any photo you attach are sent securely to our AI provider. They
  are not used to train models and are not stored after analysis.
</Text>
```

(Only promise the last sentence if your provider agreement actually says it.) Add a one-time consent checkbox before the first analysis.

**Effort:** copy — 1 hour. Consent flow — half a day.

---

### S5 — MEDIUM · Auth token written to the device log
**Location:** `src/screens/RegisterScreen.js:27`

```js
const result = await register({ fullName, email, phone, password });
console.log(result);   // { success, user, token: 'eyJhbGciOi...' }
```

`register()` returns the bearer token (`authService.js:106`). `console.log` in a release RN build still reaches logcat, so the token is readable by `adb logcat` and by any other app holding `READ_LOGS` on older Androids.

**Fix:** delete the line. Then add `babel-plugin-transform-remove-console` to `babel.config.js` under `env.production` so this class of leak cannot recur.

**Effort:** 10 minutes.

---

## 2. Architecture & boundaries

### A1 — HIGH · A second, dead copy of the app lives at the repo root
**Location:** `screens/HomeScreen.js`, `screens/CheckerScreen.js`, `screens/ResultsScreen.js`, `screens/EducationScreen.js`, `constants/data.js`, `constants/symptoms.js`, `constants/colors.js`, `utils/riskAssessment.js` — ~1,600 LOC, ~20% of the codebase

These files import only each other. Nothing in `App.js` or `src/` reaches them (verified by grep across every import site). They are an earlier iteration that was copied into `src/` and never deleted — `constants/colors.js` and `src/constants/colors.js` are different, and `constants/symptoms.js` and `src/constants/symptoms.js` have diverged into genuinely different data shapes (`HEART_SYMPTOMS` vs `SYMPTOMS`).

**Who this breaks:** whoever maintains this next. Editing `constants/symptoms.js` to fix a symptom description changes nothing at runtime, and the failure is silent — no error, the app just keeps showing the old text. `utils/riskAssessment.js` also encodes a whole scoring algorithm that no longer runs.

Same category, smaller: `src/screens/HistoryScreen.js` is imported at `App.js:24` but never registered as a `Stack.Screen`, so those 248 lines are unreachable; `src/components/PaymentGateModal.js` (196 lines) is imported nowhere; `src/services/paymentService.backup.js` (250 lines) is a stale copy whose exports other files still try to import (see C1/C2); `src/services/Untitled-1.ipynb` is an 873 KB Jupyter notebook containing a Python traceback; `fix_navigation.py` is a one-off codemod.

**Fix:** delete `screens/`, `constants/`, `utils/`, `paymentService.backup.js`, `Untitled-1.ipynb`, `fix_navigation.py`. Either route `HistoryScreen` (it looks finished and useful — a `HistoryTab` or a stack entry under `ProfileStack`) or delete it. Commit first so it is recoverable.

**Effort:** 30 minutes, after confirming with the team that nothing is mid-migration.

---

### A2 — MEDIUM · Screens own navigation, business rules, persistence and presentation at once
**Pattern.** Clearest at `src/screens/DetectionScreen.js:108-159`, but the same shape is in `src/screens/ProfileScreen.js:26-78`, `src/screens/PaymentScreen.js:54-90`, `src/components/PaymentModal.js:57-82`, `src/screens/ResultScreen.js:56-73`.

`handleAnalyze` in `DetectionScreen` does, in one function: auth gate → credit check → credit debit → wallet state update → AI call → image marshalling → navigation. `ResultScreen` writes to the `scan_history` AsyncStorage key directly (`ResultScreen.js:58-71`) while `HistoryScreen`, `HomeScreen` and `ProfileScreen` each read and parse that same raw key themselves — four call sites, four copies of the JSON shape, no module owns it.

**Who this breaks:** you, on the next change. Adding a "refund on failure" rule means finding every screen that debits. Changing the history record shape means finding four parsers. None of this is unit-testable, because the logic only exists inside a component.

**Fix:** extract the orchestration into a service and a `historyService` that owns its key:

```js
// src/services/screeningService.js
export async function runScreening({ userId, organ, selectedSymptoms, allSymptoms, imageBase64 }) {
  const debit = await deductScanCredit(userId, organ.name);
  if (!debit.success) return { success: false, reason: 'NO_CREDIT' };
  const result = await analyzeSymptoms({ organ: organ.name, selectedSymptoms, allSymptoms, imageBase64 });
  if (!result.success) { await refundScanCredit(userId, 'Analysis failed'); return result; }
  await historyService.save({ organ, result, selectedSymptoms });
  return result;
}
```

The screen then calls one function and renders three states.

**Effort:** 1 day for the screening + history paths.

---

### A3 — LOW · `registerRootComponent` is called twice
**Location:** `App.js:190` and `index.js:8`

`package.json:4` sets `"main": "App.js"`, so `index.js` is dead — but `App.js:190` also does `export default registerRootComponent(App)`, which is the job of the entry file, not the component module. Two entry points, one of them unreachable, and the default export of `App.js` is now a registration side-effect rather than a component.

**Fix:** set `"main": "index.js"` and make `App.js` end with `export default App;`. (This is Expo's default layout.)

**Effort:** 5 minutes.

---

## 3. State management

### M1 — HIGH · Three competing sources of truth for wallet and pricing
**Location:** `src/services/paymentService.js:4-13`, `src/services/walletService.js:14-32`, `src/constants/payments.js:5-10`

Three modules define the wallet and its prices, and they disagree:

| | storage key | balance unit | 1-scan price | packages |
|---|---|---|---|---|
| `paymentService.js:21,30` | `triorgan_wallet_<uid>` (per user) | **scans** (`balanceScans`) | UGX 500 / $0.50 | 1/5/10/20 |
| `walletService.js:10,40` | `triorgan_wallet` (global) | **dollars** (`balance`) | $0.50 | 2/6/12/30 |
| `constants/payments.js:5` | — | — | UGX 500 / $0.50 | 3/10/30 |

`DetectionScreen`, `WalletScreen`, `ProfileScreen` and `PaymentModal` use the first. `PaymentScreen` uses the third for prices and the (missing) second for credits. `walletService.js` is imported by nothing at all — including its `refundScan()` (`walletService.js:97`), which is the exact function C3 below needs.

**Who this breaks:** users see one set of bundles in `WalletScreen` (1/5/10/20 scans) and a different set in `PaymentScreen` (1/3/10/30 scans), at different per-scan rates, for the same product — depending on which screen they happened to open. Any refund written through `walletService` would credit a wallet no screen reads.

**Fix:** delete `walletService.js`. Move `PRICING`/`PAYMENT_METHODS` into `src/constants/payments.js` as the single definition, have `paymentService.js` import from it, and delete the duplicates in `paymentService.js:4-19`. Point `PaymentScreen` at `paymentService`.

**Effort:** 2-3 hours.

---

### M2 — MEDIUM · Server state cached in component state with no invalidation
**Pattern:** `src/screens/DetectionScreen.js:38-42`, `src/screens/ProfileScreen.js:21,30`, `src/screens/WalletScreen.js:19,27-34`, `src/components/PaymentModal.js:30,38-41`

Each screen copies the wallet into its own `useState` on mount or focus. Four independent caches of one value, with no shared invalidation. `DetectionScreen` reloads only when `user` changes (`:42`) — so buy credits in `WalletScreen`, walk back to `Detection`, and the button still reads "0 credits left" (`DetectionScreen.js:317`) until the screen is destroyed.

The workaround is already visible: `PaymentModal` returns the new wallet through `onSuccess` so each parent can hand-patch its own copy (`DetectionScreen.js:174`, `WalletScreen.js:36-40`) — prop-drilling a cache invalidation by hand.

**Fix:** since the wallet is genuinely server state (once S2 is fixed), use a library rather than hand-rolling this — `@tanstack/react-query` is ~13 KB and gives you one cache, loading/error states, and `invalidateQueries` after a top-up:

```js
const { data: wallet, isLoading } = useQuery({ queryKey: ['wallet', user?.id], queryFn: () => getWallet(user.id), enabled: !!user });
// in PaymentModal, on success:
queryClient.invalidateQueries({ queryKey: ['wallet'] });   // every screen updates
```

If you would rather not add a dependency, hold the wallet in `AuthContext` next to `user`.

**Effort:** 4 hours with react-query, including removing the `onSuccess` plumbing.

---

### M3 — MEDIUM · Stale closure in `useFocusEffect` — profile shows another session's data
**Location:** `src/screens/ProfileScreen.js:26-34`

```js
useFocusEffect(useCallback(() => {
  loadHistory();
  if (user) {                                  // ← `user` captured on first render
    getWallet(user.id).then(w => setCredits(w.balanceScans));
    getTransactions(user.id).then(setTransactions);
  }
}, []));                                       // ← empty deps
```

The callback closes over the first `user` value forever. Profile is a tab, so it mounts once and stays mounted: sign in while it is mounted and the effect still sees `user === null`, so credits and transactions never load; sign out and back in as someone else and it keeps calling `getWallet(oldUserId)`, rendering the previous account's balance and transaction list.

`WalletScreen.js:23-25` gets this right (`[user]` in the deps) — so this is an inconsistency, not a house style. `HistoryScreen.js:17-21` has the same empty-deps shape but genuinely closes over nothing.

**Fix:** `}, [user]));` and hoist `loadHistory` inside the callback (or wrap it in its own `useCallback`). A `react-hooks/exhaustive-deps` lint rule catches this class permanently — see T1.

**Effort:** 15 minutes.

---

### M4 — MEDIUM · Two logout paths, only one of which tells the server
**Location:** `src/context/AuthContext.js:36-43` vs `src/services/authService.js:146-151`

`authService.logout()` calls `POST /auth/logout` and then clears the three keys. `AuthContext.logout()` clears the same three keys and skips the server call. `ProfileScreen.js:54` uses the context one — so the only logout button in the app never invalidates the session server-side, and the refresh token stays valid until it expires.

**Fix:** have the context delegate:

```js
import { logout as apiLogout } from '../services/authService';
const logout = async () => { await apiLogout(); setUser(null); };
```

**Effort:** 15 minutes.

---

### M5 — LOW · `useEffect` doing work that belongs in render
**Location:** `src/screens/HomeScreen.js:33-37`

```js
useEffect(() => {
  if (user) loadRecentScans();
  const tipIndex = new Date().getDate() % HEALTH_TIPS.length;
  setTodayTip(HEALTH_TIPS[tipIndex]);
}, [user]);
```

The tip is a pure function of today's date and a module constant. Putting it in state forces a second render on every mount and every `user` change, and the first paint always shows `HEALTH_TIPS[0]` before flipping. (`recentScans` is separately never rendered anywhere in the file — dead state.)

**Fix:** `const todayTip = HEALTH_TIPS[new Date().getDate() % HEALTH_TIPS.length];` at the top of the component, drop the state. Delete `recentScans` or render it.

**Effort:** 10 minutes.

---

## 4. Data fetching

### C1 — CRITICAL · `PaymentScreen` crashes on open — it imports functions that do not exist
**Location:** `src/screens/PaymentScreen.js:11`, called at `:39` and `:63`

```js
import { processPayment, getCredits } from '../services/paymentService';
```

`paymentService.js` exports `PRICING, PAYMENT_METHODS, getWallet, hasScansAvailable, getTransactions, topUpWallet, deductScanCredit, formatUGX, formatUSD, formatDate` — neither `processPayment` nor `getCredits` is among them. Both live in `paymentService.backup.js:46,232`, the stale copy. ES module interop leaves them `undefined` rather than throwing at import time, so this fails at the call:

```js
useEffect(() => { if (user) loadCredits(); }, [user]);
const loadCredits = async () => { const c = await getCredits(user.id); }   // TypeError: getCredits is not a function
```

**Who this breaks:** every signed-in user who taps "Buy Credits" in Profile — `PaymentScreen` is routed at `App.js:68`. The `useEffect` throws during mount, so it is a red screen in dev and a hard crash in production. `handlePay` (`:63`) would throw the same way if the screen ever rendered.

**Fix:** either point the screen at the live module and the wallet shape it actually uses, or delete `PaymentScreen` and route Profile's button at the already-working `PaymentModal` that `WalletScreen` uses. Given M1, the second is cleaner:

```js
// ProfileScreen: replace navigation.navigate('Payment', ...) with
const [paymentModal, setPaymentModal] = useState(false);
<PaymentModal visible={paymentModal} onClose={...} onSuccess={...} userId={user.id} organName="your next" />
```

**Effort:** 30 minutes to delete-and-reroute; 2 hours to port `PaymentScreen` properly.

---

### C2 — HIGH · Same broken-import pattern in two more screens (latent)
**Location:** `src/screens/DetectionScreen.js:13-14` (`hasCredits`, `consumeCredit`), `src/screens/HomeScreen.js:10` (`getCredits`)

Identical cause to C1 — names that only exist in `paymentService.backup.js`. These two do not crash *today* only because nothing calls them: `DetectionScreen` uses `hasScansAvailable`/`deductScanCredit` instead, and `HomeScreen` never calls `getCredits` (though `HomeScreen.js:190-204` still carries the `creditsBadge` styles for the UI that was meant to use it). They are trip-wires: the next person who wires up that credits badge gets C1's crash.

**Fix:** delete the three dead import bindings. This whole class disappears once `paymentService.backup.js` is removed (A1) and a lint rule flags unresolved imports (T1).

**Effort:** 10 minutes.

---

### C3 — HIGH · The credit is spent before the AI call and never returned when it fails
**Location:** `src/screens/DetectionScreen.js:124-158`

```js
const deduct = await deductScanCredit(user.id, organ.name);   // :124  money gone
...
const result = await analyzeSymptoms({ ... });                // :137
if (result.success) { navigation.navigate('Result', ...) }
else { Alert.alert('Analysis Failed', result.error); }        // :152  no refund
```

`analyzeSymptoms` swallows every failure into `{success: false}` (`claudeService.js:132-138`) — network drop, 429 rate limit, 500, malformed JSON, all of it. Every one of those paths burns a paid credit and shows an alert. The `catch` at `:154` does not refund either.

`walletService.js:97` already contains a written `refundScan()` — pointed at the wallet no screen reads (M1).

**Who this breaks:** users on Ugandan mobile networks, where a dropped request is routine, paying UGX 500 per failure. This is the finding most likely to generate refund requests and one-star reviews.

**Fix:** refund on every non-success path.

```js
const deduct = await deductScanCredit(user.id, organ.name);
if (!deduct.success) { setPaymentModal(true); return; }
setAnalyzing(true);
try {
  const result = await analyzeSymptoms({ ... });
  if (!result.success) {
    const w = await refundScanCredit(user.id, 'Analysis failed');
    setWallet(w);
    Alert.alert('Analysis Failed', `${result.error}\n\nYour credit has been returned.`);
    return;
  }
  navigation.navigate('Result', { ... });
} catch (e) {
  const w = await refundScanCredit(user.id, 'Unexpected error');
  setWallet(w);
  Alert.alert('Error', 'Something went wrong — your credit has been returned.');
} finally { setAnalyzing(false); }
```

Add the matching `refundScanCredit(userId, reason)` to `paymentService.js` (mirror `deductScanCredit`, `balanceScans += 1`, log a `REFUND` transaction). Once S2 moves this server-side, make it a transaction rollback instead.

**Effort:** 2 hours.

---

### C4 — HIGH · No timeout on the AI request — the spinner can hang forever
**Location:** `src/services/claudeService.js:103-116`

The `fetch` to `api.anthropic.com` has no `AbortController` and no timeout. `authService.js:26-34` does it correctly with a 15-second abort — the pattern exists in the codebase and was not applied here, on the one request that carries a base64 photo over a mobile link and is the slowest thing the app does.

**Who this breaks:** a user on a weak connection sees "Analyzing with AI…" indefinitely. `analyzing` is only cleared in `finally` (`DetectionScreen.js:156`), which never runs, so the button stays disabled and the credit is already gone (C3). Their only recovery is force-quitting the app.

**Fix:** reuse the existing pattern with a longer budget — vision requests are slow, so 60s, not 15s:

```js
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 60000);
try {
  const response = await fetch(CLAUDE_API_URL, { ..., signal: controller.signal });
  ...
} finally { clearTimeout(timeoutId); }
// in the catch:
if (error.name === 'AbortError') return { success: false, error: 'The analysis took too long. Please check your connection and try again.' };
```

Consider streaming once this is server-side; it also removes the timeout risk for long responses.

**Effort:** 1 hour.

---

### C5 — MEDIUM · `max_tokens: 1500` silently truncates the response into a parse failure
**Location:** `src/services/claudeService.js:112`, parsed at `:127-130`

The system prompt (`:37-59`) asks for a JSON object with `findings[]` (symptom + significance + urgency each) and `recommendations[]` (category + title + a 2-3 sentence detail each). For a user who ticks five symptoms, that comfortably exceeds 1500 output tokens. When it does, the response stops mid-object, `rawText.match(/\{[\s\S]*\}/)` grabs an unbalanced fragment, and `JSON.parse` throws — surfacing to the user as the generic "Failed to connect to AI service. Please check your internet connection", which is the wrong diagnosis and sends them to retry on the same input, burning another credit (C3).

The failure is input-dependent, so it will pass testing with two symptoms and fail in the field with six.

**Fix:** raise the ceiling and check the stop reason rather than guessing from a parse error.

```js
body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: 8000, system: SYSTEM_PROMPT, messages }),
...
const data = await response.json();
if (data.stop_reason === 'max_tokens') {
  return { success: false, error: 'The analysis was cut short. Please try again with fewer symptoms selected.' };
}
```

The API also supports structured outputs (`output_config.format` with a JSON schema), which removes the regex-and-parse step entirely — worth doing when this moves server-side.

**Effort:** 30 minutes for the guard; half a day for structured output.

---

### C6 — MEDIUM · Unawaited promises with no loading or error state
**Pattern:** `src/screens/DetectionScreen.js:41`, `src/screens/ProfileScreen.js:30-31`, `src/components/PaymentModal.js:34`, `src/screens/WalletScreen.js:23-34`

```js
React.useEffect(() => { if (user) { getWallet(user.id).then(setWallet); } }, [user]);   // DetectionScreen:41
getWallet(user.id).then(w => setCredits(w.balanceScans));                               // ProfileScreen:30
```

No `.catch()`, no loading flag, no cancellation. Three consequences: (1) a rejection is an unhandled promise rejection — silent in production, a yellow box in dev; (2) `wallet` stays `null` on failure and the UI renders the fallback as fact — `DetectionScreen.js:317` prints "(0 credits left)" and `:324` prints "⚠️ No scan credits" to a user who has credits; (3) `.then(setWallet)` after the screen unmounts sets state on a dead component.

`WalletScreen.load()` (`:27-34`) is the sharpest case — `Promise.all` with no `catch` at all, so one AsyncStorage rejection takes out both the balance and the transaction list with no feedback.

**Fix:** the react-query migration in M2 gives you `isLoading`/`isError` for free and cancels on unmount. Minimum viable version now — distinguish "loading" from "zero":

```js
const [wallet, setWallet] = useState(undefined);   // undefined = loading, null = failed
useEffect(() => {
  let alive = true;
  if (user) getWallet(user.id).then(w => alive && setWallet(w)).catch(() => alive && setWallet(null));
  return () => { alive = false; };
}, [user]);
```

and render a skeleton while `wallet === undefined`.

**Effort:** 3 hours across the four sites.

---

### C7 — MEDIUM · Double-tap debits twice and fires two AI calls
**Location:** `src/screens/DetectionScreen.js:108-132`, with the underlying race at `src/services/paymentService.js:83-90`

`handleAnalyze` awaits twice (`hasScansAvailable` at `:118`, `deductScanCredit` at `:124`) before it ever sets `analyzing` at `:132`. The button's `disabled` prop is bound to `analyzing` (`:303`), so through both awaits the button is live. Two quick taps run two full passes.

`deductScanCredit` compounds it — it is a read-modify-write with no locking:

```js
const wallet = await getWallet(userId);   // both callers read balanceScans: 1
wallet.balanceScans -= 1;
await saveWallet(wallet);                 // both write 0; two scans ran, one credit charged
```

So depending on interleaving you either charge twice for one scan or run two scans for one credit. Both are wrong, in opposite directions. The same race exists in `topUpWallet` (`:66-70`).

**Fix:** guard the handler with a ref (state is too slow — it does not update until re-render) and disable the button on both conditions:

```js
const inFlight = useRef(false);
const handleAnalyze = async () => {
  if (inFlight.current) return;
  inFlight.current = true;
  try { /* existing body */ } finally { inFlight.current = false; }
};
<TouchableOpacity disabled={analyzing || selectedSymptoms.length === 0} ... />
```

The storage race only truly closes when the balance is server-side under a row lock (S2).

**Effort:** 1 hour for the client guard.

---

## 5. Rendering performance

### P1 — MEDIUM · Every list is a `ScrollView` + `.map` — nothing is virtualized
**Pattern:** `src/screens/HistoryScreen.js:102` (up to 50 scan cards), `src/screens/WalletScreen.js:143` (up to 200 transaction rows), `src/screens/ProfileScreen.js` (history + transactions), `src/screens/EducationScreen.js:59`, `src/screens/DetectionScreen.js:213`

`ScrollView` mounts every child immediately and keeps them all mounted. `paymentService.js:54` caps transactions at 200 and `ResultScreen.js:71` caps history at 50, so an active user's `WalletScreen` mounts 200 `TxRow` components — each with an `Ionicons`, five `Text` nodes and a `formatDate` call (`:69`) that constructs a `Date` and runs `toLocaleDateString` — before the first frame paints. On the low-end Android hardware this app targets, that is a visible freeze on tab switch.

`OnboardingScreen.js:70` already uses `Animated.FlatList`, so the API is known here.

**Fix:** `FlatList` for the two unbounded lists. It is close to a drop-in:

```jsx
<FlatList
  data={transactions}
  keyExtractor={(tx, i) => tx.id || String(i)}
  renderItem={({ item }) => <TxRow tx={item} />}
  ListHeaderComponent={<PricingCard />}
  ListEmptyComponent={<EmptyTx />}
  initialNumToRender={10}
  removeClippedSubviews
/>
```

`EducationScreen` and `DetectionScreen` have bounded, small lists — leave them.

**Effort:** 3 hours for `WalletScreen` + `HistoryScreen` + `ProfileScreen`.

---

### P2 — LOW · Unstable references force re-renders that memoization would stop
**Pattern:** `src/context/AuthContext.js:46`, `src/screens/DetectionScreen.js:213-290`, `src/screens/HistoryScreen.js:102`, `src/screens/ResultScreen.js:158`

`AuthContext` builds a fresh `value` object on every render (`:46`), and `signIn`/`logout` are re-created each time — so every `useAuth()` consumer re-renders whenever the provider does, and either function is unsafe to put in a dependency array. Inside the render loops, style arrays and arrow props are allocated per item (`DetectionScreen.js:218,228,235`), and child components (`SeverityBadge`, `TxRow`, `FindingRow`, `OrganCard`) are unmemoized, so all of them re-render when any parent state changes — ticking one symptom re-renders all five symptom cards.

The absolute cost is small at current list sizes; it becomes P1's multiplier once lists grow.

**Fix:**

```js
// AuthContext.js
const signIn  = useCallback(async (u) => { ... }, []);
const logout  = useCallback(async () => { ... }, []);
const value   = useMemo(() => ({ user, loading, signIn, logout }), [user, loading, signIn, logout]);
```

and `export default React.memo(TxRow)` on the row components. Hoist the constant style arrays out of the map bodies.

**Effort:** 2 hours.

---

### P3 — LOW · Two dead style/render artifacts
**Location:** `src/screens/ResultScreen.js:27` and `src/screens/ProfileScreen.js:1`

- `fontFamily: 'var(--font-h)'` — a CSS custom property in a React Native style. RN has no CSS variables; this resolves to a font name that does not exist. On Android it silently falls back; on iOS an unknown `fontFamily` can throw. Web-code residue.
- `if (typeof WeakRef === 'undefined') { global.WeakRef = class WeakRef { ... deref() { return this._t; } } }` sits on line 1 *above* the imports. ES imports hoist, so every import in the file — and its whole transitive graph — has already run before this line executes; if anything in that graph needed `WeakRef` at module scope, the shim is too late. The shim itself holds a strong reference, so it defeats the point of a weak ref and leaks whatever it holds.

**Fix:** delete both. If a `WeakRef` polyfill is genuinely needed, it belongs at the top of the real entry file (`index.js`), before any app import.

**Effort:** 10 minutes.

---

## 6. Type safety

### TS1 — HIGH · The AI response is parsed and rendered with no validation
**Location:** `src/services/claudeService.js:130`, consumed at `src/screens/ResultScreen.js:75-193`

```js
const result = JSON.parse(jsonMatch[0]);
return { success: true, data: result };     // typed as: anything
```

The object then drives the entire results screen unchecked: `r.riskScore` into a `<Text>` (`ResultScreen.js:145`), `r.findings.map` (`:158`), `rec.category.toUpperCase()` (`:176`), `r.riskSummary`, `r.nextSteps`, `r.disclaimer`. A model response that omits `recommendations[].category`, or returns `riskScore` as `"85"`, or drops `positiveNote`, produces either a `TypeError` on a screen the user has already paid for, or a card rendering `undefined`.

This is the weakest boundary in the app because it is the *only* one whose shape is not under your control — it is a natural-language model's best effort at following a prompt. There are no PropTypes and no TypeScript anywhere in the project, so nothing else catches it either.

**Fix:** validate at the boundary, in the service, before returning success. `zod` is ~8 KB:

```js
import { z } from 'zod';
const AnalysisSchema = z.object({
  riskLevel: z.enum(['LOW','MODERATE','HIGH','CRITICAL','INVALID']),
  riskScore: z.number().min(0).max(100),
  riskSummary: z.string(),
  findings: z.array(z.object({ symptom: z.string(), significance: z.string(), urgency: z.enum(['routine','soon','urgent','emergency']) })).default([]),
  recommendations: z.array(z.object({ category: z.string(), title: z.string(), detail: z.string() })).default([]),
  nextSteps: z.string(), disclaimer: z.string(), positiveNote: z.string().default(''),
});
const parsed = AnalysisSchema.safeParse(JSON.parse(jsonMatch[0]));
if (!parsed.success) return { success: false, error: 'The AI returned an unexpected response. Please try again.' };
return { success: true, data: parsed.data };
```

That single guard also turns C3's refund path into the correct behaviour for a malformed response.

**Effort:** half a day, including the same treatment for the auth endpoints in `authService.js:73-86`.

---

### TS2 — MEDIUM · Field names drift between writer and reader with nothing to catch it
**Location:** `src/screens/WalletScreen.js:63-64` vs `src/services/paymentService.js:30,68-69`

```js
const totalSpent = wallet?.totalSpent ?? 0;    // WalletScreen:63
const totalScans = wallet?.totalScans ?? 0;    // WalletScreen:64
```

`paymentService` writes `totalSpentUgx`, `totalSpentUsd` and `totalScansUsed`. Neither name the screen reads exists, so the `??` fallbacks always fire: the "Scans Used" and "Total Spent" tiles on the wallet header (`:96-101`) permanently display `0` and `UGX 0`, no matter how much the user has spent. The optional chaining makes it look deliberate.

The same class shows at `HomeScreen.js:64` — `user.fullName.split(' ')[0]` with no guard, where `AuthContext.signIn` accepts any object shape (`AuthContext.js:28`) and a `fullName`-less user crashes the home header.

**Fix:** rename the reads to the real fields (`wallet?.totalScansUsed`, `formatUGX(wallet?.totalSpentUgx ?? 0)`). Structurally, this is what TypeScript exists for — a `Wallet` interface would have flagged all three at compile time. Adopting TS incrementally is realistic here: `tsc --allowJs --checkJs` on `src/services/` alone would catch C1, C2 and TS2 today.

**Effort:** 20 minutes for the fields; 2-3 days to convert the services and contexts to TypeScript.

---

## 7. Accessibility

### AX1 — HIGH · No accessibility props anywhere in the app
**Pattern:** zero occurrences of `accessibilityLabel`, `accessibilityRole`, `accessibilityHint` or `accessible` across all 17 files in `src/` (verified by grep). Worst instances are the icon-only controls, which expose no text at all to TalkBack/VoiceOver:

| Control | Location | Announced as |
|---|---|---|
| Back button | `DetectionScreen.js:181`, `ResultScreen.js:114`, `RegisterScreen.js:42`, `ForgotPasswordScreen.js:29` | *(nothing)* |
| Clear-history (destructive) | `HistoryScreen.js:65` | "Clear" only |
| Modal close | `PaymentModal.js:121` | *(nothing)* |
| Password visibility toggle | `LoginScreen.js:65` | *(nothing)* |
| Symptom checkbox | `DetectionScreen.js:220-239` | symptom text, but never its checked state |

The symptom checkbox is the most consequential: it is a custom `TouchableOpacity` + `View` (`:234-239`), so a screen-reader user can hear the symptom name but has no way to know whether they have selected it — the core interaction of the app is unusable blind.

**Who this breaks:** blind and low-vision users of a health screening tool for a region where visual impairment from diabetes and hypertension is common — an audience with an above-average need for exactly this product.

**Fix:** labels on every icon-only control, and state on the custom checkbox:

```jsx
<TouchableOpacity
  accessibilityRole="checkbox"
  accessibilityState={{ checked: isSelected }}
  accessibilityLabel={`${symptom.name}. ${symptom.description}`}
  accessibilityHint="Double tap to toggle this symptom"
  onPress={() => toggleSymptom(symptom.id)}
>
<TouchableOpacity accessibilityRole="button" accessibilityLabel="Go back" onPress={() => navigation.goBack()}>
```

Also set `accessibilityLiveRegion="polite"` on the risk-result card (`ResultScreen.js:135`) so the outcome is announced, and give `Modal`s (`PaymentModal.js:92`, `AuthPromptModal.js:22`) an `accessibilityViewIsModal` so focus is trapped.

**Effort:** 1 day for the whole app.

---

### AX2 — MEDIUM · Form labels are visual only; no programmatic association
**Location:** `src/screens/LoginScreen.js:57-68` + the `Field` wrapper at `:108-118`; same pattern in `RegisterScreen.js:58-75`, `ForgotPasswordScreen.js`, `PaymentModal.js` phone input

`Field` renders a `<Text>` label as a *sibling* of the `TextInput`. RN has no `htmlFor` — the association has to be explicit, and it is not. A screen reader focusing the email input announces only the placeholder ("you@example.com"), never "Email Address", and never that it is required.

The error box (`LoginScreen.js:50-55`) is a related gap: it appears above the form on failure with no `accessibilityLiveRegion`, so a failed login is silent — the user hears nothing and cannot tell whether the tap registered.

**Fix:**

```jsx
function Field({ label, icon, children }) { /* pass label down */ }
<TextInput accessibilityLabel="Email address" accessibilityHint="Enter the email you registered with" ... />
{error !== '' && <View accessibilityLiveRegion="assertive" accessibilityRole="alert" style={styles.errorBox}>...}
```

**Effort:** 2 hours.

---

## 8. Testing

### T1 — HIGH · No tests, no linter, no CI — on money and medical-advice paths
**Location:** repo root — no `jest.config`, no `__tests__`, no `*.test.js`, no `.eslintrc`, no `tsconfig.json`, no `.github/`. `package.json:5-10` has four scripts, all `expo start` variants.

Uncovered, in descending order of what it costs you to be wrong:

1. **`paymentService.js:60-99`** — debit, top-up, refund. Real money. Contains the C7 race and the C3 missing refund.
2. **`claudeService.js:80-139`** — the parse-and-return path that decides what medical guidance a user is shown. Contains C5 and TS1.
3. **`authService.js:72-137`** — `saveSession`'s ten `??` fallbacks (`:73-81`) encode assumptions about the backend response shape that nothing verifies.
4. **`utils/riskAssessment.js`** — a complete scoring algorithm, in the dead tree (A1), never called and never tested.

Three of this review's highest-severity findings (C1, C2, M3) are things a linter catches for free. `eslint-plugin-react-hooks` alone would have flagged M3, and `import/no-unresolved` would have flagged C1 before it ever shipped.

**Fix:** ordered by value per hour —

```bash
npx expo install --dev eslint eslint-config-expo jest-expo jest @testing-library/react-native
```

```jsonc
// package.json
"scripts": { "lint": "eslint .", "test": "jest" },
"jest": { "preset": "jest-expo" }
```

1. ESLint with `eslint-config-expo` + `react-hooks/exhaustive-deps` as an error. Half a day including fixing what it finds.
2. Unit tests for `paymentService` (debit at zero balance, refund restores, concurrent debits) and `claudeService`'s parsing (truncated JSON, missing fields, `INVALID` risk level) — pure functions, no rendering needed. 1 day.
3. One integration test of `DetectionScreen`'s analyze flow with `analyzeSymptoms` mocked to fail, asserting the credit came back. Half a day.
4. GitHub Actions running `lint` + `test` on PRs. 1 hour.

**Effort:** 2-3 days for a foundation that pays for itself immediately.

---

## 9. Dependencies & bundle

### D1 — MEDIUM · `@anthropic-ai/sdk` is a declared dependency that no file imports
**Location:** `package.json:22`; 1.9 MB in `node_modules/@anthropic-ai`; zero import sites in `src/`, `App.js` or `index.js`

`claudeService.js` calls the REST endpoint with raw `fetch` instead. The SDK is dead weight — and if someone did wire it up client-side it would need `dangerouslyAllowBrowser`, which is the wrong direction given S1.

`react-native-url-polyfill` (`package.json:21`) is imported twice (`App.js:1`, `ProfileScreen.js:2`) — the second is redundant. `react-native-gesture-handler` (`package.json:18`) is declared and imported nowhere; it is a peer of some navigators, so verify before removing.

**Fix:** `npm uninstall @anthropic-ai/sdk`. Keep it uninstalled — the server-side proxy from S1 is where it belongs, in the backend's `package.json`.

**Effort:** 15 minutes.

---

### D2 — MEDIUM · Expo SDK 51 is roughly two years behind
**Location:** `package.json:12-13` — `expo: ~51.0.0`, `react-native: 0.74.5`

SDK 51 shipped mid-2024. Expo supports a rolling window of recent SDKs for EAS Build and OTA updates; at some point older SDKs stop being buildable on current infrastructure, and app stores enforce a minimum `targetSdkVersion` on new submissions independently. RN 0.74 also predates the New Architecture default, so the longer this waits the larger the jump.

I have not tried the upgrade, so I cannot tell you which of your dependencies break — this is a "schedule it" finding, not a "do it this afternoon" one.

**Fix:** `npx expo install --fix`, then one SDK at a time (51 → 52 → 53 → …), reading each release's breaking changes and smoke-testing between. Do it on a branch, before the codebase grows.

**Effort:** 2-4 days, hard to predict.

---

### D3 — LOW · The model ID is two generations old
**Location:** `src/services/claudeService.js:10` — `const CLAUDE_MODEL = 'claude-sonnet-4-5';`

Current Sonnet is `claude-sonnet-5` (same price tier, better instruction-following — which directly helps the JSON-shape reliability behind C5 and TS1). If accuracy matters more than cost on a medical-screening path, `claude-opus-5` is the stronger choice.

Two related notes for when this moves server-side: the request sets no `thinking` parameter, and adaptive thinking (`thinking: {type: 'adaptive'}`) is worth enabling on a reasoning task like risk assessment; and the `data.content?.[0]?.text` access at `:124` assumes the first content block is text, which stops holding once thinking blocks are in the response — iterate and match on `block.type === 'text'` instead.

**Fix:** update the constant and add the block-type guard. Re-check the output against a few real symptom sets after switching, since prompt behaviour shifts between model generations.

**Effort:** 1 hour including a spot-check.

---

## Uncertain — flagged, not asserted

### U1 — Rules-of-Hooks violation in `ResultScreen`, crash path unconfirmed
**Location:** `src/screens/ResultScreen.js:20-54`

```js
if (r?.riskLevel === 'INVALID') { return ( ... ); }   // :20  early return
useEffect(() => { saveScanToHistory(); }, []);        // :52  hook AFTER a conditional return
```

This breaks the Rules of Hooks unconditionally — the hook count differs between the two branches. If this component ever re-renders having switched branches, React throws "Rendered more hooks than during the previous render" and the screen white-screens.

**I could not confirm a navigation path that triggers it.** Both routes out of the INVALID branch (`:38` "Try Again" → `Detection`, `:44` "Back to Home" → `Home`) navigate to screens *below* `Result` in the stack, which pops `Result` and unmounts it — so the next result gets a fresh mount and a consistent branch. It may be latent rather than live. I would still fix it: it is one line, and the guarantee depends on React Navigation's pop semantics rather than on anything in this file.

What *is* certain in the same block: when the model returns `INVALID`, `saveScanToHistory` never runs, so the scan is absent from history even though the credit was spent (C3).

**Fix:** move the hook above the branch.

```js
export default function ResultScreen({ route, navigation }) {
  const { organId, selectedSymptoms, analysisResult: r, imageUris } = route.params;
  const organ = ORGANS[organId];
  const isInvalid = r?.riskLevel === 'INVALID';

  useEffect(() => { if (!isInvalid) saveScanToHistory(); }, [isInvalid]);

  if (isInvalid) return ( ... );
  ...
```

**Effort:** 15 minutes.

---

### U2 — `PaymentModal` has a `'phone'` step whose forward path I did not verify
**Location:** `src/components/PaymentModal.js:48-55` and `:84-89`

`handleSelectMethod` sets `step` to `'phone'` for non-card methods, and `goBack` handles `'phone'` → `'method'`. But the header's back-button condition (`:100`) hides the button for `packages`/`processing`/`success` only, and I did not read the `'phone'` step's body (it is past line 200 in a 489-line file) to confirm there is a forward path to `'confirm'`. If the phone step's continue button is missing or mis-wired, a MoMo user reaches a dead end.

I am flagging it as worth a manual walkthrough on device rather than asserting a bug.

**Effort:** 15 minutes to verify.

---

## The five things I would fix first

**1. Revoke the Anthropic key, then move the call server-side — S1 (+S2)**
Everything else on this list costs you time. This one is currently costing you money, silently, to anyone who has a copy of this folder. The key is in plaintext on disk in a directory that has been shared, and `git log` shows the repo has no commits yet — meaning the first push publishes it. Revoke today; the proxy can follow this week. Doing the proxy also fixes S2, C3 and M1 as a side effect, because the server becomes the place where "does this user have a credit" and "call the model" happen together.

**2. Fix `PaymentScreen`'s crash and the two latent copies — C1, C2**
A signed-in user tapping "Buy Credits" in Profile hits a `TypeError` on mount. This is the only hard crash on a routed, reachable screen, it is on the revenue path, and the fix is either a 30-minute reroute to the working `PaymentModal` or an import correction. Cheapest severe bug in the review.

**3. Refund the credit when the analysis fails, and put a timeout on the call — C3, C4**
Today a network blip on a Ugandan mobile connection costs the user UGX 500 and shows them a spinner that never stops. `refundScan()` is already written in `walletService.js:97` — pointed at a wallet nothing reads. Two hours of work removes your most likely source of refund requests and bad reviews, and it is independent of the backend work in item 1.

**4. Add ESLint and delete the dead tree — T1, A1**
`eslint-config-expo` plus `react-hooks/exhaustive-deps` would have caught findings C1, C2 and M3 before they were written, and it keeps catching them. Pair it with deleting `screens/`, `constants/`, `utils/`, `paymentService.backup.js` and the 873 KB notebook: ~1,600 lines of code that looks live, edits cleanly, and does nothing. Together they are about a day and they make every subsequent fix on this list faster and safer.

**5. Correct the privacy claim — S4**
The app tells users in three places that their health data never leaves the device, then uploads their symptoms and a photograph of their body to a third-party API. Unlike everything else here, this one is not a bug the user can work around — they cannot know it is happening. Fixing the copy is an hour. It is fifth only because the four above are actively breaking; if a regulator or an app-store reviewer looks first, it moves to first.

Two that nearly made the list: **AX1** (zero accessibility props app-wide, in a product whose users disproportionately need them) and **TS1** (the model's JSON is rendered unvalidated onto a screen the user paid for). Both are worth scheduling right behind the five.
