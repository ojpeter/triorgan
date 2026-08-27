// ─────────────────────────────────────────────────────────────────────────────
// Runtime validation for every untrusted boundary.
//
// The AI analysis is the weakest contract in the app: it is a language model's
// best effort at following a prompt, not an API with a guaranteed shape. It was
// previously JSON.parse'd and rendered straight onto a screen the user had
// already paid for, so a missing field became a crash. Validate here, once.
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';

export const RISK_LEVELS = ['LOW', 'MODERATE', 'HIGH', 'CRITICAL'];
export const URGENCY_LEVELS = ['routine', 'soon', 'urgent', 'emergency'];
export const RECOMMENDATION_CATEGORIES = ['Lifestyle', 'Diet', 'Medical', 'Monitoring'];

const FindingSchema = z.object({
  symptom: z.string().min(1),
  significance: z.string().min(1),
  urgency: z.enum(URGENCY_LEVELS).catch('routine'),
});

const RecommendationSchema = z.object({
  category: z.enum(RECOMMENDATION_CATEGORIES).catch('Monitoring'),
  title: z.string().min(1),
  detail: z.string().min(1),
});

const DISCLAIMER =
  'This is a screening tool only and does not replace professional medical diagnosis. Please consult a qualified healthcare provider for proper evaluation and treatment.';

/** A completed screening. */
export const AnalysisSchema = z.object({
  riskLevel: z.enum(RISK_LEVELS),
  riskScore: z.coerce.number().min(0).max(100),
  riskSummary: z.string().min(1),
  findings: z.array(FindingSchema).default([]),
  recommendations: z.array(RecommendationSchema).default([]),
  nextSteps: z.string().min(1),
  // The disclaimer is a safety-critical string; never let the model's phrasing
  // of it decide what the user sees. Always ours.
  disclaimer: z.string().default(DISCLAIMER).transform(() => DISCLAIMER),
  positiveNote: z.string().default(''),
});

/** The model rejected the photo as not showing a human body part. */
export const InvalidImageSchema = z.object({
  riskLevel: z.literal('INVALID'),
  riskSummary: z.string().min(1),
});

/** Either outcome. Discriminated by `riskLevel`. */
export const AnalysisResultSchema = z.union([InvalidImageSchema, AnalysisSchema]);

export const WalletSchema = z.object({
  balanceScans: z.coerce.number().int().min(0).catch(0),
  totalScansUsed: z.coerce.number().int().min(0).catch(0),
  totalSpentUgx: z.coerce.number().min(0).catch(0),
  totalSpentUsd: z.coerce.number().min(0).catch(0),
});

export const TransactionSchema = z.object({
  id: z.string(),
  type: z.enum(['TOPUP', 'SCAN_DEBIT', 'REFUND']),
  status: z.enum(['SUCCESS', 'PENDING', 'FAILED']).catch('SUCCESS'),
  createdAt: z.string(),
  reference: z.string().nullish(),
  scans: z.coerce.number().int().catch(0),
  amountUgx: z.coerce.number().catch(0),
  amountUsd: z.coerce.number().catch(0),
  description: z.string().default(''),
  paymentMethod: z.string().nullish(),
  phone: z.string().nullish(),
});

export const UserSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  uuid: z.string().nullish(),
  fullName: z.string().default(''),
  email: z.string().default(''),
  phone: z.string().nullish(),
  role: z.string().default('patient'),
  createdAt: z.string().nullish(),
});

export const HistoryEntrySchema = z.object({
  id: z.string(),
  organId: z.enum(['heart', 'kidney', 'liver']),
  organName: z.string(),
  date: z.string(),
  riskLevel: z.enum(RISK_LEVELS),
  riskScore: z.coerce.number().catch(0),
  symptomCount: z.coerce.number().int().catch(0),
  summary: z.string().default(''),
});

/**
 * Parse defensively: return the valid items and drop the rest rather than
 * throwing away a whole list because one stored record is malformed.
 */
export function parseList(schema, value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  for (const item of value) {
    const parsed = schema.safeParse(item);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}
