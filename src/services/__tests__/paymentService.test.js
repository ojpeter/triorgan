/* eslint-env jest */
jest.mock('../apiClient', () => {
  class ApiError extends Error {
    constructor({ code, status = 0, userMessage }) {
      super(userMessage);
      this.code = code;
      this.status = status;
      this.userMessage = userMessage;
    }
  }
  return { ApiError, api: { get: jest.fn(), post: jest.fn() } };
});

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  fetchWallet, fetchTransactions, startTopUp, getPaymentStatus,
  devDebitForScan, devRefundScan,
} from '../paymentService';
import { api, ApiError } from '../apiClient';
import * as localWallet from '../localWallet';

const USER = 'user-1';
const SERVER_WALLET = {
  balanceScans: 9,
  totalScansUsed: 3,
  totalSpentUgx: 3500,
  totalSpentUsd: 3.5,
};

const httpError = (status) =>
  new ApiError({ code: 'X', status, userMessage: 'nope' });

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe('fetchWallet', () => {
  it('prefers the server balance', async () => {
    api.get.mockResolvedValue({ wallet: SERVER_WALLET });

    expect(await fetchWallet(USER)).toEqual(SERVER_WALLET);
    expect(api.get).toHaveBeenCalledWith('/wallet', expect.any(Object));
  });

  it('accepts a bare wallet body as well as a wrapped one', async () => {
    api.get.mockResolvedValue(SERVER_WALLET);
    expect(await fetchWallet(USER)).toEqual(SERVER_WALLET);
  });

  // Development convenience only, so UI work is not blocked before the wallet
  // endpoints ship. See BACKEND.md.
  it.each([404, 501])('falls back to the local stub on HTTP %i in development', async (status) => {
    api.get.mockRejectedValue(httpError(status));
    await localWallet.topUp({ userId: USER, packageId: 'pkg_5', methodId: 'card' });

    expect((await fetchWallet(USER)).balanceScans).toBe(5);
  });

  // A real failure must surface, not silently hand back a forgeable balance.
  it.each([500, 401, 403])('propagates HTTP %i rather than falling back', async (status) => {
    api.get.mockRejectedValue(httpError(status));

    await expect(fetchWallet(USER)).rejects.toBeInstanceOf(ApiError);
  });
});

describe('fetchTransactions', () => {
  it('validates and returns the server list', async () => {
    api.get.mockResolvedValue({
      transactions: [
        {
          id: 't1', type: 'TOPUP', status: 'SUCCESS',
          createdAt: '2026-08-27T10:00:00Z', reference: 'REF-1',
          scans: 5, amountUgx: 2000, amountUsd: 2, description: 'Top-up',
        },
        { id: 't2', type: 'NONSENSE' },
      ],
    });

    const transactions = await fetchTransactions(USER);

    expect(transactions).toHaveLength(1);
    expect(transactions[0].type).toBe('TOPUP');
  });

  it('falls back to local transactions when the endpoint is missing', async () => {
    api.get.mockRejectedValue(httpError(404));
    await localWallet.topUp({ userId: USER, packageId: 'pkg_1', methodId: 'card' });

    expect(await fetchTransactions(USER)).toHaveLength(1);
  });
});

