// ─────────────────────────────────────────────────────────────────────────────
// Buttons.
//
// Accessibility rules baked in so no call site can forget them:
//  · minimum 48dp touch target (Material) / 44pt (iOS HIG)
//  · accessibilityRole="button" and a real label
//  · disabled and busy states exposed to assistive tech, not just visually
//  · an icon-only button REQUIRES a label — it throws in development otherwise
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Text, StyleSheet, ActivityIndicator, View, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants/colors';

/** Smallest comfortable target size. Do not go below this. */
export const MIN_TOUCH_TARGET = 48;

export function AppButton({
  label,
  onPress,
  variant = 'primary',
  icon,
  busy = false,
  busyLabel,
  disabled = false,
  gradient,
  style,
  accessibilityHint,
  testID,
}) {
  const isDisabled = disabled || busy;
  const content = busy ? busyLabel ?? label : label;

  const inner = (
    <View style={styles.row}>
      {busy ? (
        <ActivityIndicator
          size="small"
          color={variant === 'primary' ? '#FFFFFF' : COLORS.primary}
        />
      ) : (
        icon && (
          <Ionicons
            name={icon}
            size={19}
            color={variant === 'primary' ? '#FFFFFF' : COLORS.primary}
          />
        )
      )}
      <Text
        style={[
          styles.label,
          variant !== 'primary' && styles.labelSecondary,
          variant === 'danger' && styles.labelDanger,
        ]}
        // Let the label shrink rather than truncate when the user has scaled
        // their system font up.
        numberOfLines={2}
        maxFontSizeMultiplier={1.6}
      >
        {content}
      </Text>
    </View>
  );

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={content}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: isDisabled, busy }}
      testID={testID}
      style={({ pressed }) => [
        styles.base,
        variant === 'secondary' && styles.secondary,
        variant === 'danger' && styles.danger,
        pressed && !isDisabled && styles.pressed,
        isDisabled && styles.disabled,
        style,
      ]}
    >
      {variant === 'primary' ? (
        <LinearGradient
          colors={gradient ?? [COLORS.primary, COLORS.primaryDark]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.gradient}
        >
          {inner}
        </LinearGradient>
      ) : (
        <View style={styles.gradient}>{inner}</View>
      )}
    </Pressable>
  );
}

/**
 * Icon-only control. `label` is what a screen reader announces and is required —
 * an unlabelled icon button is silent to a blind user.
 */
export function IconButton({
  icon,
  label,
  onPress,
  size = 22,
  color = '#FFFFFF',
  background = 'rgba(255,255,255,0.2)',
  accessibilityHint,
  style,
  testID,
}) {
  if (__DEV__ && !label) {
    throw new Error('IconButton requires a `label` for screen readers.');
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      testID={testID}
      // Expands the tappable area without changing the visual size.
      hitSlop={8}
      style={({ pressed }) => [
        styles.iconButton,
        { backgroundColor: background },
        pressed && styles.pressed,
        style,
      ]}
    >
      <Ionicons name={icon} size={size} color={color} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: 14,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  gradient: {
    flex: 1,
    minHeight: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  secondary: {
    borderWidth: 1.5,
    borderColor: COLORS.primaryBorder,
    backgroundColor: COLORS.primaryBg,
  },
  danger: {
    borderWidth: 1.5,
    borderColor: '#FECACA',
    backgroundColor: COLORS.dangerBg,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { fontSize: 16, fontWeight: '700', color: '#FFFFFF', textAlign: 'center' },
  labelSecondary: { color: COLORS.primary },
  labelDanger: { color: COLORS.danger },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.5 },
  iconButton: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    borderRadius: MIN_TOUCH_TARGET / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
