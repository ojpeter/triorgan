// ─────────────────────────────────────────────────────────────────────────────
// Every AsyncStorage key the app uses, in one place.
//
// Previously these string literals were duplicated across six files, which is
// how `corvia_wallet` (global) and `corvia_wallet_<uid>` (per user) ended up
// coexisting as two different wallets. Import from here — never inline a key.
// ─────────────────────────────────────────────────────────────────────────────

export const STORAGE_KEYS = {
  USER: 'corvia_user',
  TOKEN: 'corvia_token',
  REFRESH: 'corvia_refresh',
  ONBOARDED: 'corvia_onboarded',
  SCAN_HISTORY: 'corvia_scan_history',
  /** Legacy unscoped key, migrated into SCAN_HISTORY on first read. */
  LEGACY_SCAN_HISTORY: 'scan_history',
  wallet: (userId) => `corvia_wallet_${userId}`,
  transactions: (userId) => `corvia_txs_${userId}`,
};
