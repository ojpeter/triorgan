import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, StatusBar, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { useWallet } from '../context/WalletContext';
import AuthGateModal from '../components/AuthGateModal';
import { COLORS } from '../constants/colors';
import { ORGANS, SYMPTOMS } from '../constants/symptoms';
import { Skeleton } from '../components/ui/StateViews';

const HEALTH_TIPS = [
  { tip: 'Drink at least 8 glasses of water today — your kidneys will thank you.', icon: '💧' },
  { tip: 'A 30-minute walk reduces your heart disease risk by up to 35%.', icon: '🚶' },
  { tip: 'Eating garlic daily can lower blood pressure and protect your liver.', icon: '🧄' },
  { tip: 'Getting 7-9 hours of sleep reduces inflammation in all three organs.', icon: '😴' },
  { tip: 'Reducing alcohol intake is the single biggest thing you can do for your liver.', icon: '🚫' },
  { tip: 'Know your blood pressure — high BP silently damages kidneys and heart.', icon: '📊' },
];

const HOW_IT_WORKS = [
  { step: '1', icon: 'checkbox-outline', label: 'Select visible symptoms you observe on your body' },
  { step: '2', icon: 'camera-outline', label: 'Optionally add a photo for a closer analysis' },
  { step: '3', icon: 'analytics-outline', label: 'AI reviews your inputs and builds a health report' },
  { step: '4', icon: 'medical-outline', label: 'Follow the guidance and see a clinician if advised' },
];

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

export default function HomeScreen({ navigation }) {
  const { user } = useAuth();
  const { balanceScans, isReady: walletReady } = useWallet();
  const insets = useSafeAreaInsets();

  const [gateOrgan, setGateOrgan] = useState(null);

  // Derived from the date, not stored in state. Keeping it in state forced a
  // second render on every mount and always flashed the wrong tip first.
  const todayTip = useMemo(
    () => HEALTH_TIPS[new Date().getDate() % HEALTH_TIPS.length],
    []
  );

  const firstName = user?.fullName?.trim()?.split(' ')[0] || null;
  const initial = (firstName || user?.email || 'U').charAt(0).toUpperCase();

  const handleOrganPress = useCallback(
    (organ) => {
      if (!user) {
        setGateOrgan(organ);
        return;
      }
      navigation.navigate('Detection', { organId: organ.id });
    },
    [user, navigation]
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      <LinearGradient
        colors={['#5B21B6', '#7C3AED', '#8B5CF6']}
        style={[styles.header, { paddingTop: insets.top + 12 }]}
      >
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <Text style={styles.greeting}>
              {firstName ? `Hello, ${firstName} 👋` : `Good ${greeting()} 👋`}
            </Text>
            <Text style={styles.brand} accessibilityRole="header">
              HeLiK
            </Text>
            <Text style={styles.brandSub}>Health Early Warning System</Text>
          </View>
          <View style={styles.avatar} accessibilityElementsHidden>
            {user ? (
              <Text style={styles.avatarLetter}>{initial}</Text>
            ) : (
              <Ionicons name="person-outline" size={22} color="#FFFFFF" />
            )}
          </View>
        </View>

        {user ? (
          <View style={styles.creditsBadge} accessible
            accessibilityLabel={
              walletReady
                ? `${balanceScans} scan credit${balanceScans === 1 ? '' : 's'} remaining`
                : 'Loading your scan credits'
            }
          >
            <Ionicons name="wallet-outline" size={14} color="#FFFFFF" />
            {walletReady ? (
              <Text style={styles.creditsText}>
                {balanceScans} scan credit{balanceScans === 1 ? '' : 's'}
              </Text>
            ) : (
              <Skeleton width={72} height={11} />
            )}
          </View>
        ) : (
          <Pressable
            onPress={() => navigation.navigate('Login')}
            accessibilityRole="button"
            accessibilityLabel="Browsing as guest. Sign in to run screenings."
            style={({ pressed }) => [styles.guestBanner, pressed && styles.pressed]}
          >
            <Ionicons name="information-circle-outline" size={16} color="#FFFFFF" />
            <Text style={styles.guestBannerText}>
              Browsing as guest — sign in to run screenings
            </Text>
            <Text style={styles.guestBannerLink}>Sign in →</Text>
          </Pressable>
        )}

        <View style={styles.tipCard} accessible accessibilityLabel={`Tip of the day: ${todayTip.tip}`}>
          <Text style={styles.tipEmoji} accessibilityElementsHidden>
            {todayTip.icon}
          </Text>
          <View style={styles.tipContent}>
            <Text style={styles.tipLabel}>TIP OF THE DAY</Text>
            <Text style={styles.tipText}>{todayTip.tip}</Text>
          </View>
        </View>
      </LinearGradient>

      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <Text style={styles.sectionTitle} accessibilityRole="header">
          Select an organ to screen
        </Text>
        <Text style={styles.sectionSubtitle}>
          {user
            ? 'Take a quick assessment for early warning signs'
            : 'Sign in to run a full AI-powered screening'}
        </Text>

        {Object.values(ORGANS).map((organ) => (
          <OrganCard
            key={organ.id}
            organ={organ}
            locked={!user}
            signCount={SYMPTOMS[organ.id]?.length ?? 0}
            onPress={handleOrganPress}
          />
        ))}

        <View style={styles.howItWorks}>
          <Text style={styles.sectionTitle} accessibilityRole="header">
            How it works
          </Text>
          {HOW_IT_WORKS.map((item) => (
            <View key={item.step} style={styles.howStep} accessible
              accessibilityLabel={`Step ${item.step}. ${item.label}`}>
              <View style={styles.howStepNumber}>
                <Text style={styles.howStepNumberText}>{item.step}</Text>
              </View>
              <Ionicons name={item.icon} size={21} color={COLORS.primary} style={styles.howIcon} />
              <Text style={styles.howStepText}>{item.label}</Text>
            </View>
          ))}
        </View>

        <View style={styles.disclaimer} accessible>
          <Ionicons name="information-circle-outline" size={18} color={COLORS.textMuted} />
          <Text style={styles.disclaimerText}>
            HeLiK is a screening tool only. It does not diagnose disease. Always consult a
            qualified healthcare professional for proper medical evaluation.
          </Text>
        </View>
      </ScrollView>

      <AuthGateModal
        visible={!!gateOrgan}
        organName={gateOrgan?.name ?? ''}
        onClose={() => setGateOrgan(null)}
        onLogin={() => { setGateOrgan(null); navigation.navigate('Login'); }}
        onRegister={() => { setGateOrgan(null); navigation.navigate('Register'); }}
      />
    </View>
  );
}

