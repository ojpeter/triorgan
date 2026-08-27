/* eslint-env jest */
jest.mock('../apiClient', () => {
  class ApiError extends Error {
    constructor({ code, status = 0, userMessage }) {
      super(userMessage);
      this.code = code;
      this.status = status;
      this.userMessage = userMessage;
    }
    get isRetryable() {
      return ['NETWORK', 'TIMEOUT', 'RATE_LIMITED'].includes(this.code) || this.status >= 500;
    }
  }
  return { ApiError, api: { post: jest.fn() } };
});

import { analyzeSymptoms, getRiskStyle, getRiskColor } from '../claudeService';
import { api, ApiError } from '../apiClient';

const VALID = {
  riskLevel: 'HIGH',
  riskScore: 78,
  riskSummary: 'Several concerning signs.',
  findings: [{ symptom: 'Swelling', significance: 'Fluid retention.', urgency: 'urgent' }],
  recommendations: [{ category: 'Medical', title: 'See a doctor', detail: 'Within 48 hours.' }],
  nextSteps: 'Visit a clinic within two days.',
  positiveNote: 'Acting now matters.',
};

const call = () => analyzeSymptoms({ organId: 'heart', selectedSymptoms: ['h1'] });

beforeEach(() => jest.clearAllMocks());

describe('request shape', () => {
  it('sends symptom ids and tagged images, never free text', async () => {
    api.post.mockResolvedValue({ analysis: VALID });

    await analyzeSymptoms({
      organId: 'liver',
      selectedSymptoms: ['l1', 'l2'],
      images: [{ symptomId: 'l1', base64: 'AAAA' }],
    });

    const [path, body] = api.post.mock.calls[0];
    expect(path).toBe('/screenings/analyze');
    expect(body).toEqual({
      organ_id: 'liver',
      symptom_ids: ['l1', 'l2'],
      images: [{ symptom_id: 'l1', data: 'AAAA' }],
    });
  });

  // The old client collected a photo per symptom and then sent only the first.
  it('sends every attached photo, not just the first', async () => {
    api.post.mockResolvedValue({ analysis: VALID });

    await analyzeSymptoms({
      organId: 'heart',
      selectedSymptoms: ['h1', 'h2', 'h3'],
      images: [
        { symptomId: 'h1', base64: 'A' },
        { symptomId: 'h2', base64: 'B' },
        { symptomId: 'h3', base64: 'C' },
      ],
    });

    expect(api.post.mock.calls[0][1].images).toHaveLength(3);
  });

  it('uses a longer timeout than a normal request', async () => {
    api.post.mockResolvedValue({ analysis: VALID });
    await call();
    expect(api.post.mock.calls[0][2].timeoutMs).toBeGreaterThanOrEqual(60000);
  });
});

describe('response handling', () => {
  it('returns a validated analysis', async () => {
    api.post.mockResolvedValue({ analysis: VALID });

    const result = await call();

    expect(result.ok).toBe(true);
    expect(result.data.riskLevel).toBe('HIGH');
    expect(result.data.disclaimer).toContain('screening tool only');
  });

  it('accepts a bare analysis body as well as a wrapped one', async () => {
    api.post.mockResolvedValue(VALID);
    await expect(call()).resolves.toMatchObject({ ok: true });
  });

  it('passes the INVALID-photo outcome through', async () => {
    api.post.mockResolvedValue({
      analysis: { riskLevel: 'INVALID', riskSummary: 'Not a human body part.' },
    });

    const result = await call();

    expect(result.ok).toBe(true);
    expect(result.data.riskLevel).toBe('INVALID');
  });

  // Rendering an unvalidated model response is what used to crash the results
  // screen after the user had paid.
  it('fails cleanly when the model returns an unusable shape', async () => {
    // The service logs the validation issues in dev; that is the intended
    // behaviour, so swallow it rather than letting it clutter the run.
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    api.post.mockResolvedValue({ analysis: { riskLevel: 'PROBABLY FINE' } });

    const result = await call();

    expect(warn).toHaveBeenCalled();
    warn.mockRestore();

    expect(result.ok).toBe(false);
    expect(result.code).toBe('BAD_ANALYSIS');
    expect(result.retryable).toBe(true);
    expect(result.message).toContain('has not been used');
  });
});

describe('error handling', () => {
  it.each([
    ['NETWORK', true],
    ['TIMEOUT', true],
    ['PAYMENT_REQUIRED', false],
    ['FORBIDDEN', false],
  ])('surfaces %s with the right retryability', async (code, retryable) => {
    api.post.mockRejectedValue(new ApiError({ code, userMessage: 'msg' }));

    const result = await call();

    expect(result).toMatchObject({ ok: false, code, retryable });
  });

  it('does not leak an unexpected internal error to the user', async () => {
    api.post.mockRejectedValue(new TypeError("Cannot read property 'x' of undefined"));

    const result = await call();

    expect(result.ok).toBe(false);
    expect(result.message).toBe('Something went wrong. Please try again.');
    expect(result.message).not.toContain('undefined');
  });
});

describe('risk presentation', () => {
  it('gives every risk level an icon and a text label, not colour alone', () => {
    for (const level of ['LOW', 'MODERATE', 'HIGH', 'CRITICAL', 'INVALID']) {
      const style = getRiskStyle(level);
      expect(style.icon).toBeTruthy();
      expect(style.label).toBeTruthy();
      expect(style.color).toMatch(/^#/);
    }
  });

  it('falls back safely for an unknown level', () => {
    expect(getRiskStyle('WAT').label).toBe('Unknown');
    expect(getRiskColor(undefined)).toBeTruthy();
  });
});
