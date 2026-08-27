/* eslint-env jest */
// The rule under test: a user is never charged for a screening they did not
// receive. Every failure path must give the credit back.

jest.mock('../claudeService', () => ({ analyzeSymptoms: jest.fn() }));
jest.mock('../historyService', () => ({ addHistoryEntry: jest.fn() }));
jest.mock('../paymentService', () => ({
  devDebitForScan: jest.fn(),
  devRefundScan: jest.fn(),
}));

import { runScreening } from '../screeningService';
import { analyzeSymptoms } from '../claudeService';
import { addHistoryEntry } from '../historyService';
import { devDebitForScan, devRefundScan } from '../paymentService';

const ORGAN = { id: 'heart', name: 'Heart' };
const USER = 'user-1';

const AFTER_DEBIT = { balanceScans: 4, totalScansUsed: 1, totalSpentUgx: 0, totalSpentUsd: 0 };
const AFTER_REFUND = { balanceScans: 5, totalScansUsed: 0, totalSpentUgx: 0, totalSpentUsd: 0 };

const ANALYSIS = {
  riskLevel: 'MODERATE',
  riskScore: 40,
  riskSummary: 'Some signs present.',
  findings: [],
  recommendations: [],
  nextSteps: 'See a clinician.',
  disclaimer: 'Screening tool only.',
  positiveNote: '',
};

const run = () =>
  runScreening({ userId: USER, organ: ORGAN, selectedSymptoms: ['h1'], images: [] });

beforeEach(() => {
  jest.clearAllMocks();
  devDebitForScan.mockResolvedValue(AFTER_DEBIT);
  devRefundScan.mockResolvedValue(AFTER_REFUND);
});

describe('successful screening', () => {
  it('returns the analysis and files it in history', async () => {
    analyzeSymptoms.mockResolvedValue({ ok: true, data: ANALYSIS });

    const result = await run();

    expect(result.ok).toBe(true);
    expect(result.analysis).toEqual(ANALYSIS);
    expect(devRefundScan).not.toHaveBeenCalled();
    expect(addHistoryEntry).toHaveBeenCalledWith(
      expect.objectContaining({ organId: 'heart', symptomCount: 1 })
    );
  });
});

describe('failed screening', () => {
  // The regression that motivated all of this: a dropped connection used to
  // cost the user UGX 500 and give them nothing.
  it.each([
    ['a network error', 'NETWORK'],
    ['a timeout', 'TIMEOUT'],
    ['a server error', 'SERVER'],
    ['an unparseable analysis', 'BAD_ANALYSIS'],
    ['rate limiting', 'RATE_LIMITED'],
  ])('refunds the credit after %s', async (_label, code) => {
    analyzeSymptoms.mockResolvedValue({ ok: false, code, message: 'nope', retryable: true });

    const result = await run();

    expect(result.ok).toBe(false);
    expect(devRefundScan).toHaveBeenCalledTimes(1);
    expect(result.wallet).toEqual(AFTER_REFUND);
  });

  it('does not write a history entry for a failed screening', async () => {
    analyzeSymptoms.mockResolvedValue({ ok: false, code: 'NETWORK', message: 'x', retryable: true });

    await run();

    expect(addHistoryEntry).not.toHaveBeenCalled();
  });

  it('reports NO_CREDIT when the wallet is empty, without a spurious refund', async () => {
    devDebitForScan.mockRejectedValue(Object.assign(new Error('empty'), { code: 'PAYMENT_REQUIRED' }));

    const result = await run();

    expect(result).toEqual({ ok: false, code: 'NO_CREDIT' });
    expect(analyzeSymptoms).not.toHaveBeenCalled();
    expect(devRefundScan).not.toHaveBeenCalled();
  });

  it('maps a server 402 to NO_CREDIT and still returns the credit', async () => {
    analyzeSymptoms.mockResolvedValue({
      ok: false,
      code: 'PAYMENT_REQUIRED',
      message: 'no credits',
      retryable: false,
    });

    const result = await run();

    expect(result).toEqual({ ok: false, code: 'NO_CREDIT' });
    expect(devRefundScan).toHaveBeenCalledTimes(1);
  });
});

describe('unreadable photo', () => {
  // An INVALID result is not a screening the user received, so it must not be
  // charged for and must not appear in history as a completed screening.
  it('refunds and does not record history', async () => {
    analyzeSymptoms.mockResolvedValue({
      ok: true,
      data: { riskLevel: 'INVALID', riskSummary: 'Not a human body part.' },
    });

    const result = await run();

    expect(result.ok).toBe(true);
    expect(result.analysis.riskLevel).toBe('INVALID');
    expect(devRefundScan).toHaveBeenCalledTimes(1);
    expect(addHistoryEntry).not.toHaveBeenCalled();
  });
});

describe('request plumbing', () => {
  it('forwards the abort signal so leaving the screen cancels the call', async () => {
    analyzeSymptoms.mockResolvedValue({ ok: true, data: ANALYSIS });
    const controller = new AbortController();

    await runScreening({
      userId: USER,
      organ: ORGAN,
      selectedSymptoms: ['h1'],
      images: [{ symptomId: 'h1', base64: 'abc' }],
      signal: controller.signal,
    });

    expect(analyzeSymptoms).toHaveBeenCalledWith(
      expect.objectContaining({
        organId: 'heart',
        images: [{ symptomId: 'h1', base64: 'abc' }],
        signal: controller.signal,
      })
    );
  });
});
