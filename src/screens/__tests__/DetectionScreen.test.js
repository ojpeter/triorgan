/* eslint-env jest */
// The behaviour this guards: when an analysis fails, the user is told their
// credit was not used, and a double tap cannot start two screenings.

import React from 'react';
import { Alert } from 'react-native';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }),
}));

jest.mock('../../services/screeningService', () => ({ runScreening: jest.fn() }));
jest.mock('../../components/PaymentModal', () => 'PaymentModal');
jest.mock('../../components/AuthGateModal', () => 'AuthGateModal');
jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(),
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));

const mockUser = { id: 'user-1', fullName: 'Amara Nakato', email: 'a@example.com' };
jest.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: mockUser }) }));

const mockWallet = {
  balanceScans: 3,
  isReady: true,
  refresh: jest.fn(),
  applyWallet: jest.fn(),
};
jest.mock('../../context/WalletContext', () => ({ useWallet: () => mockWallet }));

import DetectionScreen from '../DetectionScreen';
import { runScreening } from '../../services/screeningService';
import { SYMPTOMS } from '../../constants/symptoms';

const FIRST_SYMPTOM = SYMPTOMS.heart[0];

const navigation = { navigate: jest.fn(), goBack: jest.fn() };
const route = { params: { organId: 'heart' } };

const renderScreen = () => render(<DetectionScreen route={route} navigation={navigation} />);

const selectFirstSymptom = () => fireEvent.press(screen.getByLabelText(FIRST_SYMPTOM.name));
const pressAnalyse = () => fireEvent.press(screen.getByLabelText(/Analyse ·/));

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('symptom selection', () => {
  it('exposes each symptom as a checkbox with its checked state', () => {
    renderScreen();

    const checkbox = screen.getByLabelText(FIRST_SYMPTOM.name);
    expect(checkbox.props.accessibilityState.checked).toBe(false);

    fireEvent.press(checkbox);
    expect(screen.getByLabelText(FIRST_SYMPTOM.name).props.accessibilityState.checked).toBe(true);
  });

  it('will not start a screening with nothing selected', () => {
    renderScreen();

    fireEvent.press(screen.getByLabelText(/Select symptoms to analyse/));

    expect(runScreening).not.toHaveBeenCalled();
  });
});

describe('when the analysis fails', () => {
  // The regression: this used to debit a credit and give the user nothing.
  it('tells the user their credit was not used', async () => {
    runScreening.mockResolvedValue({
      ok: false,
      code: 'NETWORK',
      message: 'No connection. Check your internet and try again.',
      retryable: true,
      wallet: { balanceScans: 3, totalScansUsed: 0, totalSpentUgx: 0, totalSpentUsd: 0 },
    });

    renderScreen();
    selectFirstSymptom();
    await act(async () => pressAnalyse());

    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());

    const [title, body] = Alert.alert.mock.calls[0];
    expect(title).toBe('Analysis could not finish');
    expect(body).toContain('has not been used');
    expect(navigation.navigate).not.toHaveBeenCalled();
  });

  it('applies the refunded wallet the service returns', async () => {
    const refunded = { balanceScans: 4, totalScansUsed: 0, totalSpentUgx: 0, totalSpentUsd: 0 };
    runScreening.mockResolvedValue({
      ok: false, code: 'TIMEOUT', message: 'timed out', retryable: true, wallet: refunded,
    });

    renderScreen();
    selectFirstSymptom();
    await act(async () => pressAnalyse());

    await waitFor(() => expect(mockWallet.applyWallet).toHaveBeenCalledWith(refunded));
  });

  it('offers a retry for a retryable failure only', async () => {
    runScreening.mockResolvedValue({
      ok: false, code: 'FORBIDDEN', message: 'nope', retryable: false, wallet: null,
    });

    renderScreen();
    selectFirstSymptom();
    await act(async () => pressAnalyse());

    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
    const buttons = Alert.alert.mock.calls[0][2];
    expect(buttons.map((b) => b.text)).toEqual(['OK']);
  });
});

describe('when the wallet is empty', () => {
  it('opens the payment sheet instead of showing an error', async () => {
    runScreening.mockResolvedValue({ ok: false, code: 'NO_CREDIT' });

    renderScreen();
    selectFirstSymptom();
    await act(async () => pressAnalyse());

    await waitFor(() => expect(screen.UNSAFE_getByType('PaymentModal').props.visible).toBe(true));
    expect(Alert.alert).not.toHaveBeenCalled();
  });
});

describe('when the analysis succeeds', () => {
  it('navigates to the result', async () => {
    const analysis = { riskLevel: 'LOW', riskScore: 12, riskSummary: 'All clear.' };
    runScreening.mockResolvedValue({ ok: true, analysis, wallet: null });

    renderScreen();
    selectFirstSymptom();
    await act(async () => pressAnalyse());

    await waitFor(() =>
      expect(navigation.navigate).toHaveBeenCalledWith(
        'Result',
        expect.objectContaining({ organId: 'heart', analysisResult: analysis })
      )
    );
  });
});

describe('double submission', () => {
  it('runs one screening even when the button is tapped twice', async () => {
    let resolve;
    runScreening.mockReturnValue(new Promise((r) => { resolve = r; }));

    renderScreen();
    selectFirstSymptom();

    await act(async () => {
      pressAnalyse();
      pressAnalyse();
    });

    expect(runScreening).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolve({ ok: true, analysis: { riskLevel: 'LOW' }, wallet: null });
    });
  });
});
