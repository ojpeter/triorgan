// ─────────────────────────────────────────────────────────────────────────────
// Buy scan credits.
//
// The previous version "processed" a payment by awaiting a 2.2 second timer and
// then crediting the local wallet — no gateway, no money, free credits for
// anyone who tapped through. This one asks the server to start a real payment
// and waits for the server to confirm it.
//
// Mobile money is asynchronous: the user approves a USSD prompt on their handset
// and the gateway calls our webhook seconds later. The UI must poll for that,
// never assume success.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Modal, ScrollView, ActivityIndicator,
  KeyboardAvoidingView, Platform, Pressable, TextInput, Linking,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../constants/colors';
import { useAuth } from '../context/AuthContext';
import { useWallet } from '../context/WalletContext';
import {
  PACKAGES, PAYMENT_METHODS, SCAN_PRICE, formatUGX, formatUSD,
  isValidUgandanMobile, normalisePhone, startTopUp, getPaymentStatus,
} from '../services/paymentService';
import { AppButton, IconButton } from './ui/AppButton';
import { InlineError } from './ui/StateViews';

const STEPS = ['packages', 'method', 'phone', 'confirm', 'processing', 'success'];

const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 120000;

const STEP_TITLES = {
  packages: 'Buy scan credits',
  method: 'Choose payment method',
  phone: 'Enter your number',
  confirm: 'Confirm payment',
  processing: 'Waiting for payment',
  success: 'Payment successful',
};

