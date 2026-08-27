// ─────────────────────────────────────────────────────────────────────────────
// Loading / error / empty states.
//
// The app previously had none of these: a failed wallet load left `wallet` null
// and the UI rendered the fallback as fact — telling a paying user they had
// "0 credits". Loading, failed and genuinely-empty are three different states
// and must look different.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants/colors';
import { AppButton } from './AppButton';

export function LoadingState({ label = 'Loading…', style }) {
  return (
    <View
      style={[styles.centered, style]}
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      // Announced politely so it does not interrupt whatever is being read.
      accessibilityLiveRegion="polite"
    >
      <ActivityIndicator size="large" color={COLORS.primary} />
      <Text style={styles.muted}>{label}</Text>
    </View>
  );
}

/** A grey placeholder block sized like the content it stands in for. */
export function Skeleton({ width = '100%', height = 16, style }) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.skeleton, { width, height }, style]}
    />
  );
}

export function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
  retryLabel = 'Try again',
  style,
}) {
  return (
    <View
      style={[styles.centered, style]}
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive"
    >
      <Ionicons name="cloud-offline-outline" size={44} color={COLORS.gray400} />
      <Text style={styles.title}>{title}</Text>
      {!!message && <Text style={styles.muted}>{message}</Text>}
      {onRetry && (
        <AppButton
          label={retryLabel}
          icon="refresh-outline"
          variant="secondary"
          onPress={onRetry}
          style={styles.action}
        />
      )}
    </View>
  );
}

export function EmptyState({ icon = 'document-outline', emoji, title, message, action, style }) {
  return (
    <View style={[styles.centered, style]}>
      {emoji ? (
        <Text style={styles.emoji} accessibilityElementsHidden>
          {emoji}
        </Text>
      ) : (
        <Ionicons name={icon} size={44} color={COLORS.gray300} />
      )}
      <Text style={styles.title}>{title}</Text>
      {!!message && <Text style={styles.muted}>{message}</Text>}
      {action}
    </View>
  );
}

/**
 * A form-level error message. Uses role="alert" so it is announced the moment
 * it appears — otherwise a failed sign-in is completely silent to a screen
 * reader user, who cannot tell whether their tap registered.
 */
export function InlineError({ message, style }) {
  if (!message) return null;
  return (
    <View
      style={[styles.inlineError, style]}
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive"
    >
      <Ionicons name="alert-circle" size={17} color={COLORS.danger} />
      <Text style={styles.inlineErrorText}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
    gap: 10,
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.text,
    textAlign: 'center',
  },
  muted: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  emoji: { fontSize: 44 },
  action: { marginTop: 8, alignSelf: 'stretch' },
  skeleton: {
    backgroundColor: COLORS.gray200,
    borderRadius: 8,
    opacity: 0.7,
  },
  inlineError: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    backgroundColor: COLORS.dangerBg,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  inlineErrorText: {
    flex: 1,
    fontSize: 13.5,
    color: '#B91C1C',
    lineHeight: 19,
  },
});
