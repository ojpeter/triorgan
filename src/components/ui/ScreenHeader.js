// ─────────────────────────────────────────────────────────────────────────────
// Gradient screen header.
//
// Every screen previously hardcoded `paddingTop: 55` to clear the status bar.
// That is right on exactly one device: it clips content under the notch on a
// Pixel/iPhone with a taller inset, and leaves a dead band on devices with a
// short one. react-native-safe-area-context was already a dependency and unused
// — this uses the real inset instead.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../../constants/colors';
import { IconButton } from './AppButton';

export function ScreenHeader({
  title,
  subtitle,
  colors = [COLORS.primaryDark, COLORS.primary],
  onBack,
  backLabel = 'Go back',
  right,
  children,
  compact = false,
  style,
}) {
  const insets = useSafeAreaInsets();

  return (
    <LinearGradient
      colors={colors}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[
        styles.header,
        // 12dp of breathing room below the real system inset.
        { paddingTop: insets.top + 12 },
        compact && styles.compact,
        style,
      ]}
    >
      <View style={styles.topRow}>
        {onBack ? (
          <IconButton icon="chevron-back" label={backLabel} onPress={onBack} size={24} />
        ) : (
          <View style={styles.spacer} />
        )}
        <View style={styles.titleBlock}>
          {!!title && (
            // role="header" lets screen-reader users jump between sections.
            <Text
              style={styles.title}
              accessibilityRole="header"
              maxFontSizeMultiplier={1.5}
              numberOfLines={2}
            >
              {title}
            </Text>
          )}
          {!!subtitle && (
            <Text style={styles.subtitle} maxFontSizeMultiplier={1.6} numberOfLines={2}>
              {subtitle}
            </Text>
          )}
        </View>
        {right ?? <View style={styles.spacer} />}
      </View>
      {children}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  header: { paddingBottom: 20, paddingHorizontal: 16 },
  compact: { paddingBottom: 14 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  spacer: { width: 48 },
  titleBlock: { flex: 1 },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.4,
  },
  subtitle: {
    fontSize: 12.5,
    // 0.85 alpha on these purple gradients keeps contrast above WCAG AA for
    // small text; the previous 0.7 did not.
    color: 'rgba(255,255,255,0.85)',
    marginTop: 3,
    fontWeight: '500',
  },
});
