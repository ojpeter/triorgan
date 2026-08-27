// ─────────────────────────────────────────────────────────────────────────────
// Shown when a guest reaches something that needs an account.
//
// Replaces the two near-identical modals (AuthGateModal + AuthPromptModal) that
// differed only in their heading text.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { View, Text, StyleSheet, Modal, Pressable, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../constants/colors';
import { AppButton } from './ui/AppButton';

const BENEFITS = [
  { icon: 'save-outline', text: 'Save and track your screening history' },
  { icon: 'analytics-outline', text: 'Get a personalised AI health analysis' },
  { icon: 'wallet-outline', text: 'Buy and manage scan credits' },
  { icon: 'notifications-outline', text: 'Receive health reminders and tips' },
];

export default function AuthGateModal({
  visible,
  onClose,
  onLogin,
  onRegister,
  /** e.g. "Heart" — used to name what the user was trying to do. */
  organName,
  /** e.g. "health screening" — used when there is no specific organ. */
  feature = 'this feature',
}) {
  const insets = useSafeAreaInsets();

  const description = organName
    ? `To run a ${organName} screening and save your results, you need a free Corvia account.`
    : `To use ${feature}, you need a free Corvia account. It takes less than a minute.`;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.backdrop}>
        {/* Tap-outside-to-dismiss, labelled so it is not a silent mystery
            target for a screen reader. */}
        <Pressable
          style={styles.backdropTouch}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
        />
        <View
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 20) + 12 }]}
          accessibilityViewIsModal
        >
          <View style={styles.handle} accessibilityElementsHidden />

          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <LinearGradient
              colors={[COLORS.primary, COLORS.primaryDark]}
              style={styles.iconCircle}
            >
              <Ionicons name="shield-checkmark-outline" size={30} color="#FFFFFF" />
            </LinearGradient>

            <Text style={styles.title} accessibilityRole="header">
              Account required
            </Text>
            <Text style={styles.subtitle}>{description}</Text>

            <View style={styles.benefits}>
              {BENEFITS.map((benefit) => (
                <View key={benefit.text} style={styles.benefit} accessible
                  accessibilityLabel={benefit.text}>
                  <View style={styles.benefitIcon}>
                    <Ionicons name={benefit.icon} size={15} color={COLORS.primary} />
                  </View>
                  <Text style={styles.benefitText}>{benefit.text}</Text>
                </View>
              ))}
            </View>

            <AppButton
              label="Create free account"
              icon="person-add-outline"
              onPress={onRegister}
              style={styles.action}
            />
            <AppButton
              label="I already have an account"
              variant="secondary"
              onPress={onLogin}
              style={styles.action}
            />
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Maybe later"
              hitSlop={10}
              style={({ pressed }) => [styles.later, pressed && styles.pressed]}
            >
              <Text style={styles.laterText}>Maybe later</Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(17,24,39,0.5)', justifyContent: 'flex-end' },
  backdropTouch: { flex: 1 },
  sheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 12,
    maxHeight: '88%',
  },
  handle: {
    width: 40, height: 4, borderRadius: 99,
    backgroundColor: COLORS.gray200, alignSelf: 'center', marginBottom: 16,
  },
  content: { paddingHorizontal: 24, alignItems: 'center' },
  iconCircle: {
    width: 64, height: 64, borderRadius: 32,
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  title: {
    fontSize: 21, fontWeight: '800', color: COLORS.text,
    marginBottom: 8, textAlign: 'center', letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 14.5, color: COLORS.textSecondary,
    textAlign: 'center', lineHeight: 21, marginBottom: 20,
  },
  benefits: { width: '100%', gap: 10, marginBottom: 22 },
  benefit: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  benefitIcon: {
    width: 32, height: 32, borderRadius: 8,
    backgroundColor: COLORS.primaryBg, alignItems: 'center', justifyContent: 'center',
  },
  benefitText: { flex: 1, fontSize: 13.5, color: COLORS.gray700 },
  action: { alignSelf: 'stretch', marginBottom: 10 },
  later: { paddingVertical: 12, minHeight: 44, justifyContent: 'center' },
  laterText: { fontSize: 13.5, color: COLORS.textMuted, fontWeight: '600' },
  pressed: { opacity: 0.7 },
});
