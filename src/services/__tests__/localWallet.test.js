/* eslint-env jest */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as localWallet from '../localWallet';

const USER = 'user-1';

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('debit', () => {
  it('refuses to debit an empty wallet', async () => {
    await expect(localWallet.debit({ userId: USER, organName: 'Heart' })).rejects.toMatchObject({
      code: 'PAYMENT_REQUIRED',
    });

    const wallet = await localWallet.getWallet(USER);
    expect(wallet.balanceScans).toBe(0);
    expect(wallet.totalScansUsed).toBe(0);
  });

  it('decrements the balance and records the spend', async () => {
    await localWallet.topUp({ userId: USER, packageId: 'pkg_5', methodId: 'mtn_momo' });

    const wallet = await localWallet.debit({ userId: USER, organName: 'Kidney' });

    expect(wallet.balanceScans).toBe(4);
    expect(wallet.totalScansUsed).toBe(1);

    const [latest] = await localWallet.getTransactions(USER);
    expect(latest).toMatchObject({ type: 'SCAN_DEBIT', scans: -1 });
  });

  // This is the regression test for the bug that let a double tap run two
  // screenings for one credit: both callers read the same balance and both
  // wrote balance-1.
  it('serialises concurrent debits instead of losing one', async () => {
    await localWallet.topUp({ userId: USER, packageId: 'pkg_5', methodId: 'card' });

    await Promise.all([
      localWallet.debit({ userId: USER, organName: 'Heart' }),
      localWallet.debit({ userId: USER, organName: 'Liver' }),
      localWallet.debit({ userId: USER, organName: 'Kidney' }),
    ]);

    const wallet = await localWallet.getWallet(USER);
    expect(wallet.balanceScans).toBe(2);
    expect(wallet.totalScansUsed).toBe(3);
  });

  it('does not oversell when more debits race than there are credits', async () => {
    await localWallet.topUp({ userId: USER, packageId: 'pkg_1', methodId: 'card' });

    const results = await Promise.allSettled([
      localWallet.debit({ userId: USER, organName: 'Heart' }),
      localWallet.debit({ userId: USER, organName: 'Liver' }),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    expect((await localWallet.getWallet(USER)).balanceScans).toBe(0);
  });
});

describe('refund', () => {
  it('restores the credit and logs a refund', async () => {
    await localWallet.topUp({ userId: USER, packageId: 'pkg_1', methodId: 'card' });
    await localWallet.debit({ userId: USER, organName: 'Heart' });

    const wallet = await localWallet.refund({ userId: USER, reason: 'Analysis failed' });

    expect(wallet.balanceScans).toBe(1);
    expect(wallet.totalScansUsed).toBe(0);

    const [latest] = await localWallet.getTransactions(USER);
    expect(latest).toMatchObject({ type: 'REFUND', scans: 1 });
    expect(latest.description).toContain('Analysis failed');
  });

  it('leaves the user whole across a debit/refund cycle', async () => {
    await localWallet.topUp({ userId: USER, packageId: 'pkg_10', methodId: 'card' });
    const before = await localWallet.getWallet(USER);

    await localWallet.debit({ userId: USER, organName: 'Heart' });
    await localWallet.refund({ userId: USER, reason: 'Timeout' });

    expect(await localWallet.getWallet(USER)).toEqual(before);
  });
});

describe('topUp', () => {
  it('credits the package the server priced, not a client-supplied amount', async () => {
    const wallet = await localWallet.topUp({
      userId: USER,
      packageId: 'pkg_20',
      methodId: 'airtel_money',
      phone: '771234567',
    });

    expect(wallet.balanceScans).toBe(20);
    expect(wallet.totalSpentUgx).toBe(6000);
  });

  it('rejects an unknown package', async () => {
    await expect(
      localWallet.topUp({ userId: USER, packageId: 'pkg_free', methodId: 'card' })
    ).rejects.toThrow('Unknown package');
  });

  it('keeps wallets separate per user', async () => {
    await localWallet.topUp({ userId: 'a', packageId: 'pkg_5', methodId: 'card' });

    expect((await localWallet.getWallet('a')).balanceScans).toBe(5);
    expect((await localWallet.getWallet('b')).balanceScans).toBe(0);
  });
});
