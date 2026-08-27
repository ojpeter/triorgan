import React, { useCallback, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, StatusBar,
  KeyboardAvoidingView, Platform, Pressable,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { login } from '../services/authService';
import { useAuth } from '../context/AuthContext';
import { COLORS } from '../constants/colors';
import { FormField } from '../components/ui/FormField';
import { AppButton } from '../components/ui/AppButton';
import { InlineError } from '../components/ui/StateViews';

export default function LoginScreen({ navigation }) {
  const { signIn } = useAuth();
  const insets = useSafeAreaInsets();
  const passwordRef = useRef(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  const submitting = useRef(false);

  const handleLogin = useCallback(async () => {
    if (submitting.current) return;
    submitting.current = true;

    setFormError(null);
    setFieldErrors({});
    setLoading(true);

    try {
      const result = await login({ email, password });
      if (result.ok) {
        signIn(result.user);
        // No navigation.replace: RootNavigator switches stacks when `user`
        // becomes non-null. Navigating here raced that switch.
        return;
      }
      if (result.field) setFieldErrors({ [result.field]: result.error });
      else setFormError(result.error);
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  }, [email, password, signIn]);

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar barStyle="light-content" />
      <LinearGradient
        colors={['#5B21B6', '#7C3AED', '#8B5CF6']}
        style={[styles.hero, { paddingTop: insets.top + 24 }]}
      >
        <View style={styles.brandRow}>
          <View style={styles.brandIcon} accessibilityElementsHidden>
            <Text style={styles.brandIconText}>H</Text>
          </View>
          <View>
            <Text style={styles.brandName}>HeLiK</Text>
            <Text style={styles.brandSub}>Health Early Warning System</Text>
          </View>
        </View>
        <Text style={styles.heroTitle} accessibilityRole="header">
          Welcome back 👋
        </Text>
        <Text style={styles.heroSub}>Sign in to access your health screenings</Text>
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
            placeholder="Enter your password"
            secureTextEntry
            isSecureVisible={showPassword}
            onToggleSecure={() => setShowPassword((v) => !v)}
            autoCapitalize="none"
            autoComplete="password"
            textContentType="password"
            returnKeyType="go"
            onSubmitEditing={handleLogin}
            editable={!loading}
          />

          <Pressable
            onPress={() => navigation.navigate('ForgotPassword')}
            accessibilityRole="button"
            accessibilityLabel="Forgot your password?"
            hitSlop={8}
            style={({ pressed }) => [styles.forgotRow, pressed && styles.pressed]}
          >
            <Text style={styles.forgotText}>Forgot password?</Text>
          </Pressable>

          <AppButton
            label="Sign in"
            busyLabel="Signing in…"
            icon="log-in-outline"
            busy={loading}
            onPress={handleLogin}
          />

          <View style={styles.dividerRow}>
            <View style={styles.divider} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.divider} />
          </View>

          <AppButton
            label="Browse health education as a guest"
            icon="book-outline"
            variant="secondary"
            onPress={() => navigation.navigate('MainApp')}
            accessibilityHint="You can read health information without an account"
          />
        </View>

        <View style={styles.registerRow}>
          <Text style={styles.registerLabel}>Don't have an account? </Text>
          <Pressable
            onPress={() => navigation.navigate('Register')}
            accessibilityRole="button"
            accessibilityLabel="Create an account"
            hitSlop={8}
          >
            <Text style={styles.registerLink}>Create account</Text>
          </Pressable>
        </View>

        <Text style={styles.legal}>
          By signing in you agree to our Terms of Service and Privacy Policy. Screening results
          are stored on your device; symptoms and photos you submit are sent to our AI provider
          to produce your analysis.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: COLORS.background },
  pressed: { opacity: 0.7 },
  hero: { paddingBottom: 46, paddingHorizontal: 24 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 26 },
  brandIcon: {
    width: 42, height: 42, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center', justifyContent: 'center',
  },
  brandIconText: { fontSize: 20, fontWeight: '900', color: '#FFFFFF' },
  brandName: { fontSize: 16, fontWeight: '800', color: '#FFFFFF' },
  brandSub: { fontSize: 11, color: 'rgba(255,255,255,0.8)', marginTop: 1 },
  heroTitle: { fontSize: 28, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.5, marginBottom: 6 },
  heroSub: { fontSize: 14, color: 'rgba(255,255,255,0.85)' },
  scroll: { flex: 1, marginTop: -24, borderTopLeftRadius: 28, borderTopRightRadius: 28 },
  scrollContent: { padding: 20, paddingBottom: 48 },
  card: {
    backgroundColor: COLORS.surface, borderRadius: 20, padding: 20,
    borderWidth: 1, borderColor: COLORS.border, marginBottom: 16, elevation: 3,
  },
  formError: { marginBottom: 16 },
  forgotRow: { alignSelf: 'flex-end', paddingVertical: 8, marginTop: -8, marginBottom: 12 },
  forgotText: { fontSize: 13.5, color: COLORS.primary, fontWeight: '700' },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 16 },
  divider: { flex: 1, height: 1, backgroundColor: COLORS.border },
  dividerText: { fontSize: 13, color: COLORS.textMuted, fontWeight: '500' },
  registerRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  registerLabel: { fontSize: 14, color: COLORS.textSecondary },
  registerLink: { fontSize: 14, color: COLORS.primary, fontWeight: '800' },
  legal: {
    fontSize: 11.5, color: COLORS.textMuted, textAlign: 'center',
    lineHeight: 17, paddingHorizontal: 8,
  },
});
