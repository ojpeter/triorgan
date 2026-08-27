// ─────────────────────────────────────────────────────────────────────────────
// Every AsyncStorage key the app uses, in one place.
//
// Previously these string literals were duplicated across six files, which is
// how `triorgan_wallet` (global) and `triorgan_wallet_<uid>` (per user) ended up
// coexisting as two different wallets. Import from here — never inline a key.
// ─────────────────────────────────────────────────────────────────────────────

export const STORAGE_KEYS = {
  USER: 'triorgan_user',
  TOKEN: 'triorgan_token',
  REFRESH: 'triorgan_refresh',
  ONBOARDED: 'triorgan_onboarded',
  SCAN_HISTORY: 'triorgan_scan_history',
  /** Legacy unscoped key, migrated into SCAN_HISTORY on first read. */
  LEGACY_SCAN_HISTORY: 'scan_history',
  wallet: (userId) => `triorgan_wallet_${userId}`,
  transactions: (userId) => `triorgan_txs_${userId}`,
};
