// ─────────────────────────────────────────────────────────────────────────────
// HeLiK — AI screening service.
//
// SECURITY: this file used to hold a live Anthropic API key as a string literal
// and call api.anthropic.com directly from the device. React Native has no
// server side — Metro inlines source into the shipped bundle, so that key was
// readable by anyone who downloaded the app, could not be rotated without a new
// release, and billed every request to the developer's account.
//
// The key now lives on the backend and NEVER on the device. The app calls our
// own endpoint, which authenticates the user, debits a credit, calls the model,
// and refunds the credit if the model call fails. See BACKEND.md for the
// contract and a reference implementation.
//
// Do not reintroduce a key here, in .env, or in app.config.js `extra` —
// EXPO_PUBLIC_* variables are inlined into the bundle exactly like a literal.
// ─────────────────────────────────────────────────────────────────────────────

import { api, ApiError } from './apiClient';
import { AnalysisResultSchema } from './schemas';
import { COLORS } from '../constants/colors';

/** Vision requests are slow; give them a bigger budget than a normal call. */
const ANALYSIS_TIMEOUT_MS = 60000;

/**
 * Run a screening.
 *
 * The server owns the credit: it debits before calling the model and refunds on
 * its own failure, so a network error here never silently costs the user a scan.
 *
 * @returns {Promise<{ok: true, data: object} | {ok: false, code: string, message: string, retryable: boolean}>}
 */
export async function analyzeSymptoms({ organId, selectedSymptoms, images = [], signal }) {
  try {
    const raw = await api.post(
      '/screenings/analyze',
      {
        organ_id: organId,
        symptom_ids: selectedSymptoms,
        // Every attached photo, each tagged with the symptom it illustrates.
        // The old client collected one photo per symptom and then sent only the
        // first, silently discarding the rest.
        images: images.map(({ symptomId, base64 }) => ({
          symptom_id: symptomId,
          data: base64,
        })),
      },
      { timeoutMs: ANALYSIS_TIMEOUT_MS, signal }
    );

    const parsed = AnalysisResultSchema.safeParse(raw?.analysis ?? raw);
    if (!parsed.success) {
      // The model returned something we cannot safely render. The server has
      // already refunded the credit; tell the user plainly.
      if (__DEV__) console.warn('Analysis failed validation:', parsed.error.issues);
      return {
        ok: false,
        code: 'BAD_ANALYSIS',
        message:
          'The analysis came back incomplete. Your scan credit has not been used — please try again.',
        retryable: true,
      };
    }

    return { ok: true, data: parsed.data };
  } catch (error) {
    if (error instanceof ApiError) {
      return {
        ok: false,
        code: error.code,
        message: error.userMessage,
        retryable: error.isRetryable,
      };
    }
    return {
      ok: false,
      code: 'UNKNOWN',
      message: 'Something went wrong. Please try again.',
      retryable: true,
    };
  }
}

// ── Risk presentation ────────────────────────────────────────────────────────
// Contrast note: each foreground/background pair below meets WCAG 2.2 AA (4.5:1)
// for body text, so risk level is never signalled by colour alone — every use
// site pairs these with an icon and a text label.

const RISK_STYLES = {
  LOW: { color: '#047857', bg: '#ECFDF5', icon: 'checkmark-circle', label: 'Low risk' },
  MODERATE: { color: '#B45309', bg: '#FFFBEB', icon: 'alert-circle', label: 'Moderate risk' },
  HIGH: { color: '#B91C1C', bg: '#FEF2F2', icon: 'warning', label: 'High risk' },
  CRITICAL: { color: '#7F1D1D', bg: '#FFF1F2', icon: 'medical', label: 'Critical risk' },
  INVALID: { color: '#B45309', bg: '#FFFBEB', icon: 'camera-reverse', label: 'Photo not recognised' },
};

const DEFAULT_RISK_STYLE = {
  color: COLORS.gray600,
  bg: COLORS.gray50,
  icon: 'help-circle',
  label: 'Unknown',
};

export const getRiskStyle = (riskLevel) => RISK_STYLES[riskLevel] ?? DEFAULT_RISK_STYLE;
export const getRiskColor = (riskLevel) => getRiskStyle(riskLevel).color;
export const getRiskBg = (riskLevel) => getRiskStyle(riskLevel).bg;
