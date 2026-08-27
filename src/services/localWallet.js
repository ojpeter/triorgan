// ─────────────────────────────────────────────────────────────────────────────
// DEVELOPMENT-ONLY wallet stub.
//
// Lets the team build UI before the backend wallet endpoints ship. It is gated
// behind ALLOW_LOCAL_WALLET_FALLBACK, which is itself gated on __DEV__, so it
// cannot run in a release build.
//
// This is NOT a security boundary. An on-device balance is trivially editable,
// which is exactly why the real balance must live on the server. Never make
// this the production path. See BACKEND.md.
// ─────────────────────────────────────────────────────────────────────────────

import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from './storageKeys';
import { getPackageById, SCAN_PRICE } from '../constants/payments';

const EMPTY_WALLET = {
  balanceScans: 0,
  totalScansUsed: 0,
  totalSpentUgx: 0,
  totalSpentUsd: 0,
};

// Serialises read-modify-write cycles. Two concurrent debits previously both
// read the same balance and both wrote balance-1, so one scan ran for free (or
// two credits vanished, depending on interleaving).
let queue = Promise.resolve();

function withLock(fn) {
  const run = queue.then(fn, fn);
  // Keep the chain alive even if `fn` rejects.
  queue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

async function readWallet(userId) {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.wallet(userId));
    return raw ? { ...EMPTY_WALLET, ...JSON.parse(raw) } : { ...EMPTY_WALLET };
  } catch {
    return { ...EMPTY_WALLET };
  }
}

async function writeWallet(userId, wallet) {
  await AsyncStorage.setItem(STORAGE_KEYS.wallet(userId), JSON.stringify(wallet));
  return wallet;
}

export async function getWallet(userId) {
  return readWallet(userId);
}

export async function getTransactions(userId) {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.transactions(userId));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function addTransaction(userId, tx) {
  const existing = await getTransactions(userId);
  const record = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    status: 'SUCCESS',
    ...tx,
  };
  const next = [record, ...existing].slice(0, 200);
  await AsyncStorage.setItem(STORAGE_KEYS.transactions(userId), JSON.stringify(next));
  return record;
}

export function topUp({ userId, packageId, methodId, phone }) {
  return withLock(async () => {
    const pkg = getPackageById(packageId);
    if (!pkg) throw new Error('Unknown package');

    const wallet = await readWallet(userId);
    const next = {
      ...wallet,
      balanceScans: wallet.balanceScans + pkg.scans,
      totalSpentUgx: wallet.totalSpentUgx + pkg.ugx,
      totalSpentUsd: wallet.totalSpentUsd + pkg.usd,
    };
    await writeWallet(userId, next);
    await addTransaction(userId, {
      type: 'TOPUP',
      scans: pkg.scans,
      amountUgx: pkg.ugx,
      amountUsd: pkg.usd,
      description: `Top-up — ${pkg.label}`,
      paymentMethod: methodId,
      phone: phone ?? null,
      reference: `DEV-${Date.now()}`,
    });
    return next;
  });
}

export function debit({ userId, organName }) {
  return withLock(async () => {
    const wallet = await readWallet(userId);
    if (wallet.balanceScans <= 0) {
      const err = new Error('No scan credits remaining');
      err.code = 'PAYMENT_REQUIRED';
      throw err;
    }
    const next = {
      ...wallet,
      balanceScans: wallet.balanceScans - 1,
      totalScansUsed: wallet.totalScansUsed + 1,
    };
    await writeWallet(userId, next);
    await addTransaction(userId, {
      type: 'SCAN_DEBIT',
      scans: -1,
      amountUgx: SCAN_PRICE.UGX,
      amountUsd: SCAN_PRICE.USD,
      description: `${organName} screening`,
      reference: `DEV-SCAN-${Date.now()}`,
    });
    return next;
  });
}

export function refund({ userId, reason }) {
  return withLock(async () => {
    const wallet = await readWallet(userId);
    const next = {
      ...wallet,
      balanceScans: wallet.balanceScans + 1,
      totalScansUsed: Math.max(0, wallet.totalScansUsed - 1),
    };
    await writeWallet(userId, next);
    await addTransaction(userId, {
      type: 'REFUND',
      scans: 1,
      amountUgx: SCAN_PRICE.UGX,
      amountUsd: SCAN_PRICE.USD,
      description: `Refund — ${reason}`,
      reference: `DEV-REF-${Date.now()}`,
    });
    return next;
  });
}