const OrganCard = React.memo(function OrganCard({ organ, locked, signCount, onPress }) {
  return (
    <Pressable
      onPress={() => onPress(organ)}
      accessibilityRole="button"
      accessibilityLabel={`${organ.name} screening. ${organ.description} ${signCount} warning signs.`}
      accessibilityHint={locked ? 'Sign in required' : 'Opens the symptom checklist'}
      accessibilityState={{ disabled: false }}
      style={({ pressed }) => [styles.organWrapper, pressed && styles.pressed]}
    >
      <LinearGradient
        colors={organ.grad}
        style={styles.organCard}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        {locked && (
          <View style={styles.lockBadge} accessibilityElementsHidden>
            <Ionicons name="lock-closed" size={13} color="rgba(255,255,255,0.95)" />
          </View>
        )}
        <View style={styles.organLeft}>
          <Text style={styles.organEmoji} accessibilityElementsHidden>
            {organ.emoji}
          </Text>
          <Text style={styles.organName}>{organ.name}</Text>
          <Text style={styles.organTagline}>{organ.tagline}</Text>
          <Text style={styles.organDesc} numberOfLines={2}>
            {organ.description}
          </Text>
          <View style={styles.organMeta}>
            <Ionicons name="list-outline" size={13} color="rgba(255,255,255,0.85)" />
            <Text style={styles.organMetaText}>{signCount} warning signs</Text>
          </View>
        </View>
        <View style={styles.organAction}>
          <Text style={styles.organActionText}>{locked ? 'Sign in' : 'Screen'}</Text>
          <Ionicons
            name={locked ? 'lock-closed' : 'arrow-forward'}
            size={13}
            color={organ.color}
          />
        </View>
      </LinearGradient>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  pressed: { opacity: 0.85 },
  header: { paddingHorizontal: 20, paddingBottom: 0 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
  headerText: { flex: 1 },
  greeting: { fontSize: 13, color: 'rgba(255,255,255,0.85)', marginBottom: 4, fontWeight: '500' },
  brand: { fontSize: 26, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.5 },
  brandSub: { fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  avatar: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarLetter: { fontSize: 20, fontWeight: '800', color: '#FFFFFF' },
  creditsBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 99,
    paddingHorizontal: 12, paddingVertical: 7,
    alignSelf: 'flex-start', marginBottom: 12,
  },
  creditsText: { fontSize: 12, color: '#FFFFFF', fontWeight: '700' },
  guestBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 10,
    padding: 12, marginBottom: 12, minHeight: 48,
  },
  guestBannerText: { flex: 1, fontSize: 12, color: 'rgba(255,255,255,0.9)', fontWeight: '500' },
  guestBannerLink: { fontSize: 12, color: '#FFFFFF', fontWeight: '800' },
  tipCard: {
    flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.15)',
    borderTopLeftRadius: 14, borderTopRightRadius: 14,
    padding: 14, alignItems: 'center', gap: 12,
  },
  tipEmoji: { fontSize: 22 },
  tipContent: { flex: 1 },
  tipLabel: { fontSize: 9, fontWeight: '800', color: 'rgba(255,255,255,0.75)', letterSpacing: 1, marginBottom: 3 },
  tipText: { fontSize: 12.5, color: '#FFFFFF', lineHeight: 18 },
  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 110 },
  sectionTitle: { fontSize: 19, fontWeight: '800', color: COLORS.text, marginBottom: 4, letterSpacing: -0.3 },
  sectionSubtitle: { fontSize: 13.5, color: COLORS.textSecondary, marginBottom: 18 },
  organWrapper: {
    marginBottom: 14, borderRadius: 18,
    shadowColor: COLORS.shadow, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 1, shadowRadius: 16, elevation: 8,
  },
  organCard: {
    borderRadius: 18, padding: 20, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'space-between', minHeight: 130,
  },
  lockBadge: {
    position: 'absolute', top: 12, right: 12,
    backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 99, padding: 5,
  },
  organLeft: { flex: 1 },
  organEmoji: { fontSize: 28, marginBottom: 6 },
  organName: { fontSize: 22, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.4 },
  organTagline: { fontSize: 11, color: 'rgba(255,255,255,0.8)', fontWeight: '600', letterSpacing: 0.5, marginBottom: 6 },
  organDesc: { fontSize: 12, color: 'rgba(255,255,255,0.9)', lineHeight: 17, marginBottom: 10, maxWidth: '88%' },
  organMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  organMetaText: { fontSize: 11.5, color: 'rgba(255,255,255,0.85)', fontWeight: '500' },
  organAction: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#FFFFFF', paddingHorizontal: 14,
    minHeight: 40, borderRadius: 99, marginLeft: 10,
  },
  organActionText: { fontSize: 13, fontWeight: '700', color: COLORS.gray800 },
  howItWorks: {
    backgroundColor: COLORS.surface, borderRadius: 16, padding: 18,
    marginTop: 8, marginBottom: 14, borderWidth: 1, borderColor: COLORS.border,
  },
  howStep: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 12,
    borderBottomWidth: 1, borderBottomColor: COLORS.gray100,
  },
  howStepNumber: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: COLORS.primaryBg, alignItems: 'center', justifyContent: 'center',
  },
  howStepNumberText: { fontSize: 12, fontWeight: '700', color: COLORS.primary },
  howIcon: { width: 24 },
  howStepText: { flex: 1, fontSize: 13, color: COLORS.textSecondary, lineHeight: 18 },
  disclaimer: {
    flexDirection: 'row', gap: 8, padding: 14,
    backgroundColor: COLORS.gray50, borderRadius: 12,
    borderWidth: 1, borderColor: COLORS.border, alignItems: 'flex-start',
  },
  disclaimerText: { flex: 1, fontSize: 11.5, color: COLORS.textSecondary, lineHeight: 17 },
});
