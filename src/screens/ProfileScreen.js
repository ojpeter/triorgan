import React, { useCallback, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, StatusBar, Alert, Switch, Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { useWallet } from '../context/WalletContext';
import { COLORS } from '../constants/colors';
import { ORGANS } from '../constants/symptoms';
import { getHistory, clearHistory } from '../services/historyService';
import { formatDateTime, formatUGX } from '../constants/payments';
import PaymentModal from '../components/PaymentModal';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { AppButton } from '../components/ui/AppButton';
import { EmptyState, Skeleton } from '../components/ui/StateViews';

const APP_VERSION = '1.0.0';

export default function ProfileScreen({ navigation }) {
  const { user, logout } = useAuth();
  const { wallet, balanceScans, isReady: walletReady, refresh, applyWallet } = useWallet();

  const [history, setHistory] = useState([]);
  const [notifications, setNotifications] = useState(true);
  const [paymentModal, setPaymentModal] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const load = useCallback(async () => {
    setHistory(await getHistory());
    if (user) refresh();
  }, [user, refresh]);

  useFocusEffect(
    // `user` and `refresh` are real dependencies. The previous version passed
    // an empty array, so this closure captured `user` on first mount — after
    // signing in, credits and transactions never loaded, and after switching
    // accounts it kept showing the previous user's data.
    useCallback(() => {
      load();
    }, [load])
  );

  const handleSignOut = useCallback(() => {
    Alert.alert('Sign out?', 'You can sign back in at any time.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          setSigningOut(true);
          try {
            await logout();
          } finally {
            setSigningOut(false);
          }
          // No navigation call: RootNavigator swaps to the signed-out stack as
          // soon as `user` becomes null. Navigating here raced that swap.
        },
      },
    ]);
  }, [logout]);

  const handleClearHistory = useCallback(() => {
    Alert.alert(
      'Delete all health data?',
      'This permanently removes every saved screening from this device. It cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete all',
          style: 'destructive',
          onPress: async () => {
            await clearHistory();
            setHistory([]);
          },
        },
      ]
    );
  }, []);

  const stats = useMemo(() => {
    const byOrgan = {};
    for (const id of Object.keys(ORGANS)) {
      byOrgan[id] = history.filter((h) => h.organId === id).length;
    }
    return {
      total: history.length,
      byOrgan,
      highRisk: history.filter((h) => h.riskLevel === 'HIGH' || h.riskLevel === 'CRITICAL').length,
      lastScan: history[0] ?? null,
    };
  }, [history]);

  if (!user) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" />
        <ScreenHeader title="Profile" subtitle="Manage your account" colors={['#4C1D95', '#7C3AED']} />
        <ScrollView contentContainerStyle={styles.guestContent}>
          <EmptyState
            icon="person-circle-outline"
            title="You're browsing as a guest"
            message="Create a free account to save your screening history and track your health over time."
          />
          {[
            { icon: 'save-outline', text: 'Save unlimited screening history' },
            { icon: 'analytics-outline', text: 'Track your organ health over time' },
            { icon: 'wallet-outline', text: 'Buy and manage scan credits' },
            { icon: 'notifications-outline', text: 'Health reminders and tips' },
          ].map((benefit) => (
            <View key={benefit.text} style={styles.benefitRow} accessible
              accessibilityLabel={benefit.text}>
              <View style={styles.benefitIcon}>
                <Ionicons name={benefit.icon} size={18} color={COLORS.primary} />
              </View>
              <Text style={styles.benefitText}>{benefit.text}</Text>
            </View>
          ))}
          <AppButton
            label="Create free account"
            icon="person-add-outline"
            onPress={() => navigation.navigate('Register')}
            style={styles.guestAction}
          />
          <AppButton
            label="I already have an account"
            variant="secondary"
            onPress={() => navigation.navigate('Login')}
            style={styles.guestAction}
          />
          <AppInfo />
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      <PaymentModal
        visible={paymentModal}
        onClose={() => setPaymentModal(false)}
        onSuccess={applyWallet}
        organName={null}
      />

      <ScreenHeader title="Profile" colors={['#4C1D95', '#7C3AED', '#8B5CF6']}>
        <View style={styles.identity}>
          <View style={styles.avatar} accessibilityElementsHidden>
            <Text style={styles.avatarText}>
              {(user.fullName || user.email || 'U').charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={styles.identityText} accessible
            accessibilityLabel={`Signed in as ${user.fullName || user.email}`}>
            <Text style={styles.userName} numberOfLines={1}>
              {user.fullName || 'Your account'}
            </Text>
            <Text style={styles.userEmail} numberOfLines={1}>
              {user.email}
            </Text>
            {!!user.phone && <Text style={styles.userPhone}>{user.phone}</Text>}
          </View>
        </View>
        {!!user.createdAt && (
          <Text style={styles.memberSince}>
            Member since{' '}
            {new Date(user.createdAt).toLocaleDateString('en-UG', {
              month: 'long',
              year: 'numeric',
            })}
          </Text>
        )}
      </ScreenHeader>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.walletCard}>
          <View style={styles.walletLeft}>
            <Ionicons name="wallet-outline" size={22} color={COLORS.primary} />
            <View style={styles.walletText}>
              <Text style={styles.walletLabel}>Scan credits</Text>
              {walletReady ? (
                <Text style={styles.walletValue}>
                  {balanceScans} credit{balanceScans === 1 ? '' : 's'} remaining
                </Text>
              ) : (
                <Skeleton width={130} height={13} style={styles.walletSkeleton} />
              )}
            </View>
          </View>
          <AppButton
            label="Top up"
            variant="secondary"
            onPress={() => setPaymentModal(true)}
            style={styles.topUpBtn}
          />
        </View>

        <Text style={styles.sectionTitle} accessibilityRole="header">
          Your screenings
        </Text>
        <View style={styles.statsGrid}>
          <StatTile label="Total" value={stats.total} icon="documents-outline" />
          <StatTile label="Needs attention" value={stats.highRisk} icon="alert-circle-outline" />
          <StatTile
            label="Spent"
            value={walletReady ? formatUGX(wallet?.totalSpentUgx ?? 0) : null}
            icon="cash-outline"
          />
        </View>

        {stats.total === 0 ? (
          <EmptyState
            emoji="📋"
            title="No screenings yet"
            message="Run your first screening from the Home tab."
            style={styles.emptyHistory}
          />
        ) : (
          <View style={styles.organBreakdown}>
            {Object.values(ORGANS).map((organ) => (
              <View key={organ.id} style={styles.organRow} accessible
                accessibilityLabel={`${stats.byOrgan[organ.id]} ${organ.name} screenings`}>
                <Text style={styles.organEmoji} accessibilityElementsHidden>
                  {organ.emoji}
                </Text>
                <Text style={styles.organName}>{organ.name}</Text>
                <Text style={styles.organCount}>{stats.byOrgan[organ.id]}</Text>
              </View>
            ))}
            {!!stats.lastScan && (
              <Text style={styles.lastScanText}>
                Last screening: {formatDateTime(stats.lastScan.date)}
              </Text>
            )}
          </View>
        )}

        <Text style={styles.sectionTitle} accessibilityRole="header">
          Settings
        </Text>
        <View style={styles.settingsCard}>
          <View style={styles.settingRow}>
            <Ionicons name="notifications-outline" size={20} color={COLORS.textSecondary} />
            <Text style={styles.settingLabel}>Health reminders</Text>
            <Switch
              value={notifications}
              onValueChange={setNotifications}
              accessibilityLabel="Health reminders"
              accessibilityHint="Turn reminder notifications on or off"
              trackColor={{ true: COLORS.primaryLight, false: COLORS.gray300 }}
              thumbColor="#FFFFFF"
            />
          </View>
          <Pressable
            onPress={() => navigation.navigate('HistoryTab')}
            accessibilityRole="button"
            accessibilityLabel="View full screening history"
            style={({ pressed }) => [styles.settingRow, pressed && styles.pressed]}
          >
            <Ionicons name="time-outline" size={20} color={COLORS.textSecondary} />
            <Text style={styles.settingLabel}>Screening history</Text>
            <Ionicons name="chevron-forward" size={18} color={COLORS.gray300} />
          </Pressable>
        </View>

        <Text style={styles.sectionTitle} accessibilityRole="header">
          Your data
        </Text>
        <View style={styles.privacyCard}>
          <Ionicons name="shield-checkmark-outline" size={18} color={COLORS.primary} />
          <Text style={styles.privacyText}>
            Screening results are stored on this device. To analyse a screening, the symptoms you
            select and any photo you attach are sent securely to our AI provider. Deleting your
            history removes it from this device.
          </Text>
        </View>

        <View style={styles.dangerZone}>
          <AppButton
            label="Delete all health data"
            icon="trash-outline"
            variant="danger"
            onPress={handleClearHistory}
            accessibilityHint="Permanently deletes your screening history from this device"
          />
          <AppButton
            label="Sign out"
            icon="log-out-outline"
            variant="secondary"
            busy={signingOut}
            busyLabel="Signing out…"
            onPress={handleSignOut}
          />
        </View>

        <AppInfo />
      </ScrollView>
    </View>
  );
}

