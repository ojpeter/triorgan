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
  return {
    ApiError,
    api: { get: jest.fn(), post: jest.fn() },
    setTokens: jest.fn(),
    clearTokens: jest.fn(),
  };
});

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  login, register, logout, requestPasswordReset, getStoredUser,
  validateEmail, validatePassword, validateFullName, PASSWORD_MIN_LENGTH,
} from '../authService';
import { api, ApiError, setTokens, clearTokens } from '../apiClient';
import { STORAGE_KEYS } from '../storageKeys';

const TOKENS = { access_token: 'access-1', refresh_token: 'refresh-1' };
const PROFILE = {
  id: 7,
  full_name: 'Amara Nakato',
  email: 'amara@example.com',
  phone: '0771234567',
  role: 'patient',
};

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
});

describe('field validation', () => {
  it.each([
    ['', 'Enter your email address.'],
    ['not-an-email', 'That email address does not look right.'],
    ['missing@tld', 'That email address does not look right.'],
  ])('rejects email %p', (input, message) => {
    expect(validateEmail(input)).toBe(message);
  });

  it('accepts a normal email', () => {
    expect(validateEmail('amara@example.com')).toBeNull();
  });

  it(`requires at least ${PASSWORD_MIN_LENGTH} characters`, () => {
    expect(validatePassword('short')).toContain(String(PASSWORD_MIN_LENGTH));
    expect(validatePassword('longenough1')).toBeNull();
  });

  it('requires a real name', () => {
    expect(validateFullName('A')).toBe('Enter your full name.');
    expect(validateFullName('Amara')).toBeNull();
  });
});

describe('login', () => {
  it('persists the session and returns a normalised user', async () => {
    api.post.mockResolvedValue(TOKENS);
    api.get.mockResolvedValue(PROFILE);

    const result = await login({ email: ' Amara@Example.com ', password: 'password1' });

    expect(result.ok).toBe(true);
    expect(result.user).toMatchObject({
      id: '7',
      fullName: 'Amara Nakato',
      email: 'amara@example.com',
    });
    expect(setTokens).toHaveBeenCalledWith(
      expect.objectContaining({ accessToken: 'access-1', refreshToken: 'refresh-1' })
    );
    expect(await getStoredUser()).toMatchObject({ id: '7' });
  });

  it('lower-cases and trims the email before sending it', async () => {
    api.post.mockResolvedValue(TOKENS);
    api.get.mockResolvedValue(PROFILE);

    await login({ email: '  Amara@Example.COM ', password: 'password1' });

    expect(api.post.mock.calls[0][1].email).toBe('amara@example.com');
  });

  // An error that distinguishes "no such account" from "wrong password" turns
  // the login form into an account-enumeration oracle.
  it.each([401, 400])('gives the same message for HTTP %i', async (status) => {
    api.post.mockRejectedValue(new ApiError({ code: 'UNAUTHORIZED', status, userMessage: 'x' }));

    const result = await login({ email: 'amara@example.com', password: 'wrong' });

    expect(result).toEqual({ ok: false, error: 'Incorrect email or password.' });
  });

  it('still signs in when the profile lookup fails', async () => {
    api.post.mockResolvedValue({ ...TOKENS, ...PROFILE });
    api.get.mockRejectedValue(new ApiError({ code: 'SERVER', status: 500, userMessage: 'x' }));

    const result = await login({ email: 'amara@example.com', password: 'password1' });

    expect(result.ok).toBe(true);
  });

  it('does not call the API for an obviously bad email', async () => {
    const result = await login({ email: 'nope', password: 'password1' });

    expect(result).toMatchObject({ ok: false, field: 'email' });
    expect(api.post).not.toHaveBeenCalled();
  });
});

describe('register', () => {
  it('reports which field was wrong so the UI can point at it', async () => {
    const result = await register({ fullName: 'A', email: 'x', password: 'short' });

    expect(result).toMatchObject({ ok: false, field: 'fullName' });
    expect(api.post).not.toHaveBeenCalled();
  });

  it('maps a 409 to a field-level duplicate-email message', async () => {
    api.post.mockRejectedValue(new ApiError({ code: 'UNKNOWN', status: 409, userMessage: 'x' }));

    const result = await register({
      fullName: 'Amara Nakato',
      email: 'amara@example.com',
      password: 'password1',
    });

    expect(result).toMatchObject({ ok: false, field: 'email' });
    expect(result.error).toContain('already exists');
  });

  it('defaults country to Uganda and normalises the payload', async () => {
    api.post.mockResolvedValue(TOKENS);
    api.get.mockResolvedValue(PROFILE);

    await register({
      fullName: '  Amara Nakato  ',
      email: 'AMARA@example.com',
      phone: ' 0771234567 ',
      password: 'password1',
    });

    expect(api.post.mock.calls[0][1]).toMatchObject({
      full_name: 'Amara Nakato',
      email: 'amara@example.com',
      phone: '0771234567',
      country: 'Uganda',
    });
  });
});

describe('password reset', () => {
  // Must not reveal whether the address is registered.
  it('reports success even when the server errors', async () => {
    api.post.mockRejectedValue(new ApiError({ code: 'NOT_FOUND', status: 404, userMessage: 'x' }));

    await expect(requestPasswordReset('nobody@example.com')).resolves.toEqual({ ok: true });
  });

  it('validates the address before sending', async () => {
    const result = await requestPasswordReset('nope');
    expect(result).toMatchObject({ ok: false, field: 'email' });
    expect(api.post).not.toHaveBeenCalled();
  });
});

describe('logout', () => {
  it('revokes server-side then clears local state', async () => {
    api.post.mockResolvedValue(null);

    await logout();

    expect(api.post).toHaveBeenCalledWith('/auth/logout', undefined, expect.any(Object));
    expect(clearTokens).toHaveBeenCalled();
  });

  // The user asked to sign out; a network failure must not leave them signed in.
  it('clears local state even when the server call fails', async () => {
    api.post.mockRejectedValue(new ApiError({ code: 'NETWORK', userMessage: 'x' }));

    await logout();

    expect(clearTokens).toHaveBeenCalled();
  });
});

describe('getStoredUser', () => {
  it('returns null for a corrupted record rather than throwing', async () => {
    await AsyncStorage.setItem(STORAGE_KEYS.USER, '{broken');
    expect(await getStoredUser()).toBeNull();
  });

  it('returns null when the stored shape no longer validates', async () => {
    await AsyncStorage.setItem(STORAGE_KEYS.USER, JSON.stringify({ nope: true }));
    expect(await getStoredUser()).toBeNull();
  });
});
