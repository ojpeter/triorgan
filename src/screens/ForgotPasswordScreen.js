import React, { useCallback, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, StatusBar,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { requestPasswordReset } from '../services/authService';
import { COLORS } from '../constants/colors';
import { FormField } from '../components/ui/FormField';
import { AppButton, IconButton } from '../components/ui/AppButton';

export default function ForgotPasswordScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const submitting = useRef(false);

  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [fieldError, setFieldError] = useState(null);
  const [sent, setSent] = useState(false);

  const handleSubmit = useCallback(async () => {
    if (submitting.current) return;
    submitting.current = true;
    setFieldError(null);
    setLoading(true);

    try {
      const result = await requestPasswordReset(email);
      if (result.ok) setSent(true);
      else setFieldError(result.error);
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  }, [email]);

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar barStyle="light-content" />
      <LinearGradient
        colors={['#5B21B6', '#7C3AED']}
        style={[styles.hero, { paddingTop: insets.top + 8 }]}
      >
        <IconButton
          icon="chevron-back"
          label="Go back"
          onPress={() => navigation.goBack()}
          size={22}
          style={styles.backBtn}
        />
        <Text style={styles.heroTitle} accessibilityRole="header">
          Forgot password 🔑
        </Text>
        <Text style={styles.heroSub}>
          Enter your email and we'll send you a reset link
        </Text>
      </LinearGradient>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {sent ? (
          <View style={styles.card} accessibilityLiveRegion="assertive">
            <View style={styles.successIcon}>
              <Ionicons name="mail-open-outline" size={44} color={COLORS.success} />
            </View>
            <Text style={styles.successTitle} accessibilityRole="header">
              Check your email
            </Text>
            {/* Deliberately does not confirm whether an account exists — that
                would turn this form into an account-enumeration oracle. */}
            <Text style={styles.successMessage}>
              If an account exists for{' '}
              <Text style={styles.emailHighlight}>{email.trim().toLowerCase()}</Text>, we've sent
              a password reset link. It expires in 30 minutes.
            </Text>
            <Text style={styles.successHint}>
              Not seeing it? Check your spam folder before requesting another.
            </Text>
            <AppButton
              label="Back to sign in"
              icon="arrow-back-outline"
              onPress={() => navigation.navigate('Login')}
              style={styles.action}
            />
            <AppButton
              label="Use a different email"
              variant="secondary"
              onPress={() => {
                setSent(false);
                setEmail('');
              }}
              style={styles.action}
            />
          </View>
        ) : (
          <View style={styles.card}>
            <FormField
              label="Email address"
              icon="mail-outline"
              required
              value={email}
              onChangeText={setEmail}
              error={fieldError}
              placeholder="you@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="emailAddress"
              returnKeyType="send"
              onSubmitEditing={handleSubmit}
              editable={!loading}
              autoFocus
            />
            <AppButton
              label="Send reset link"
              busyLabel="Sending…"
              icon="paper-plane-outline"
              busy={loading}
              onPress={handleSubmit}
            />
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: COLORS.background },
  hero: { paddingBottom: 44, paddingHorizontal: 20 },
  backBtn: { marginBottom: 10, marginLeft: -12 },
  heroTitle: { fontSize: 26, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.5, marginBottom: 6 },
  heroSub: { fontSize: 14, color: 'rgba(255,255,255,0.85)' },
  scroll: { flex: 1, marginTop: -24, borderTopLeftRadius: 28, borderTopRightRadius: 28 },
  scrollContent: { padding: 20, paddingBottom: 48 },
  card: {
    backgroundColor: COLORS.surface, borderRadius: 20, padding: 20,
    borderWidth: 1, borderColor: COLORS.border, elevation: 3, gap: 4,
  },
  successIcon: { alignItems: 'center', marginBottom: 8 },
  successTitle: { fontSize: 20, fontWeight: '800', color: COLORS.text, textAlign: 'center' },
  successMessage: {
    fontSize: 14, color: COLORS.textSecondary, textAlign: 'center',
    lineHeight: 21, marginTop: 8,
  },
  emailHighlight: { fontWeight: '700', color: COLORS.text },
  successHint: {
    fontSize: 12.5, color: COLORS.textMuted, textAlign: 'center',
    lineHeight: 18, marginTop: 10, marginBottom: 6,
  },
  action: { marginTop: 8 },
});