describe('startTopUp', () => {
  // The client must never be able to name its own price.
  it('sends only the package id and method, never an amount', async () => {
    api.post.mockResolvedValue({ status: 'PENDING', payment_id: 'pay-1' });

    await startTopUp({
      userId: USER, packageId: 'pkg_10', methodId: 'mtn_momo', phone: '771234567',
    });

    const body = api.post.mock.calls[0][1];
    expect(body).toEqual({ package_id: 'pkg_10', method: 'mtn_momo', phone: '771234567' });
    expect(JSON.stringify(body)).not.toMatch(/amount|ugx|usd|price/i);
  });

  // Mobile money pushes a USSD prompt to the handset, so there is no link.
  it('returns a pending payment id and no redirect for mobile money', async () => {
    api.post.mockResolvedValue({ status: 'PENDING', payment_id: 'pay-1' });

    expect(await startTopUp({ userId: USER, packageId: 'pkg_5', methodId: 'mtn_momo' }))
      .toEqual({ status: 'PENDING', paymentId: 'pay-1', redirectUrl: null });
  });

  // Cards return a hosted checkout page the app has to open before polling.
  it('passes through the card checkout link', async () => {
    api.post.mockResolvedValue({
      status: 'PENDING', payment_id: 'pay-2', redirect_url: 'https://checkout.example/abc',
    });

    expect(await startTopUp({ userId: USER, packageId: 'pkg_5', methodId: 'card' }))
      .toEqual({
        status: 'PENDING', paymentId: 'pay-2', redirectUrl: 'https://checkout.example/abc',
      });
  });

  it('returns the wallet when the gateway settles immediately', async () => {
    api.post.mockResolvedValue({ status: 'COMPLETED', wallet: SERVER_WALLET });

    expect(await startTopUp({ userId: USER, packageId: 'pkg_5', methodId: 'card' }))
      .toEqual({ status: 'COMPLETED', wallet: SERVER_WALLET });
  });

  it('settles against the local stub when the endpoint is missing', async () => {
    api.post.mockRejectedValue(httpError(404));

    const result = await startTopUp({ userId: USER, packageId: 'pkg_5', methodId: 'card' });

    expect(result.status).toBe('COMPLETED');
    expect(result.simulated).toBe(true);
    expect(result.wallet.balanceScans).toBe(5);
  });

  it('propagates a genuine gateway failure', async () => {
    api.post.mockRejectedValue(httpError(502));
    await expect(startTopUp({ userId: USER, packageId: 'pkg_5', methodId: 'card' }))
      .rejects.toBeInstanceOf(ApiError);
  });
});

describe('getPaymentStatus', () => {
  it('returns the wallet once completed', async () => {
    api.get.mockResolvedValue({ status: 'COMPLETED', wallet: SERVER_WALLET });

    expect(await getPaymentStatus('pay-1')).toEqual({
      status: 'COMPLETED', wallet: SERVER_WALLET, message: undefined,
    });
  });

  it('surfaces the reason a payment failed', async () => {
    api.get.mockResolvedValue({ status: 'FAILED', message: 'Insufficient funds.' });

    expect(await getPaymentStatus('pay-1')).toMatchObject({
      status: 'FAILED', message: 'Insufficient funds.',
    });
  });

  it('defaults to pending when the server says nothing useful', async () => {
    api.get.mockResolvedValue({});
    expect((await getPaymentStatus('pay-1')).status).toBe('PENDING');
  });

  it('url-encodes the payment id', async () => {
    api.get.mockResolvedValue({ status: 'PENDING' });
    await getPaymentStatus('pay/1');
    expect(api.get.mock.calls[0][0]).toBe('/payments/pay%2F1');
  });
});

describe('dev-only credit movement', () => {
  it('mirrors a debit and a refund locally', async () => {
    await localWallet.topUp({ userId: USER, packageId: 'pkg_1', methodId: 'card' });

    expect((await devDebitForScan({ userId: USER, organName: 'Heart' })).balanceScans).toBe(0);
    expect((await devRefundScan({ userId: USER, reason: 'test' })).balanceScans).toBe(1);
  });
});

describe('production safety', () => {
  // The on-device wallet is forgeable. If it could run in production, the paid
  // gate would be worthless — so this must stay off outside development.
  it('never touches the local stub when the fallback is disabled', async () => {
    jest.resetModules();
    jest.doMock('../../config/env', () => ({
      API_BASE: 'https://api.test.local/api/v1',
      APP_ENV: 'production',
      ALLOW_LOCAL_WALLET_FALLBACK: false,
    }));

    const prodPayments = require('../paymentService');
    const { api: prodApi } = require('../apiClient');
    prodApi.get.mockRejectedValue(httpError(404));

    await expect(prodPayments.fetchWallet(USER)).rejects.toBeInstanceOf(ApiError);
    await expect(prodPayments.devDebitForScan({ userId: USER, organName: 'Heart' }))
      .resolves.toBeNull();
    await expect(prodPayments.devRefundScan({ userId: USER, reason: 'x' }))
      .resolves.toBeNull();

    jest.dontMock('../../config/env');
    jest.resetModules();
  });
});
