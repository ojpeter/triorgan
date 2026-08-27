/* eslint-env jest */
// Renders the real App: providers, NavigationContainer, the tab navigator and
// the stacks. Every other suite mocks navigation, so this is the only automated
// check that the navigator tree actually mounts — which is what a React
// Navigation major upgrade is most likely to break.

import React from 'react';
import { AccessibilityInfo } from 'react-native';
import { render, screen, waitFor, act } from '@testing-library/react-native';

// Spread the real module so the context objects stay intact —
// @react-navigation/elements reads SafeAreaInsetsContext directly, and a bare
// stub makes useContext(undefined) throw. Only the hooks are overridden.
// Mirrors react-native-safe-area-context/jest/mock: spread the real module so
// the context objects stay intact (@react-navigation/elements reads
// SafeAreaInsetsContext directly), and replace SafeAreaProvider, whose real
// implementation waits for a native onLayout that never fires under Jest and so
// renders no children.
jest.mock('react-native-safe-area-context', () => {
  const ReactLocal = require('react');
  const actual = jest.requireActual('react-native-safe-area-context');
  const insets = { top: 44, right: 0, bottom: 34, left: 0 };
  const frame = { x: 0, y: 0, width: 390, height: 844 };

  return {
    ...actual,
    initialWindowMetrics: { frame, insets },
    useSafeAreaInsets: () => insets,
    useSafeAreaFrame: () => frame,
    SafeAreaProvider: ({ children }) =>
      ReactLocal.createElement(
        actual.SafeAreaFrameContext.Provider,
        { value: frame },
        ReactLocal.createElement(
          actual.SafeAreaInsetsContext.Provider,
          { value: insets },
          children
        )
      ),
  };
});

const mockHasOnboarded = jest.fn();
const mockGetStoredUser = jest.fn();

jest.mock('../src/services/authService', () => ({
  hasOnboarded: (...args) => mockHasOnboarded(...args),
  getStoredUser: (...args) => mockGetStoredUser(...args),
  logout: jest.fn(),
  setOnboarded: jest.fn(),
}));

// Keep the wallet out of it — WalletProvider would otherwise hit the network.
jest.mock('../src/services/paymentService', () => {
  const actual = jest.requireActual('../src/constants/payments');
  return {
    ...actual,
    fetchWallet: jest.fn().mockResolvedValue({
      balanceScans: 3, totalScansUsed: 0, totalSpentUgx: 0, totalSpentUsd: 0,
    }),
    fetchTransactions: jest.fn().mockResolvedValue([]),
    startTopUp: jest.fn(),
    getPaymentStatus: jest.fn(),
    devDebitForScan: jest.fn(),
    devRefundScan: jest.fn(),
    EMPTY_WALLET: {
      balanceScans: 0, totalScansUsed: 0, totalSpentUgx: 0, totalSpentUsd: 0,
    },
  };
});

import App from '../App';

const USER = { id: 'u1', fullName: 'Amara Nakato', email: 'a@example.com', role: 'patient' };

// App.js holds the launch screen for MIN_SPLASH_MS so its animation can land.
// Fake timers let the tests skip that without waiting in real time.
const MIN_SPLASH_MS = 1700;

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

/** Renders, settles the startup promises, and skips the brand-moment hold. */
async function renderApp() {
  const utils = render(<App />);
  await act(async () => {
    jest.advanceTimersByTime(MIN_SPLASH_MS + 100);
  });
  return utils;
}

/** Renders and settles promises only — the splash is still on screen. */
async function renderDuringSplash() {
  const utils = render(<App />);
  await act(async () => {});
  return utils;
}

describe('cold start', () => {
  it('shows onboarding to a brand-new user', async () => {
    mockHasOnboarded.mockResolvedValue(false);
    mockGetStoredUser.mockResolvedValue(null);

    await renderApp();

    await waitFor(() => expect(screen.getByLabelText(/Skip the introduction/)).toBeTruthy());
  });

  it('shows sign-in to a returning signed-out user', async () => {
    mockHasOnboarded.mockResolvedValue(true);
    mockGetStoredUser.mockResolvedValue(null);

    await renderApp();

    await waitFor(() => expect(screen.getByText('Welcome back 👋')).toBeTruthy());
  });

  // The whole tab navigator plus the Home stack mounts here.
  it('takes a signed-in user straight to the app', async () => {
    mockHasOnboarded.mockResolvedValue(true);
    mockGetStoredUser.mockResolvedValue(USER);

    await renderApp();

    await waitFor(() => expect(screen.getByText('TriaCare')).toBeTruthy());
    expect(screen.getByText(/Hello, Amara/)).toBeTruthy();
  });
});

