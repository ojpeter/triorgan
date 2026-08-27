/* eslint-env jest */
// Renders the real App: providers, NavigationContainer, the tab navigator and
// the stacks. Every other suite mocks navigation, so this is the only automated
// check that the navigator tree actually mounts — which is what a React
// Navigation major upgrade is most likely to break.

import React from 'react';
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

beforeEach(() => {
  jest.clearAllMocks();
});

async function renderApp() {
  const utils = render(<App />);
  // Let the session/onboarding restore effects settle.
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

    await waitFor(() => expect(screen.getByText('Corvia')).toBeTruthy());
    expect(screen.getByText(/Hello, Amara/)).toBeTruthy();
  });
});

describe('tab bar', () => {
  it('registers every tab, including History', async () => {
    mockHasOnboarded.mockResolvedValue(true);
    mockGetStoredUser.mockResolvedValue(USER);

    await renderApp();

    await waitFor(() => expect(screen.getByText('Corvia')).toBeTruthy());

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
