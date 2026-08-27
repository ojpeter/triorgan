// ─────────────────────────────────────────────────────────────────────────────
// TriaCare — Wallet & payments.
//
// The server is the source of truth for the balance. The client holds a display
// copy only (see WalletContext). Credits are debited server-side inside the
// screening call itself, so there is no window where the app has taken payment
// but not delivered the scan — and no client-side read-modify-write to race.
//
// Pricing lives in src/constants/payments.js and is display-only; the server
// re-prices every transaction from its own table.
// ─────────────────────────────────────────────────────────────────────────────

import { api, ApiError } from './apiClient';
import { ALLOW_LOCAL_WALLET_FALLBACK } from '../config/env';
import { WalletSchema, TransactionSchema, parseList } from './schemas';
import * as localWallet from './localWallet';

export {
  SCAN_PRICE,
  PACKAGES,
  PAYMENT_METHODS,
  getPackageById,
  getMethodById,
  formatUGX,
  formatUSD,
  formatDateTime,
  normalisePhone,
  isValidUgandanMobile,
} from '../constants/payments';

const EMPTY_WALLET = {
  balanceScans: 0,
  totalScansUsed: 0,
  totalSpentUgx: 0,
  totalSpentUsd: 0,
};

/**
 * True when the backend has not implemented an endpoint yet. Only meaningful
 * in development — see ALLOW_LOCAL_WALLET_FALLBACK.
 */
const isMissingEndpoint = (error) =>
  error instanceof ApiError && (error.status === 404 || error.status === 501);

function shouldFallBack(error) {
  if (!ALLOW_LOCAL_WALLET_FALLBACK) return false;
  if (isMissingEndpoint(error)) {
    if (__DEV__) {
      console.warn(
        '[wallet] Backend endpoint missing — using the DEV-ONLY local wallet. ' +
          'This will not work in a release build. See BACKEND.md.'
      );
    }
    return true;
  }
  return false;
}

// ── Reads ────────────────────────────────────────────────────────────────────

export async function fetchWallet(userId, { signal } = {}) {
  try {
    const raw = await api.get('/wallet', { signal });
    return WalletSchema.parse(raw?.wallet ?? raw);
  } catch (error) {
    if (shouldFallBack(error)) return localWallet.getWallet(userId);
    throw error;
  }
}

export async function fetchTransactions(userId, { signal } = {}) {
  try {
    const raw = await api.get('/wallet/transactions', { signal });
    return parseList(TransactionSchema, raw?.transactions ?? raw);
  } catch (error) {
    if (shouldFallBack(error)) {
      return parseList(TransactionSchema, await localWallet.getTransactions(userId));
    }
    throw error;
  }
}

// ── Top-up ───────────────────────────────────────────────────────────────────

/**
 * Start a top-up.
 *
 * The client sends only the package id and method — never an amount. The server
 * prices it, calls the gateway, and credits the wallet from the gateway webhook.
 *
 * @returns {Promise<{status: 'COMPLETED', wallet: object}
 *                 | {status: 'PENDING', paymentId: string}>}
 */
export async function startTopUp({ userId, packageId, methodId, phone = null }) {
  try {
    const raw = await api.post('/payments/topup', {
      package_id: packageId,
      method: methodId,
      phone,
    });

    if (raw?.status === 'COMPLETED') {
      return { status: 'COMPLETED', wallet: WalletSchema.parse(raw.wallet) };
    }
    return {
      status: 'PENDING',
      paymentId: raw?.payment_id ?? null,
      // Card payments come back with a hosted checkout link the user has to
      // open. Mobile money instead pushes a USSD prompt to their handset, so
      // there is nothing to open and this is null.
      redirectUrl: raw?.redirect_url ?? null,
    };
  } catch (error) {
    if (shouldFallBack(error)) {
      // Dev stub: settle immediately so the UI can be exercised end-to-end.
      const wallet = await localWallet.topUp({ userId, packageId, methodId, phone });
      return { status: 'COMPLETED', wallet, simulated: true };
    }
    throw error;
  }
}

/**
 * Poll a pending mobile-money payment. Mobile money is asynchronous: the user
 * approves a USSD prompt on their handset, and the gateway calls our webhook
 * some seconds later. The UI must wait for the server, never assume success.
 *
 * @returns {Promise<{status: 'PENDING'|'COMPLETED'|'FAILED', wallet?: object, message?: string}>}
 */
export async function getPaymentStatus(paymentId, { signal } = {}) {
  const raw = await api.get(`/payments/${encodeURIComponent(paymentId)}`, { signal });
  const status = raw?.status ?? 'PENDING';
  return {
    status,
    wallet: raw?.wallet ? WalletSchema.parse(raw.wallet) : undefined,
    message: typeof raw?.message === 'string' ? raw.message : undefined,
  };
}

// ── Dev-only credit movement ─────────────────────────────────────────────────
// In production the server debits inside /screenings/analyze and refunds itself
// on failure. These exist so the dev stub can mirror that behaviour locally.

export async function devDebitForScan({ userId, organName }) {
  if (!ALLOW_LOCAL_WALLET_FALLBACK) return null;
  return localWallet.debit({ userId, organName });
}

export async function devRefundScan({ userId, reason }) {
  if (!ALLOW_LOCAL_WALLET_FALLBACK) return null;
  return localWallet.refund({ userId, reason });
}

export { EMPTY_WALLET };