describe('tab bar', () => {
  it('registers every tab, including History', async () => {
    mockHasOnboarded.mockResolvedValue(true);
    mockGetStoredUser.mockResolvedValue(USER);

    await renderApp();

    await waitFor(() => expect(screen.getByText('TriaCare')).toBeTruthy());

    // HistoryScreen was imported but never routed before this work; if it falls
    // out of the navigator again, this fails.
    for (const label of ['Home', 'Learn', 'History', 'Wallet', 'Profile']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });
});

describe('resilience', () => {
  it('still reaches a usable screen when the stored session is unreadable', async () => {
    mockHasOnboarded.mockResolvedValue(true);
    mockGetStoredUser.mockResolvedValue(null);

    await renderApp();

    await waitFor(() => expect(screen.getByText('Welcome back 👋')).toBeTruthy());
  });
});

describe('startup splash', () => {
  /** Holds the app in its loading state indefinitely. */
  const stallStartup = () => {
    mockHasOnboarded.mockReturnValue(new Promise(() => {}));
    mockGetStoredUser.mockReturnValue(new Promise(() => {}));
  };

  it('shows the branded splash while the session is still restoring', async () => {
    stallStartup();

    // The splash reads the reduce-motion preference before its first real
    // paint, so let that microtask settle. It renders a SPLASH_MID frame in the
    // meantime, which is the same colour as the native splash — invisible.
    await renderDuringSplash();

    expect(screen.getByLabelText('TriaCare is starting')).toBeTruthy();
    expect(screen.getByText('TriaCare')).toBeTruthy();
    expect(screen.getByText('Heart · Kidney · Liver')).toBeTruthy();
  });

  // Motion sensitivity is a real accessibility need, and a health app is the
  // last place to ignore the system setting.
  it('renders without animation when reduce motion is on', async () => {
    const spy = jest
      .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
      .mockResolvedValue(true);
    stallStartup();

    await renderDuringSplash();

    expect(spy).toHaveBeenCalled();
    // Same content, just composed rather than animated in.
    expect(screen.getByLabelText('TriaCare is starting')).toBeTruthy();
    expect(screen.getByText('TriaCare')).toBeTruthy();

    spy.mockRestore();
  });

  // Startup is ~150ms of AsyncStorage but the animation runs ~1.6s. Without the
  // hold, the splash unmounts before the three organs meet and the cut reads as
  // a glitch.
  it('holds the splash through the brand moment even when startup is instant', async () => {
    mockHasOnboarded.mockResolvedValue(true);
    mockGetStoredUser.mockResolvedValue(null);

    render(<App />);
    await act(async () => {
      jest.advanceTimersByTime(400);
    });

    expect(screen.getByLabelText('TriaCare is starting')).toBeTruthy();
    expect(screen.queryByText('Welcome back 👋')).toBeNull();
  });

  it('leaves the splash once the hold has elapsed', async () => {
    mockHasOnboarded.mockResolvedValue(true);
    mockGetStoredUser.mockResolvedValue(null);

    await renderApp();

    await waitFor(() => expect(screen.queryByLabelText('TriaCare is starting')).toBeNull());
    expect(screen.getByText('Welcome back 👋')).toBeTruthy();
  });

  // The native splash is a flat colour and the JS splash is a gradient. If the
  // two stop matching, the handoff flashes — which is the defect this replaced.
  it('keeps the native splash colour in step with the JS gradient', () => {
    const appJson = require('../app.json');
    const { SPLASH_MID } = require('../src/components/AppSplash');

    expect(appJson.expo.splash.backgroundColor.toLowerCase()).toBe(SPLASH_MID.toLowerCase());
  });

  // The native splash used to show the assembled triad, and then AppSplash took
  // it apart and rebuilt it — the finished mark, then its own construction.
  // A flat fill keeps launch reading as one screen rather than two.
  it('shows no artwork on the native splash', () => {
    const appJson = require('../app.json');

    expect(appJson.expo.splash.image).toBeUndefined();
    expect(Object.keys(appJson.expo.splash)).toEqual(['backgroundColor']);
  });

  // SDK 54 builds the native splash from the expo-splash-screen plugin, not
  // from the legacy expo.splash key. If the plugin is missing, a stale splash
  // survives config changes — which is exactly what happened.
  it('configures the native splash through the expo-splash-screen plugin', () => {
    const appJson = require('../app.json');
    const buildConfig = require('../app.config.js')({ config: appJson.expo });

    const plugin = buildConfig.plugins.find(
      (p) => Array.isArray(p) && p[0] === 'expo-splash-screen'
    );

    expect(plugin).toBeDefined();
    expect(plugin[1].image).toBeUndefined();
    expect(plugin[1].backgroundColor.toLowerCase()).toBe(
      appJson.expo.splash.backgroundColor.toLowerCase()
    );
  });
});
