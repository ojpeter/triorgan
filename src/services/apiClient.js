// ─────────────────────────────────────────────────────────────────────────────
// HTTP client. Every network call in the app goes through here so that
// timeouts, auth headers, token refresh and error shaping happen exactly once.
// ─────────────────────────────────────────────────────────────────────────────

import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE } from '../config/env';
import { STORAGE_KEYS } from './storageKeys';

/** Default budget for a normal request. */
const DEFAULT_TIMEOUT_MS = 15000;

/**
 * A failed request, carrying both a machine-readable code and a message that is
 * safe and useful to show a user. Never embed API_BASE or internal hostnames in
 * `userMessage` — that leaks infrastructure detail into the UI.
 */
export class ApiError extends Error {
  constructor({ code, status = 0, userMessage, detail }) {
    super(detail || userMessage || code);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.userMessage = userMessage;
  }

  /** True when retrying the same request might succeed. */
  get isRetryable() {
    return (
      this.code === 'NETWORK' ||
      this.code === 'TIMEOUT' ||
      this.code === 'RATE_LIMITED' ||
      this.status >= 500
    );
  }
}

const USER_MESSAGES = {
  NETWORK: 'No connection. Check your internet and try again.',
  TIMEOUT: 'That took too long. Check your connection and try again.',
  UNAUTHORIZED: 'Your session has expired. Please sign in again.',
  FORBIDDEN: "You don't have permission to do that.",
  NOT_FOUND: 'We could not find what you were looking for.',
  PAYMENT_REQUIRED: 'You have no scan credits left. Top up to continue.',
  RATE_LIMITED: 'Too many requests. Please wait a moment and try again.',
  SERVER: 'Our service is having trouble right now. Please try again shortly.',
  UNKNOWN: 'Something went wrong. Please try again.',
};

function codeForStatus(status) {
  if (status === 401) return 'UNAUTHORIZED';
  if (status === 402) return 'PAYMENT_REQUIRED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 404) return 'NOT_FOUND';
  if (status === 429) return 'RATE_LIMITED';
  if (status >= 500) return 'SERVER';
  return 'UNKNOWN';
}

// ── Token helpers ────────────────────────────────────────────────────────────

export const getToken = () => AsyncStorage.getItem(STORAGE_KEYS.TOKEN);

export async function setTokens({ accessToken, refreshToken }) {
  const writes = [];
  if (accessToken) writes.push([STORAGE_KEYS.TOKEN, accessToken]);
  if (refreshToken) writes.push([STORAGE_KEYS.REFRESH, refreshToken]);
  if (writes.length) await AsyncStorage.multiSet(writes);
}

export async function clearTokens() {
  await AsyncStorage.multiRemove([
    STORAGE_KEYS.TOKEN,
    STORAGE_KEYS.REFRESH,
    STORAGE_KEYS.USER,
  ]);
}

// ── Refresh coordination ─────────────────────────────────────────────────────
// If three requests 401 at once we must refresh once, not three times.

let refreshInFlight = null;

async function refreshAccessToken() {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const refreshToken = await AsyncStorage.getItem(STORAGE_KEYS.REFRESH);
    if (!refreshToken) return false;
    try {
      const data = await rawRequest('/auth/refresh', {
        method: 'POST',
        body: { refresh_token: refreshToken },
        auth: false,
      });
      await setTokens({
        accessToken: data.access_token,
        refreshToken: data.refresh_token ?? refreshToken,
      });
      return true;
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

/** Called when refresh fails, so AuthContext can drop the session. */
let onSessionExpired = null;
export function setSessionExpiredHandler(handler) {
  onSessionExpired = handler;
}

// ── Core request ─────────────────────────────────────────────────────────────

async function rawRequest(path, { method = 'GET', body, headers, auth = true, timeoutMs = DEFAULT_TIMEOUT_MS, signal } = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  // Let a caller-supplied signal (e.g. screen unmount) also cancel us.
  const onExternalAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', onExternalAbort);
  }

  try {
    const token = auth ? await getToken() : null;

    const response = await fetch(`${API_BASE}${path}`, {
      method,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined && { 'Content-Type': 'application/json' }),
        ...(token && { Authorization: `Bearer ${token}` }),
        ...headers,
      },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    });

    // 204 and empty bodies are valid successes.
    const text = await response.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        if (response.ok) {
          throw new ApiError({
            code: 'UNKNOWN',
            status: response.status,
            userMessage: USER_MESSAGES.UNKNOWN,
            detail: 'Response was not valid JSON',
          });
        }
      }
    }

    if (!response.ok) {
      const code = codeForStatus(response.status);
      // Prefer a server-supplied message when it is a plain string; FastAPI
      // returns a list of objects for validation errors, which is not user copy.
      const detail = typeof data?.detail === 'string' ? data.detail : null;
      throw new ApiError({
        code,
        status: response.status,
        userMessage: detail || USER_MESSAGES[code],
        detail: detail ?? `HTTP ${response.status}`,
      });
    }

    return data;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error.name === 'AbortError') {
      throw new ApiError({ code: 'TIMEOUT', userMessage: USER_MESSAGES.TIMEOUT });
    }
    throw new ApiError({
      code: 'NETWORK',
      userMessage: USER_MESSAGES.NETWORK,
      detail: error.message,
    });
  } finally {
    clearTimeout(timeoutId);
    if (signal) signal.removeEventListener('abort', onExternalAbort);
  }
}

/**
 * Make an authenticated request, refreshing the access token once on 401.
 *
 * @throws {ApiError} always — callers handle `error.code` / `error.userMessage`.
 */
export async function request(path, options = {}) {
  try {
    return await rawRequest(path, options);
  } catch (error) {
    const isAuthedCall = options.auth !== false;
    if (error.code === 'UNAUTHORIZED' && isAuthedCall && !options._retried) {
      const refreshed = await refreshAccessToken();
      if (refreshed) return rawRequest(path, { ...options, _retried: true });
      await clearTokens();
      onSessionExpired?.();
    }
    throw error;
  }
}

export const api = {
  get: (path, options) => request(path, { ...options, method: 'GET' }),
  post: (path, body, options) => request(path, { ...options, method: 'POST', body }),
  patch: (path, body, options) => request(path, { ...options, method: 'PATCH', body }),
  delete: (path, options) => request(path, { ...options, method: 'DELETE' }),
};
