// ─────────────────────────────────────────────────────────────────────────────
// Labelled text input.
//
// React Native has no htmlFor, so a <Text> label sitting next to a <TextInput>
// is invisible to assistive tech — a screen reader would announce only the
// placeholder. The label is bound explicitly here, along with error state and
// required-ness, so every form in the app gets it right by construction.
// ─────────────────────────────────────────────────────────────────────────────

import React, { forwardRef, useId } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants/colors';
import { IconButton } from './AppButton';

export const FormField = forwardRef(function FormField(
  {
    label,
    icon,
    error,
    hint,
    required = false,
    value,
    onChangeText,
    secureTextEntry = false,
    onToggleSecure,
    isSecureVisible = false,
    ...inputProps
  },
  ref
) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  return (
    <View style={styles.wrap}>
      <Text style={styles.label} nativeID={`${id}-label`} maxFontSizeMultiplier={1.8}>
        {label}
        {required && <Text style={styles.required}> *</Text>}
      </Text>

      <View style={[styles.box, !!error && styles.boxError]}>
        {icon && <Ionicons name={icon} size={17} color={COLORS.textMuted} style={styles.icon} />}
        <TextInput
          ref={ref}
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          placeholderTextColor={COLORS.textMuted}
          secureTextEntry={secureTextEntry && !isSecureVisible}
          accessibilityLabel={`${label}${required ? ', required' : ''}`}
          accessibilityHint={hint}
          accessibilityLabelledBy={`${id}-label`}
          aria-describedby={describedBy}
          aria-invalid={!!error}
          maxFontSizeMultiplier={1.8}
          {...inputProps}
        />
        {onToggleSecure && (
          <IconButton
            icon={isSecureVisible ? 'eye-off-outline' : 'eye-outline'}
            label={isSecureVisible ? 'Hide password' : 'Show password'}
            onPress={onToggleSecure}
            size={19}
            color={COLORS.textMuted}
            background="transparent"
            style={styles.eye}
          />
        )}
      </View>

      {!!error && (
        <Text
          nativeID={`${id}-error`}
          style={styles.errorText}
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
        >
          {error}
        </Text>
      )}
      {!error && !!hint && (
        <Text nativeID={`${id}-hint`} style={styles.hintText}>
          {hint}
        </Text>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { marginBottom: 16 },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.gray600,
    marginBottom: 7,
    letterSpacing: 0.2,
  },
  required: { color: COLORS.danger },
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.gray50,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    minHeight: 52,
  },
  boxError: { borderColor: COLORS.danger, backgroundColor: COLORS.dangerBg },
  icon: { marginRight: 8 },
  input: { flex: 1, fontSize: 15, color: COLORS.text, paddingVertical: 12 },
  eye: { width: 40, height: 40, borderRadius: 20 },
  errorText: { fontSize: 12.5, color: COLORS.danger, marginTop: 6, fontWeight: '600' },
  hintText: { fontSize: 12.5, color: COLORS.textMuted, marginTop: 6 },
});
