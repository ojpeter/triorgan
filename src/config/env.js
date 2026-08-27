// ─────────────────────────────────────────────────────────────────────────────
// Runtime environment. Single place the app reads configuration from.
// Values come from app.config.js -> expo.extra. Never contains secrets.
// ─────────────────────────────────────────────────────────────────────────────

import Constants from 'expo-constants';

const extra = Constants.expoConfig?.extra ?? {};

export const APP_ENV = extra.appEnv ?? 'development';

export const API_BASE = extra.apiBase;

/**
 * Whether the app may fall back to an on-device wallet when the backend has no
 * /wallet endpoints yet. This is a build-time scaffold for local development.
 *
 * Double-gated on purpose: the config flag AND __DEV__. A release build cannot
 * enable it even if app.config.js is edited, because __DEV__ is false there.
 * An on-device balance is forgeable, so it must never gate paid access in
 * production — see BACKEND.md.
 */
export const ALLOW_LOCAL_WALLET_FALLBACK =
  Boolean(extra.allowLocalWalletFallback) && __DEV__;

if (!API_BASE) {
  throw new Error(
    'API_BASE is not configured. app.config.js must set expo.extra.apiBase. ' +
      'If you just added app.config.js, restart Metro with `npx expo start -c`.'
  );
}
