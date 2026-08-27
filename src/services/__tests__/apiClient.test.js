/* eslint-env jest */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, request, ApiError, setTokens, setSessionExpiredHandler } from '../apiClient';
import { STORAGE_KEYS } from '../storageKeys';

const jsonResponse = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => (body === undefined ? '' : JSON.stringify(body)),
});

beforeEach(async () => {
  await AsyncStorage.clear();
  global.fetch = jest.fn();
  setSessionExpiredHandler(null);
});

describe('success', () => {
  it('parses JSON and attaches the bearer token', async () => {
    await setTokens({ accessToken: 'tok-123' });
    global.fetch.mockResolvedValue(jsonResponse(200, { hello: 'world' }));

    const data = await api.get('/wallet');

    expect(data).toEqual({ hello: 'world' });
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe('https://api.test.local/api/v1/wallet');
    expect(options.headers.Authorization).toBe('Bearer tok-123');
  });

  it('omits the Authorization header when auth is disabled', async () => {
    await setTokens({ accessToken: 'tok-123' });
    global.fetch.mockResolvedValue(jsonResponse(200, {}));

    await request('/auth/login', { method: 'POST', body: {}, auth: false });

    expect(global.fetch.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });

  it('handles an empty 204 body', async () => {
    global.fetch.mockResolvedValue(jsonResponse(204));
    await expect(api.post('/auth/logout')).resolves.toBeNull();
  });
});

describe('error mapping', () => {
  it.each([
    [402, 'PAYMENT_REQUIRED'],
    [403, 'FORBIDDEN'],
    [404, 'NOT_FOUND'],
    [429, 'RATE_LIMITED'],
    [500, 'SERVER'],
  ])('maps HTTP %i to %s', async (status, code) => {
    global.fetch.mockResolvedValue(jsonResponse(status, {}));

    await expect(api.get('/wallet')).rejects.toMatchObject({ code });
  });

  it('reports a network failure as retryable', async () => {
    global.fetch.mockRejectedValue(new TypeError('Network request failed'));

    const error = await api.get('/wallet').catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe('NETWORK');
    expect(error.isRetryable).toBe(true);
  });

  it('reports an aborted request as a timeout', async () => {
    global.fetch.mockRejectedValue(Object.assign(new Error('Aborted'), { name: 'AbortError' }));

    await expect(api.get('/wallet')).rejects.toMatchObject({ code: 'TIMEOUT' });
  });

  it('treats a 4xx as not retryable', async () => {
    global.fetch.mockResolvedValue(jsonResponse(404, {}));
    const error = await api.get('/wallet').catch((e) => e);
    expect(error.isRetryable).toBe(false);
  });

  // The old client put the API base into the user-facing string: "Is your
  // backend running at http://10.44.201.158:8000/api/v1?"
  it('never leaks the API base into the user-facing message', async () => {
    global.fetch.mockRejectedValue(new TypeError('connect ECONNREFUSED 10.44.201.158:8000'));

    const error = await api.get('/wallet').catch((e) => e);

    expect(error.userMessage).not.toMatch(/api\.test\.local|10\.44|http/i);
    expect(error.userMessage).toBe('No connection. Check your internet and try again.');
  });

  it('uses a plain-string server detail but ignores a structured one', async () => {
    global.fetch.mockResolvedValue(jsonResponse(400, { detail: 'Email already registered.' }));
    await expect(api.post('/auth/register', {})).rejects.toMatchObject({
      userMessage: 'Email already registered.',
    });

    // FastAPI returns a list of objects for validation errors — not user copy.
    global.fetch.mockResolvedValue(jsonResponse(400, { detail: [{ loc: ['body'], msg: 'bad' }] }));
    const error = await api.post('/auth/register', {}).catch((e) => e);
    expect(typeof error.userMessage).toBe('string');
    expect(error.userMessage).not.toContain('loc');
  });
});

describe('token refresh', () => {
  it('refreshes once on 401 and retries the original request', async () => {
    await setTokens({ accessToken: 'stale', refreshToken: 'refresh-1' });

    global.fetch
      .mockResolvedValueOnce(jsonResponse(401, {})) // original call
      .mockResolvedValueOnce(jsonResponse(200, { access_token: 'fresh' })) // refresh
      .mockResolvedValueOnce(jsonResponse(200, { balanceScans: 3 })); // retry

    const data = await api.get('/wallet');

    expect(data).toEqual({ balanceScans: 3 });
    expect(await AsyncStorage.getItem(STORAGE_KEYS.TOKEN)).toBe('fresh');
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it('clears the session and notifies when the refresh token is rejected', async () => {
    await setTokens({ accessToken: 'stale', refreshToken: 'refresh-1' });
    await AsyncStorage.setItem(STORAGE_KEYS.USER, JSON.stringify({ id: '1' }));

    const onExpired = jest.fn();
    setSessionExpiredHandler(onExpired);

    global.fetch
      .mockResolvedValueOnce(jsonResponse(401, {}))
      .mockResolvedValueOnce(jsonResponse(401, {})); // refresh also rejected

    await expect(api.get('/wallet')).rejects.toMatchObject({ code: 'UNAUTHORIZED' });

    expect(onExpired).toHaveBeenCalled();
    expect(await AsyncStorage.getItem(STORAGE_KEYS.TOKEN)).toBeNull();
    expect(await AsyncStorage.getItem(STORAGE_KEYS.USER)).toBeNull();
  });

  it('does not retry forever when the retry also 401s', async () => {
    await setTokens({ accessToken: 'stale', refreshToken: 'refresh-1' });

    global.fetch
      .mockResolvedValueOnce(jsonResponse(401, {}))
      .mockResolvedValueOnce(jsonResponse(200, { access_token: 'fresh' }))
      .mockResolvedValueOnce(jsonResponse(401, {}));

    await expect(api.get('/wallet')).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });
});
