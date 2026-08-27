import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, StatusBar,
  KeyboardAvoidingView, Platform, Pressable,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { register, PASSWORD_MIN_LENGTH } from '../services/authService';
import { useAuth } from '../context/AuthContext';
import { COLORS } from '../constants/colors';
import { FormField } from '../components/ui/FormField';
import { AppButton, IconButton } from '../components/ui/AppButton';
import { InlineError } from '../components/ui/StateViews';

/** Cheap, honest strength signal. Not a security control — the server is. */
function passwordStrength(password) {
  if (!password) return { score: 0, label: '', color: COLORS.gray300 };
  let score = 0;
  if (password.length >= PASSWORD_MIN_LENGTH) score += 1;
  if (password.length >= 12) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;

  if (score <= 1) return { score: 1, label: 'Weak', color: COLORS.danger };
  if (score <= 3) return { score: 2, label: 'Fair', color: COLORS.warning };
  if (score === 4) return { score: 3, label: 'Good', color: COLORS.info };
  return { score: 4, label: 'Strong', color: COLORS.success };
}

export default function RegisterScreen({ navigation }) {
  const { signIn } = useAuth();
  const insets = useSafeAreaInsets();

  const emailRef = useRef(null);
  const phoneRef = useRef(null);
  const passwordRef = useRef(null);
  const confirmRef = useRef(null);
  const submitting = useRef(false);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  const strength = useMemo(() => passwordStrength(password), [password]);

  const handleRegister = useCallback(async () => {
    if (submitting.current) return;

    setFormError(null);
    setFieldErrors({});

    if (password !== confirm) {
      setFieldErrors({ confirm: 'The two passwords do not match.' });
      confirmRef.current?.focus();
      return;
    }

    submitting.current = true;
    setLoading(true);
    try {
      const result = await register({ fullName, email, phone, password });
      // NOTE: the previous version logged the whole result here, which put the
      // access token into logcat where any app with READ_LOGS could read it.
      if (result.ok) {
        signIn(result.user);
        return;
      }
      if (result.field) setFieldErrors({ [result.field]: result.error });
      else setFormError(result.error);
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  }, [fullName, email, phone, password, confirm, signIn]);

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
          Create account 🎉
        </Text>
        <Text style={styles.heroSub}>Join HeLiK and take control of your health</Text>
      </LinearGradient>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <InlineError message={formError} style={styles.formError} />

          <FormField
            label="Full name"
            icon="person-outline"
            required
            value={fullName}
            onChangeText={setFullName}
            error={fieldErrors.fullName}
            placeholder="e.g. Amara Nakato"
            autoCapitalize="words"
            autoComplete="name"
            textContentType="name"
            returnKeyType="next"
            onSubmitEditing={() => emailRef.current?.focus()}
            editable={!loading}
          />

          <FormField
            ref={emailRef}
            label="Email address"
            icon="mail-outline"
            required
            value={email}
            onChangeText={setEmail}
            error={fieldErrors.email}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="emailAddress"
            returnKeyType="next"
            onSubmitEditing={() => phoneRef.current?.focus()}
            editable={!loading}
          />

          <FormField
            ref={phoneRef}
            label="Phone number"
            icon="call-outline"
            value={phone}
            onChangeText={setPhone}
            error={fieldErrors.phone}
            hint="Optional — used for mobile money payments"
            placeholder="07XX XXX XXX"
            keyboardType="phone-pad"
            autoComplete="tel"
            textContentType="telephoneNumber"
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
            editable={!loading}
          />

          <FormField
            ref={passwordRef}
            label="Password"
            icon="lock-closed-outline"
            required
            value={password}
            onChangeText={setPassword}
            error={fieldErrors.password}
            hint={`At least ${PASSWORD_MIN_LENGTH} characters`}
            placeholder="Create a password"
            secureTextEntry
            isSecureVisible={showPassword}
            onToggleSecure={() => setShowPassword((v) => !v)}
            autoCapitalize="none"
            autoComplete="new-password"
            textContentType="newPassword"
            returnKeyType="next"
            onSubmitEditing={() => confirmRef.current?.focus()}
            editable={!loading}
          />

          {!!password && (
            <View
              style={styles.strengthRow}
              accessibilityLiveRegion="polite"
              accessibilityLabel={`Password strength: ${strength.label}`}
            >
              <View style={styles.strengthBars}>
                {[1, 2, 3, 4].map((i) => (
                  <View
                    key={i}
                    style={[
                      styles.strengthBar,
                      i <= strength.score && { backgroundColor: strength.color },
                    ]}
                  />
                ))}
              </View>
              <Text style={[styles.strengthLabel, { color: strength.color }]}>
                {strength.label}
              </Text>
            </View>
          )}

          <FormField
            ref={confirmRef}
            label="Confirm password"
            icon="lock-closed-outline"
            required
            value={confirm}
            onChangeText={setConfirm}
            error={fieldErrors.confirm}
            placeholder="Re-enter your password"
            secureTextEntry
            isSecureVisible={showPassword}
            autoCapitalize="none"
            autoComplete="new-password"
            textContentType="newPassword"
            returnKeyType="go"
            onSubmitEditing={handleRegister}
            editable={!loading}
          />

          <AppButton
            label="Create account"
            busyLabel="Creating your account…"
            icon="person-add-outline"
            busy={loading}
            onPress={handleRegister}
          />
        </View>

        <View style={styles.privacyNote}>
          <Ionicons name="shield-checkmark-outline" size={16} color={COLORS.primary} />
          <Text style={styles.privacyText}>
            Screening results are stored on your device. The symptoms you select and any photo
            you attach are sent securely to our AI provider to produce your analysis.
          </Text>
        </View>

        <View style={styles.loginRow}>
          <Text style={styles.loginLabel}>Already have an account? </Text>
          <Pressable
            onPress={() => navigation.navigate('Login')}
            accessibilityRole="button"
            accessibilityLabel="Sign in"
            hitSlop={8}
          >
            <Text style={styles.loginLink}>Sign in</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: COLORS.background },
  hero: { paddingBottom: 40, paddingHorizontal: 20 },
  backBtn: { marginBottom: 10, marginLeft: -12 },
  heroTitle: { fontSize: 26, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.5, marginBottom: 6 },
  heroSub: { fontSize: 14, color: 'rgba(255,255,255,0.85)' },
  scroll: { flex: 1, marginTop: -24, borderTopLeftRadius: 28, borderTopRightRadius: 28 },
  scrollContent: { padding: 20, paddingBottom: 48 },
  card: {
    backgroundColor: COLORS.surface, borderRadius: 20, padding: 20,
    borderWidth: 1, borderColor: COLORS.border, marginBottom: 16, elevation: 3,
  },
  formError: { marginBottom: 16 },
  strengthRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: -8, marginBottom: 16 },
  strengthBars: { flexDirection: 'row', gap: 4, flex: 1 },
  strengthBar: { flex: 1, height: 4, borderRadius: 2, backgroundColor: COLORS.gray200 },
  strengthLabel: { fontSize: 11.5, fontWeight: '800', minWidth: 46, textAlign: 'right' },
  privacyNote: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
    backgroundColor: COLORS.primaryBg, borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: COLORS.primaryBorder, marginBottom: 16,
  },
  privacyText: { flex: 1, fontSize: 12, color: COLORS.gray700, lineHeight: 18 },
  loginRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  loginLabel: { fontSize: 14, color: COLORS.textSecondary },
  loginLink: { fontSize: 14, color: COLORS.primary, fontWeight: '800' },
});
