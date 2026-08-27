// ─────────────────────────────────────────────────────────────────────────────
// Orchestrates one screening: credit → analysis → history.
//
// This used to live inside DetectionScreen.handleAnalyze, which debited a credit
// and then had no path that gave it back — every network blip cost the user
// UGX 500. The rule now: a user is never charged for a screening they did not
// receive.
//
// In production the server enforces that atomically (debit and model call in one
// transaction). The dev stub mirrors it locally so behaviour matches.
// ─────────────────────────────────────────────────────────────────────────────

import { analyzeSymptoms } from './claudeService';
import { devDebitForScan, devRefundScan } from './paymentService';
import { ALLOW_LOCAL_WALLET_FALLBACK } from '../config/env';
import { addHistoryEntry } from './historyService';

/**
 * @returns {Promise<
 *   | {ok: true, analysis: object, wallet: object|null}
 *   | {ok: false, code: 'NO_CREDIT'}
 *   | {ok: false, code: string, message: string, retryable: boolean, wallet: object|null}
 * >}
 */
export async function runScreening({ userId, organ, selectedSymptoms, images, signal }) {
  let wallet = null;

  // Dev-only: mirror the server's debit so the local balance moves realistically.
  if (ALLOW_LOCAL_WALLET_FALLBACK) {
    try {
      wallet = await devDebitForScan({ userId, organName: organ.name });
    } catch (error) {
      if (error.code === 'PAYMENT_REQUIRED') return { ok: false, code: 'NO_CREDIT' };
      throw error;
    }
  }

  const result = await analyzeSymptoms({
    organId: organ.id,
    selectedSymptoms,
    images,
    signal,
  });

  if (!result.ok) {
    // The server refunds itself; the dev stub needs telling.
    if (ALLOW_LOCAL_WALLET_FALLBACK && wallet) {
      wallet = await devRefundScan({ userId, reason: result.code });
    }
    if (result.code === 'PAYMENT_REQUIRED') return { ok: false, code: 'NO_CREDIT' };
    return { ...result, ok: false, wallet };
  }

  // An unreadable photo is not a completed screening — do not file it as one.
  if (result.data.riskLevel !== 'INVALID') {
    await addHistoryEntry({
      organId: organ.id,
      organName: organ.name,
      analysis: result.data,
      symptomCount: selectedSymptoms.length,
    });
  } else if (ALLOW_LOCAL_WALLET_FALLBACK && wallet) {
    // The model could not use the photo, so the user got nothing usable.
    // Give the credit back rather than charging for a "retake the photo" message.
    wallet = await devRefundScan({ userId, reason: 'Photo could not be read' });
  }

  return { ok: true, analysis: result.data, wallet };
}