export default function PaymentModal({ visible, onClose, onSuccess, organName }) {
  const { user } = useAuth();
  const { wallet, refresh: refreshWallet } = useWallet();
  const insets = useSafeAreaInsets();

  const [step, setStep] = useState('packages');
  const [selectedPkg, setSelectedPkg] = useState(PACKAGES[1]);
  const [selectedMethod, setSelectedMethod] = useState(null);
  const [phone, setPhone] = useState('');
  const [phoneError, setPhoneError] = useState(null);
  const [error, setError] = useState(null);

  const pollTimer = useRef(null);
  const submitting = useRef(false);

  const stopPolling = useCallback(() => {
    if (pollTimer.current) {
      clearTimeout(pollTimer.current);
      pollTimer.current = null;
    }
  }, []);

  // Reset to a clean state each time the sheet opens, and never leave a poll
  // running behind a closed modal.
  useEffect(() => {
    if (visible) {
      setStep('packages');
      setSelectedMethod(null);
      setPhone('');
      setPhoneError(null);
      setError(null);
      submitting.current = false;
    } else {
      stopPolling();
    }
  }, [visible, stopPolling]);

  useEffect(() => stopPolling, [stopPolling]);

  const handleSuccess = useCallback(
    (nextWallet) => {
      stopPolling();
      setStep('success');
      if (nextWallet) onSuccess?.(nextWallet);
      refreshWallet();
    },
    [onSuccess, refreshWallet, stopPolling]
  );

  const pollUntilSettled = useCallback(
    (paymentId, startedAt = Date.now()) => {
      pollTimer.current = setTimeout(async () => {
        try {
          const status = await getPaymentStatus(paymentId);

          if (status.status === 'COMPLETED') {
            handleSuccess(status.wallet);
            return;
          }
          if (status.status === 'FAILED') {
            stopPolling();
            setError(status.message ?? 'The payment was declined or cancelled.');
            setStep('confirm');
            return;
          }
          if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
            stopPolling();
            setError(
              'We have not had confirmation yet. If you approved the payment, your credits will appear shortly — pull down on the Wallet screen to refresh.'
            );
            setStep('confirm');
            return;
          }
          pollUntilSettled(paymentId, startedAt);
        } catch (err) {
          stopPolling();
          setError(err?.userMessage ?? 'We lost connection while confirming your payment.');
          setStep('confirm');
        }
      }, POLL_INTERVAL_MS);
    },
    [handleSuccess, stopPolling]
  );

  const handleConfirm = useCallback(async () => {
    if (submitting.current) return;
    submitting.current = true;
    setError(null);
    setStep('processing');

    try {
      const result = await startTopUp({
        userId: user?.id,
        packageId: selectedPkg.id,
        methodId: selectedMethod.id,
        phone: selectedMethod.requiresPhone ? normalisePhone(phone) : null,
      });

      if (result.status === 'COMPLETED') {
        handleSuccess(result.wallet);
      } else if (result.paymentId) {
        // Card payments need the hosted checkout page opened; mobile money
        // pushes a USSD prompt to the handset instead and has no link.
        if (result.redirectUrl) {
          const opened = await Linking.openURL(result.redirectUrl).then(
            () => true,
            () => false
          );
          if (!opened) {
            setError('We could not open the payment page. Please try another method.');
            setStep('confirm');
            return;
          }
        }
        pollUntilSettled(result.paymentId);
      } else {
        setError('We could not start that payment. Please try again.');
        setStep('confirm');
      }
    } catch (err) {
      setError(err?.userMessage ?? 'We could not start that payment. Please try again.');
      setStep('confirm');
    } finally {
      submitting.current = false;
    }
  }, [user?.id, selectedPkg, selectedMethod, phone, handleSuccess, pollUntilSettled]);

  const handleSelectMethod = useCallback((method) => {
    setSelectedMethod(method);
    setError(null);
    setStep(method.requiresPhone ? 'phone' : 'confirm');
  }, []);

  const handlePhoneContinue = useCallback(() => {
    if (!isValidUgandanMobile(phone)) {
      setPhoneError('Enter a 9-digit number starting with 7, for example 771 234 567.');
      return;
    }
    setPhoneError(null);
    setStep('confirm');
  }, [phone]);

  const goBack = useCallback(() => {
    setError(null);
    if (step === 'method') setStep('packages');
    else if (step === 'phone') setStep('method');
    else if (step === 'confirm') setStep(selectedMethod?.requiresPhone ? 'phone' : 'method');
  }, [step, selectedMethod]);

  const canGoBack = step === 'method' || step === 'phone' || step === 'confirm';
  const isBusy = step === 'processing';

  // Android hardware back / iOS swipe-to-dismiss must not abandon a live payment.
  const handleRequestClose = useCallback(() => {
    if (isBusy) return;
    onClose?.();
  }, [isBusy, onClose]);

  const newBalance = useMemo(
    () => (wallet?.balanceScans ?? 0) + (selectedPkg?.scans ?? 0),
    [wallet?.balanceScans, selectedPkg]
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleRequestClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Traps assistive focus inside the sheet so a screen reader cannot
            wander onto the screen behind it. */}
        <View
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}
          accessibilityViewIsModal
        >
          <LinearGradient
            colors={[COLORS.primaryDark, COLORS.primary]}
            style={styles.header}
          >
            <View style={styles.headerRow}>
              {canGoBack ? (
                <IconButton icon="chevron-back" label="Back" onPress={goBack} size={22} />
              ) : (
                <View style={styles.headerSpacer} />
              )}
              <View style={styles.headerCenter}>
                <Text style={styles.headerTitle} accessibilityRole="header">
                  {STEP_TITLES[step]}
                </Text>
                <Text style={styles.headerSub}>
                  {organName ? `${organName} screening · ` : ''}
                  {formatUGX(SCAN_PRICE.UGX)} per scan
                </Text>
              </View>
              {!isBusy && step !== 'success' ? (
                <IconButton
                  icon="close"
                  label="Close payment"
                  onPress={onClose}
                  size={20}
                  background="rgba(255,255,255,0.15)"
                />
              ) : (
                <View style={styles.headerSpacer} />
              )}
            </View>

            {wallet && (
              <View style={styles.balanceStrip}>
                <Ionicons name="wallet-outline" size={14} color="rgba(255,255,255,0.9)" />
                <Text style={styles.balanceText}>
                  Current balance: {wallet.balanceScans} scan
                  {wallet.balanceScans === 1 ? '' : 's'}
                </Text>
              </View>
            )}

            <StepIndicator step={step} />
          </LinearGradient>

          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            <InlineError message={error} style={styles.errorSpacing} />

            {step === 'packages' && (
              <>
                <Text style={styles.stepLabel}>Select a package</Text>
                {PACKAGES.map((pkg) => (
                  <Pressable
                    key={pkg.id}
                    onPress={() => {
                      setSelectedPkg(pkg);
                      setStep('method');
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`${pkg.label}, ${formatUGX(pkg.ugx)}, ${formatUGX(pkg.perScanUgx)} per scan${pkg.savedPercent > 0 ? `, saves ${pkg.savedPercent} percent` : ''}${pkg.popular ? '. Most popular' : ''}`}
                    style={({ pressed }) => [
                      styles.pkgCard,
                      pkg.popular && styles.pkgCardPopular,
                      pressed && styles.pressed,
                    ]}
                  >
                    {(pkg.popular || pkg.badge) && (
                      <View
                        style={[
                          styles.pkgBadge,
                          !pkg.popular && { backgroundColor: COLORS.success },
                        ]}
                      >
                        <Text style={styles.pkgBadgeText}>
                          {pkg.popular ? 'Most popular' : pkg.badge}
                        </Text>
                      </View>
                    )}
                    <View style={styles.pkgRow}>
                      <View style={styles.pkgScansBox}>
                        <Text style={styles.pkgScans}>{pkg.scans}</Text>
                        <Text style={styles.pkgScansLabel}>
                          scan{pkg.scans === 1 ? '' : 's'}
                        </Text>
                      </View>
                      <View style={styles.pkgMid}>
                        <Text style={styles.pkgLabel}>{pkg.label}</Text>
                        <Text style={styles.pkgPerScan}>
                          {formatUGX(pkg.perScanUgx)} per scan
                        </Text>
                      </View>
                      <View style={styles.pkgPriceBox}>
                        <Text style={styles.pkgPrice}>{formatUGX(pkg.ugx)}</Text>
                        <Text style={styles.pkgPriceUsd}>{formatUSD(pkg.usd)}</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={COLORS.gray300} />
                    </View>
                  </Pressable>
                ))}
                <View style={styles.reassurance}>
                  <Ionicons name="shield-checkmark-outline" size={15} color={COLORS.success} />
                  <Text style={styles.reassuranceText}>
                    Credits never expire. You are only charged once the payment is confirmed.
                  </Text>
                </View>
              </>
            )}

            {step === 'method' && (
              <>
                <OrderSummary pkg={selectedPkg} />
                <Text style={styles.stepLabel}>How would you like to pay?</Text>
                {PAYMENT_METHODS.filter((m) => m.available).map((method) => (
                  <Pressable
                    key={method.id}
                    onPress={() => handleSelectMethod(method)}
                    accessibilityRole="button"
                    accessibilityLabel={method.name}
                    accessibilityHint={method.numberHint ?? undefined}
                    style={({ pressed }) => [styles.methodCard, pressed && styles.pressed]}
                  >
                    <View style={[styles.methodIcon, { backgroundColor: method.color }]}>
                      <Text style={styles.methodEmoji} accessibilityElementsHidden>
                        {method.icon}
                      </Text>
                    </View>
                    <View style={styles.methodInfo}>
                      <Text style={styles.methodName}>{method.name}</Text>
                      {!!method.numberHint && (
                        <Text style={styles.methodHint}>{method.numberHint}</Text>
                      )}
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={COLORS.gray300} />
                  </Pressable>
                ))}
              </>
            )}

            {step === 'phone' && (
              <>
                <OrderSummary pkg={selectedPkg} method={selectedMethod} />
                <Text style={styles.stepLabel}>
                  Your {selectedMethod?.short} number
                </Text>
                <View style={[styles.phoneBox, !!phoneError && styles.phoneBoxError]}>
                  <Text style={styles.phonePrefix} accessibilityElementsHidden>
                    🇺🇬 +256
                  </Text>
                  <TextInput
                    style={styles.phoneInput}
                    value={phone}
                    onChangeText={(text) => {
                      setPhone(text);
                      if (phoneError) setPhoneError(null);
                    }}
                    placeholder={selectedMethod?.placeholder ?? '7XX XXX XXX'}
                    placeholderTextColor={COLORS.textMuted}
                    keyboardType="phone-pad"
                    textContentType="telephoneNumber"
                    autoComplete="tel"
                    maxLength={13}
                    autoFocus
                    accessibilityLabel={`${selectedMethod?.short} phone number, required, Uganda country code plus 256`}
                    accessibilityHint="Nine digits starting with 7"
                    aria-invalid={!!phoneError}
                  />
                </View>
                {!!phoneError && (
                  <Text style={styles.fieldError} accessibilityRole="alert" accessibilityLiveRegion="polite">
                    {phoneError}
                  </Text>
                )}
                <Text style={styles.phoneTip}>
                  A payment request will be sent to this number. Approve it on your handset to
                  complete the purchase.
                </Text>
                <AppButton
                  label="Continue"
                  icon="arrow-forward"
                  onPress={handlePhoneContinue}
                  style={styles.primaryAction}
                />
              </>
            )}

            {step === 'confirm' && (
              <>
                <View style={styles.confirmCard}>
                  <ConfirmRow label="Package" value={selectedPkg.label} />
                  <ConfirmRow label="Credits" value={`${selectedPkg.scans} scans`} />
                  <ConfirmRow
                    label="Amount"
                    value={`${formatUGX(selectedPkg.ugx)} (${formatUSD(selectedPkg.usd)})`}
                    emphasis
                  />
                  <ConfirmRow label="Method" value={selectedMethod?.name} />
                  {selectedMethod?.requiresPhone && (
                    <ConfirmRow label="Number" value={`+256 ${normalisePhone(phone)}`} />
                  )}
                  <ConfirmRow label="New balance" value={`${newBalance} scans`} last />
                </View>
                <AppButton
                  label={`Pay ${formatUGX(selectedPkg.ugx)}`}
                  icon="lock-closed-outline"
                  onPress={handleConfirm}
                  style={styles.primaryAction}
                  accessibilityHint="Sends a payment request to your phone"
                />
              </>
            )}

            {step === 'processing' && (
              <View style={styles.centered} accessibilityLiveRegion="polite">
                <ActivityIndicator size="large" color={COLORS.primary} />
                <Text style={styles.centeredTitle}>Waiting for your approval</Text>
                <Text style={styles.centeredText}>
                  {selectedMethod?.requiresPhone
                    ? `We sent a payment request to +256 ${normalisePhone(phone)}. Approve it on your phone to continue.`
                    : 'Complete your payment in the page that just opened, then come back here.'}
                </Text>
                <Text style={styles.centeredHint}>
                  Keep this screen open. This usually takes under a minute.
                </Text>
              </View>
            )}

            {step === 'success' && (
              <View style={styles.centered} accessibilityLiveRegion="assertive">
                <Ionicons name="checkmark-circle" size={64} color={COLORS.success} />
                <Text style={styles.centeredTitle}>Payment confirmed</Text>
                <Text style={styles.centeredText}>
                  {selectedPkg.scans} scan credit{selectedPkg.scans === 1 ? '' : 's'} added to
                  your wallet.
                </Text>
                <View style={styles.newBalanceCard}>
                  <Text style={styles.newBalanceLabel}>New balance</Text>
                  <Text style={styles.newBalanceValue}>
                    {wallet?.balanceScans ?? selectedPkg.scans} scans
                  </Text>
                </View>
                <AppButton
                  label="Continue"
                  icon="arrow-forward"
                  gradient={[COLORS.success, '#047857']}
                  onPress={onClose}
                  style={styles.primaryAction}
                />
              </View>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function StepIndicator({ step }) {
  const total = 4;
  const index = Math.min(STEPS.indexOf(step), total - 1);
  if (step === 'success') return null;
  return (
    <View
      style={styles.stepDots}
      accessibilityLabel={`Step ${index + 1} of ${total}`}
      accessibilityRole="progressbar"
    >
      {Array.from({ length: total }, (_, i) => (
        <View key={i} style={[styles.stepDot, i <= index && styles.stepDotActive]} />
      ))}
    </View>
  );
}

function OrderSummary({ pkg, method }) {
  return (
    <View style={styles.orderSummary} accessible>
      <Text style={styles.orderLabel}>Your order</Text>
      <Text style={styles.orderValue}>
        {pkg.label} — {formatUGX(pkg.ugx)}
        {method ? ` via ${method.name}` : ''}
      </Text>
    </View>
  );
}

function ConfirmRow({ label, value, emphasis, last }) {
  return (
    <View style={[styles.confirmRow, last && styles.confirmRowLast]} accessible
      accessibilityLabel={`${label}: ${value}`}>
      <Text style={styles.confirmKey}>{label}</Text>
      <Text style={[styles.confirmValue, emphasis && styles.confirmValueEmphasis]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(17,24,39,0.5)' },
  sheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '92%',
    overflow: 'hidden',
  },
  header: { paddingTop: 14, paddingHorizontal: 12, paddingBottom: 12 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerSpacer: { width: 48 },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 16.5, fontWeight: '800', color: '#FFFFFF', textAlign: 'center' },
  headerSub: { fontSize: 11.5, color: 'rgba(255,255,255,0.85)', marginTop: 2, textAlign: 'center' },
  balanceStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 10,
  },
  balanceText: { fontSize: 12, color: 'rgba(255,255,255,0.9)', fontWeight: '600' },
  stepDots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 12 },
  stepDot: {
    width: 22,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  stepDotActive: { backgroundColor: '#FFFFFF' },

  body: { padding: 16, gap: 10 },
  errorSpacing: { marginBottom: 4 },
  stepLabel: { fontSize: 13.5, fontWeight: '700', color: COLORS.textSecondary, marginBottom: 2 },
  pressed: { opacity: 0.75 },

  pkgCard: {
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 14,
    padding: 14,
    backgroundColor: COLORS.surface,
    minHeight: 48,
  },
  pkgCardPopular: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryBg },
  pkgBadge: {
    position: 'absolute',
    top: -1,
    right: 12,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
  },
  pkgBadgeText: { fontSize: 10, fontWeight: '800', color: '#FFFFFF' },
  pkgRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 6 },
  pkgScansBox: { alignItems: 'center', minWidth: 42 },
  pkgScans: { fontSize: 22, fontWeight: '900', color: COLORS.primary },
  pkgScansLabel: { fontSize: 10, color: COLORS.textMuted, marginTop: -2 },
  pkgMid: { flex: 1 },
  pkgLabel: { fontSize: 14.5, fontWeight: '700', color: COLORS.text },
  pkgPerScan: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  pkgPriceBox: { alignItems: 'flex-end' },
  pkgPrice: { fontSize: 14.5, fontWeight: '800', color: COLORS.text },
  pkgPriceUsd: { fontSize: 11, color: COLORS.textMuted, marginTop: 1 },

  reassurance: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    padding: 12,
    backgroundColor: COLORS.successBg,
    borderRadius: 10,
    marginTop: 4,
  },
  reassuranceText: { flex: 1, fontSize: 12, color: '#065F46', lineHeight: 17 },

  orderSummary: {
    backgroundColor: COLORS.gray50,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  orderLabel: { fontSize: 11, fontWeight: '700', color: COLORS.textMuted, letterSpacing: 0.5 },
  orderValue: { fontSize: 14, fontWeight: '700', color: COLORS.text, marginTop: 3 },

  methodCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 14,
    padding: 12,
    minHeight: 48,
  },
  methodIcon: { width: 42, height: 42, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  methodEmoji: { fontSize: 20 },
  methodInfo: { flex: 1 },
  methodName: { fontSize: 14.5, fontWeight: '700', color: COLORS.text },
  methodHint: { fontSize: 11.5, color: COLORS.textMuted, marginTop: 2 },

  phoneBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    minHeight: 54,
    backgroundColor: COLORS.gray50,
  },
  phoneBoxError: { borderColor: COLORS.danger, backgroundColor: COLORS.dangerBg },
  phonePrefix: { fontSize: 15, fontWeight: '700', color: COLORS.text, marginRight: 10 },
  phoneInput: { flex: 1, fontSize: 16, color: COLORS.text, paddingVertical: 12 },
  fieldError: { fontSize: 12.5, color: COLORS.danger, fontWeight: '600', marginTop: -2 },
  phoneTip: { fontSize: 12.5, color: COLORS.textSecondary, lineHeight: 18 },

  confirmCard: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    backgroundColor: COLORS.gray50,
  },
  confirmRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    gap: 12,
  },
  confirmRowLast: { borderBottomWidth: 0 },
  confirmKey: { fontSize: 13, color: COLORS.textSecondary },
  confirmValue: { fontSize: 13.5, fontWeight: '700', color: COLORS.text, flexShrink: 1, textAlign: 'right' },
  confirmValueEmphasis: { color: COLORS.primary, fontWeight: '800' },

  primaryAction: { marginTop: 8 },
  centered: { alignItems: 'center', gap: 10, paddingVertical: 24 },
  centeredTitle: { fontSize: 18, fontWeight: '800', color: COLORS.text, textAlign: 'center' },
  centeredText: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 20 },
  centeredHint: { fontSize: 12, color: COLORS.textMuted, textAlign: 'center' },
  newBalanceCard: {
    backgroundColor: COLORS.successBg,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: 'center',
    marginVertical: 6,
  },
  newBalanceLabel: { fontSize: 11.5, color: '#047857', fontWeight: '700' },
  newBalanceValue: { fontSize: 22, fontWeight: '900', color: '#065F46', marginTop: 2 },
});
