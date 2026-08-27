/* eslint-env jest */
import {
  AnalysisSchema,
  AnalysisResultSchema,
  HistoryEntrySchema,
  WalletSchema,
  parseList,
} from '../schemas';

const VALID_ANALYSIS = {
  riskLevel: 'MODERATE',
  riskScore: 45,
  riskSummary: 'Some early warning signs are present.',
  findings: [
    { symptom: 'Swollen ankles', significance: 'May indicate fluid retention.', urgency: 'soon' },
  ],
  recommendations: [
    { category: 'Diet', title: 'Reduce salt', detail: 'Cut added salt for two weeks.' },
  ],
  nextSteps: 'See a clinician within two weeks.',
  disclaimer: 'anything',
  positiveNote: 'Good on you for checking.',
};

describe('AnalysisSchema', () => {
  it('accepts a well-formed analysis', () => {
    expect(AnalysisSchema.safeParse(VALID_ANALYSIS).success).toBe(true);
  });

  // The model returns free-form JSON. These are the shapes that used to crash
  // ResultScreen after the user had already paid for the screening.
  it.each([
    ['missing riskLevel', { ...VALID_ANALYSIS, riskLevel: undefined }],
    ['invalid riskLevel', { ...VALID_ANALYSIS, riskLevel: 'VERY BAD' }],
    ['missing riskSummary', { ...VALID_ANALYSIS, riskSummary: undefined }],
    ['missing nextSteps', { ...VALID_ANALYSIS, nextSteps: undefined }],
    ['out-of-range score', { ...VALID_ANALYSIS, riskScore: 500 }],
    ['not an object', 'sorry, I cannot help with that'],
  ])('rejects %s', (_label, payload) => {
    expect(AnalysisSchema.safeParse(payload).success).toBe(false);
  });

  it('coerces a stringified score rather than rendering a string as a number', () => {
    const result = AnalysisSchema.parse({ ...VALID_ANALYSIS, riskScore: '72' });
    expect(result.riskScore).toBe(72);
  });

  it('defaults absent findings and recommendations to empty arrays', () => {
    const result = AnalysisSchema.parse({
      ...VALID_ANALYSIS,
      findings: undefined,
      recommendations: undefined,
    });
    expect(result.findings).toEqual([]);
    expect(result.recommendations).toEqual([]);
  });

  // Safety-critical: the disclaimer is ours, not the model's phrasing of it.
  it('always replaces the disclaimer with our own wording', () => {
    const result = AnalysisSchema.parse({
      ...VALID_ANALYSIS,
      disclaimer: 'This is a definitive diagnosis.',
    });
    expect(result.disclaimer).toContain('screening tool only');
    expect(result.disclaimer).not.toContain('definitive diagnosis');
  });

  it('falls back to a safe urgency rather than rejecting the whole analysis', () => {
    const result = AnalysisSchema.parse({
      ...VALID_ANALYSIS,
      findings: [{ symptom: 'x', significance: 'y', urgency: 'IMMEDIATELY' }],
    });
    expect(result.findings[0].urgency).toBe('routine');
  });
});

describe('AnalysisResultSchema', () => {
  it('accepts the INVALID-image shape, which carries no score or findings', () => {
    const parsed = AnalysisResultSchema.safeParse({
      riskLevel: 'INVALID',
      riskSummary: 'That photo does not show a human body part.',
    });
    expect(parsed.success).toBe(true);
    expect(parsed.data.riskLevel).toBe('INVALID');
  });

  it('still accepts a complete analysis', () => {
    expect(AnalysisResultSchema.safeParse(VALID_ANALYSIS).success).toBe(true);
  });
});

describe('WalletSchema', () => {
  it('reads the field names the service actually writes', () => {
    const wallet = WalletSchema.parse({
      balanceScans: 4,
      totalScansUsed: 6,
      totalSpentUgx: 2000,
      totalSpentUsd: 2,
    });
    expect(wallet).toEqual({
      balanceScans: 4,
      totalScansUsed: 6,
      totalSpentUgx: 2000,
      totalSpentUsd: 2,
    });
  });

  it('falls back to zero for a malformed field instead of throwing', () => {
    const wallet = WalletSchema.parse({ balanceScans: 'three' });
    expect(wallet.balanceScans).toBe(0);
  });
});

describe('parseList', () => {
  it('drops malformed records but keeps the good ones', () => {
    const entries = [
      {
        id: '1',
        organId: 'heart',
        organName: 'Heart',
        date: '2026-08-27T10:00:00Z',
        riskLevel: 'LOW',
        riskScore: 10,
        symptomCount: 2,
        summary: 'Fine',
      },
      { id: '2', organId: 'spleen' }, // not a supported organ
      null,
    ];

    const result = parseList(HistoryEntrySchema, entries);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('1');
  });

  it('returns an empty array for non-array input', () => {
    expect(parseList(HistoryEntrySchema, 'corrupted')).toEqual([]);
  });
});
