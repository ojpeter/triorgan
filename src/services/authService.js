// ─────────────────────────────────────────────────────────────────────────────
// HeLiK — Authentication.
//
// The API base URL now comes from app.config.js (see src/config/env.js) rather
// than a hand-edited constant, so a release build cannot ship pointing at a
// developer's LAN address. Transport, timeouts and token refresh live in
// apiClient.js.
// ─────────────────────────────────────────────────────────────────────────────

import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, ApiError, setTokens, clearTokens } from './apiClient';
import { STORAGE_KEYS } from './storageKeys';
import { UserSchema } from './schemas';

// ── Onboarding ───────────────────────────────────────────────────────────────

export async function hasOnboarded() {
  return (await AsyncStorage.getItem(STORAGE_KEYS.ONBOARDED)) === 'true';
}

export async function setOnboarded() {
  await AsyncStorage.setItem(STORAGE_KEYS.ONBOARDED, 'true');
}

// ── Session ──────────────────────────────────────────────────────────────────

export async function getStoredUser() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.USER);
    if (!raw) return null;
    const parsed = UserSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Normalises the backend's snake_case payload into the app's user shape. */
function toUser(payload = {}) {
  const source = payload.user ?? payload;
  return UserSchema.parse({
    id: source.id ?? source.uuid ?? '',
    uuid: source.uuid ?? null,
    fullName: source.full_name ?? source.fullName ?? '',
    email: source.email ?? '',
    phone: source.phone ?? null,
    role: source.role ?? 'patient',
    createdAt: source.created_at ?? source.createdAt ?? null,
  });
}

async function persistSession(tokenPayload, profilePayload) {
  await setTokens({
    accessToken: tokenPayload.access_token,
    refreshToken: tokenPayload.refresh_token,
  });
  const user = toUser(profilePayload ?? tokenPayload);
  await AsyncStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
  return user;
}

// ── Validation ───────────────────────────────────────────────────────────────
// Kept deliberately simple and permissive; the server is the real authority.
// The only job here is to save the user a round trip on obvious mistakes.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Minimum that a password must satisfy. Mirrored server-side. */
export const PASSWORD_MIN_LENGTH = 8;

export function validateEmail(email) {
  if (!email?.trim()) return 'Enter your email address.';
  if (!EMAIL_RE.test(email.trim())) return 'That email address does not look right.';
  return null;
}

export function validatePassword(password) {
  if (!password) return 'Enter a password.';
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  return null;
}

export function validateFullName(fullName) {
  if (!fullName?.trim() || fullName.trim().length < 2) return 'Enter your full name.';
  return null;
}

// ── Actions ──────────────────────────────────────────────────────────────────
// Each returns {ok, user} or {ok: false, error, field?} so screens can place the
// message next to the field that caused it rather than in a generic banner.

export async function register({ fullName, email, phone, password, gender, country }) {
  const fieldError =
    (validateFullName(fullName) && { field: 'fullName', error: validateFullName(fullName) }) ||
    (validateEmail(email) && { field: 'email', error: validateEmail(email) }) ||
    (validatePassword(password) && { field: 'password', error: validatePassword(password) });
  if (fieldError) return { ok: false, ...fieldError };

  try {
    const tokenPayload = await api.post(
      '/auth/register',
      {
        full_name: fullName.trim(),
        email: email.toLowerCase().trim(),
        phone: phone?.trim() || null,
        password,
        gender: gender ?? null,
        country: country ?? 'Uganda',
      },
      { auth: false }
    );

    await setTokens({ accessToken: tokenPayload.access_token });
    const profile = await api.get('/auth/me').catch(() => null);
    const user = await persistSession(tokenPayload, profile);
    return { ok: true, user };
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) {
      return { ok: false, field: 'email', error: 'An account with this email already exists.' };
    }
    return { ok: false, error: error.userMessage ?? 'Could not create your account.' };
  }
}

export async function login({ email, password }) {
  const emailError = validateEmail(email);
  if (emailError) return { ok: false, field: 'email', error: emailError };
  if (!password) return { ok: false, field: 'password', error: 'Enter your password.' };

  try {
    const tokenPayload = await api.post(
      '/auth/login',
      { email: email.toLowerCase().trim(), password },
      { auth: false }
    );

    await setTokens({ accessToken: tokenPayload.access_token });
    const profile = await api.get('/auth/me').catch(() => null);
    const user = await persistSession(tokenPayload, profile);
    return { ok: true, user };
  } catch (error) {
    // Never confirm whether the email exists — that turns the login form into an
    // account-enumeration oracle. One message for both cases.
    if (error instanceof ApiError && (error.status === 401 || error.status === 400)) {
      return { ok: false, error: 'Incorrect email or password.' };
    }
    return { ok: false, error: error.userMessage ?? 'Could not sign you in.' };
  }
}

export async function requestPasswordReset(email) {
  const emailError = validateEmail(email);
  if (emailError) return { ok: false, field: 'email', error: emailError };

  // Deliberately reports success regardless of the result, for the same
  // enumeration reason. Failures are not surfaced to the caller.
  try {
    await api.post(
      '/auth/forgot-password',
      { email: email.toLowerCase().trim() },
      { auth: false }
    );
  } catch {
    /* intentionally ignored */
  }
  return { ok: true };
}

export async function logout() {
  // Tell the server first so the refresh token is revoked, then clear locally.
  // Local state is cleared even if the call fails — the user asked to sign out.
  try {
    await api.post('/auth/logout', undefined, { timeoutMs: 5000 });
  } catch {
    /* intentionally ignored */
  }
  await clearTokens();
}