function StatTile({ label, value, icon }) {
  return (
    <View style={styles.statTile} accessible accessibilityLabel={`${label}: ${value ?? 'loading'}`}>
      <Ionicons name={icon} size={18} color={COLORS.primary} />
      {value === null ? (
        <Skeleton width={40} height={18} />
      ) : (
        <Text style={styles.statValue} numberOfLines={1}>
          {value}
        </Text>
      )}
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function AppInfo() {
  return (
    <View style={styles.appInfo}>
      <Text style={styles.appName}>HeLiK by GOMO Technologies</Text>
      <Text style={styles.appVersion}>Version {APP_VERSION}</Text>
      <Text style={styles.appDisclaimer}>
        A screening tool only. It does not diagnose disease. Always consult a qualified
        healthcare professional.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  pressed: { opacity: 0.7 },
  scrollContent: { padding: 16, paddingBottom: 110, gap: 12 },
  guestContent: { padding: 20, paddingBottom: 110, gap: 10 },

  identity: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14 },
  avatar: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 24, fontWeight: '800', color: '#FFFFFF' },
  identityText: { flex: 1 },
  userName: { fontSize: 18, fontWeight: '800', color: '#FFFFFF' },
  userEmail: { fontSize: 12.5, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
  userPhone: { fontSize: 12, color: 'rgba(255,255,255,0.75)', marginTop: 1 },
  memberSince: { fontSize: 11.5, color: 'rgba(255,255,255,0.75)', marginTop: 12 },

  walletCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: COLORS.surface, borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: COLORS.border, gap: 12,
  },
  walletLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  walletText: { flex: 1 },
  walletLabel: { fontSize: 12, color: COLORS.textMuted, fontWeight: '600' },
  walletValue: { fontSize: 14.5, fontWeight: '700', color: COLORS.text, marginTop: 2 },
  walletSkeleton: { marginTop: 4 },
  topUpBtn: { paddingHorizontal: 4 },

  sectionTitle: { fontSize: 16, fontWeight: '800', color: COLORS.text, marginTop: 6 },
  statsGrid: { flexDirection: 'row', gap: 10 },
  statTile: {
    flex: 1, backgroundColor: COLORS.surface, borderRadius: 14,
    padding: 14, alignItems: 'center', gap: 5,
    borderWidth: 1, borderColor: COLORS.border,
  },
  statValue: { fontSize: 17, fontWeight: '900', color: COLORS.text },
  statLabel: { fontSize: 10.5, color: COLORS.textMuted, textAlign: 'center' },
  emptyHistory: { paddingVertical: 20 },

  organBreakdown: {
    backgroundColor: COLORS.surface, borderRadius: 14, padding: 6,
    borderWidth: 1, borderColor: COLORS.border,
  },
  organRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, paddingHorizontal: 10,
  },
  organEmoji: { fontSize: 20 },
  organName: { flex: 1, fontSize: 14, color: COLORS.text, fontWeight: '600' },
  organCount: { fontSize: 15, fontWeight: '800', color: COLORS.primary },
  lastScanText: { fontSize: 11.5, color: COLORS.textMuted, padding: 10, paddingTop: 4 },

  settingsCard: {
    backgroundColor: COLORS.surface, borderRadius: 14,
    borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden',
  },
  settingRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 14, minHeight: 56,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border,
  },
  settingLabel: { flex: 1, fontSize: 14, color: COLORS.text, fontWeight: '600' },

  privacyCard: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
    backgroundColor: COLORS.primaryBg, borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: COLORS.primaryBorder,
  },
  privacyText: { flex: 1, fontSize: 12, color: COLORS.gray700, lineHeight: 18 },

  dangerZone: { gap: 10, marginTop: 6 },

  benefitRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  benefitIcon: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: COLORS.primaryBg, alignItems: 'center', justifyContent: 'center',
  },
  benefitText: { flex: 1, fontSize: 13.5, color: COLORS.textSecondary },
  guestAction: { alignSelf: 'stretch', marginTop: 6 },

  appInfo: { alignItems: 'center', gap: 4, paddingVertical: 24 },
  appName: { fontSize: 12.5, fontWeight: '700', color: COLORS.textSecondary },
  appVersion: { fontSize: 11.5, color: COLORS.textMuted },
  appDisclaimer: {
    fontSize: 11, color: COLORS.textMuted, textAlign: 'center',
    lineHeight: 16, marginTop: 6, paddingHorizontal: 20,
  },
});
