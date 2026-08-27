// ─────────────────────────────────────────────────────────────────────────────
// Every AsyncStorage key the app uses, in one place.
//
// Previously these string literals were duplicated across six files, which is
// how `triacare_wallet` (global) and `triacare_wallet_<uid>` (per user) ended up
// coexisting as two different wallets. Import from here — never inline a key.
// ─────────────────────────────────────────────────────────────────────────────

export const STORAGE_KEYS = {
  USER: 'triacare_user',
  TOKEN: 'triacare_token',
  REFRESH: 'triacare_refresh',
  ONBOARDED: 'triacare_onboarded',
  SCAN_HISTORY: 'triacare_scan_history',
  /** Legacy unscoped key, migrated into SCAN_HISTORY on first read. */
  LEGACY_SCAN_HISTORY: 'scan_history',
  wallet: (userId) => `triacare_wallet_${userId}`,
  transactions: (userId) => `triacare_txs_${userId}`,
};
