import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, StatusBar, FlatList, RefreshControl, Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { useWallet } from '../context/WalletContext';
import { COLORS } from '../constants/colors';
import {
  PACKAGES, SCAN_PRICE, formatUGX, formatUSD, formatDateTime,
} from '../constants/payments';
import PaymentModal from '../components/PaymentModal';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { AppButton } from '../components/ui/AppButton';
import { EmptyState, ErrorState, Skeleton } from '../components/ui/StateViews';

export default function WalletScreen({ navigation }) {
  const { user } = useAuth();
  const {
    wallet, transactions, status, error, isReady, refresh, applyWallet,
  } = useWallet();
  const [paymentModal, setPaymentModal] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    // Depends on `user` — the previous version captured it once with empty deps,
    // so signing in while this tab was mounted never loaded anything.
    useCallback(() => {
      if (user) refresh();
    }, [user, refresh])
  );

  const onPullToRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  if (!user) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" />
        <ScreenHeader title="Wallet" subtitle="Scan credits and payments" />
        <EmptyState
          style={styles.flex}
          icon="wallet-outline"
          title="Sign in to access your wallet"
          message="Buy scan credits and see your payment history."
          action={
            <AppButton
              label="Sign in"
              icon="log-in-outline"
              onPress={() => navigation.navigate('Login')}
              style={styles.stretch}
            />
          }
        />
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

      <FlatList
        data={transactions}
        keyExtractor={(tx) => tx.id}
        renderItem={({ item }) => <TransactionRow tx={item} />}
        // Virtualized: this list can hold 200 records, and a ScrollView mounted
        // every one of them before the first frame.
        initialNumToRender={8}
        maxToRenderPerBatch={10}
        windowSize={7}
        removeClippedSubviews
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onPullToRefresh}
            tintColor={COLORS.primary}
            colors={[COLORS.primary]}
          />
        }
        ListHeaderComponent={
          <>
            <ScreenHeader
              title="My Wallet"
              subtitle="Scan credits and payment history"
              colors={['#3B0764', '#5B21B6', '#7C3AED']}
              style={styles.header}
            >
              <BalanceCard wallet={wallet} isReady={isReady} />
              <AppButton
                label="Buy scan credits"
                icon="add-circle-outline"
                variant="secondary"
                onPress={() => setPaymentModal(true)}
                style={styles.topUpButton}
              />
            </ScreenHeader>

            {status === 'error' && (
              <ErrorState
                message={error}
                onRetry={refresh}
                style={styles.errorBlock}
              />
            )}

            <View style={styles.pricingCard}>
              <View style={styles.pricingHeader}>
                <Ionicons name="pricetag-outline" size={18} color={COLORS.primary} />
                <Text style={styles.pricingTitle} accessibilityRole="header">
                  Pricing
                </Text>
              </View>
              <View style={styles.pricingRow}>
                <Text style={styles.pricingLabel}>Per organ screening</Text>
                <Text style={styles.pricingValue}>
                  {formatUGX(SCAN_PRICE.UGX)} / {formatUSD(SCAN_PRICE.USD)}
                </Text>
              </View>
              <Text style={styles.packagesTitle}>Packages</Text>
              <View style={styles.packagesRow}>
                {PACKAGES.map((pkg) => (
                  <Pressable
                    key={pkg.id}
                    onPress={() => setPaymentModal(true)}
                    accessibilityRole="button"
                    accessibilityLabel={`Buy ${pkg.label} for ${formatUGX(pkg.ugx)}`}
                    style={({ pressed }) => [
                      styles.pkgMini,
                      pkg.popular && styles.pkgMiniActive,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={[styles.pkgMiniScans, pkg.popular && { color: COLORS.primary }]}>
                      {pkg.scans}
                    </Text>
                    <Text style={styles.pkgMiniLabel}>scans</Text>
                    <Text style={[styles.pkgMiniPrice, pkg.popular && { color: COLORS.primary }]}>
                      {formatUGX(pkg.ugx)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <Text style={styles.sectionTitle} accessibilityRole="header">
              Transaction history
            </Text>
          </>
        }
        ListEmptyComponent={
          status === 'loading' ? (
            <View style={styles.skeletonList}>
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} height={72} style={styles.skeletonRow} />
              ))}
            </View>
          ) : status === 'error' ? null : (
            <EmptyState
              icon="receipt-outline"
              title="No transactions yet"
              message="Your top-ups and screenings will appear here."
            />
          )
        }
      />
    </View>
  );
}

function BalanceCard({ wallet, isReady }) {
  const balance = wallet?.balanceScans ?? 0;

  return (
    <View
      style={styles.balanceCard}
      accessible
      accessibilityLabel={
        isReady
          ? `${balance} scan credits available, worth ${formatUGX(balance * SCAN_PRICE.UGX)}`
          : 'Loading your balance'
      }
    >
      <View style={styles.balanceLeft}>
        <Text style={styles.balanceLabel}>AVAILABLE SCANS</Text>
        {isReady ? (
          <>
            <Text style={[styles.balanceNum, balance === 0 && styles.balanceNumEmpty]}>
              {balance}
            </Text>
            <Text style={styles.balanceSub}>
              worth {formatUGX(balance * SCAN_PRICE.UGX)}
            </Text>
          </>
        ) : (
          <>
            <Skeleton width={54} height={38} style={styles.balanceSkeleton} />
            <Skeleton width={90} height={11} />
          </>
        )}
      </View>
      <View style={styles.balanceDivider} />
      <View style={styles.balanceRight}>
        <MiniStat
          label="Scans used"
          // These read the fields the service actually writes. The previous
          // version read `totalScans` / `totalSpent`, which never existed, so
          // both tiles displayed zero no matter how much had been spent.
          value={isReady ? String(wallet?.totalScansUsed ?? 0) : null}
        />
        <MiniStat
          label="Total spent"
          value={isReady ? formatUGX(wallet?.totalSpentUgx ?? 0) : null}
        />
      </View>
    </View>
  );
}

function MiniStat({ label, value }) {
  return (
    <View style={styles.miniStat}>
      {value === null ? (
        <Skeleton width={44} height={16} />
      ) : (
        <Text style={styles.miniValue}>{value}</Text>
      )}
      <Text style={styles.miniLabel}>{label}</Text>
    </View>
  );
}

const TX_STYLES = {
  TOPUP: { icon: 'arrow-down-circle', color: COLORS.success, bg: COLORS.successBg, sign: '+' },
  SCAN_DEBIT: { icon: 'scan-outline', color: COLORS.primary, bg: COLORS.primaryBg, sign: '−' },
  REFUND: { icon: 'return-up-back-outline', color: COLORS.info, bg: COLORS.infoBg, sign: '+' },
};

const TransactionRow = React.memo(function TransactionRow({ tx }) {
  const style = TX_STYLES[tx.type] ?? TX_STYLES.SCAN_DEBIT;
  const scans = Math.abs(tx.scans || 1);
  const when = formatDateTime(tx.createdAt);

  return (
    <View
      style={styles.txCard}
      accessible
      accessibilityLabel={`${tx.description || tx.type}. ${style.sign === '+' ? 'Added' : 'Used'} ${scans} scan${scans === 1 ? '' : 's'}. ${when}.`}
    >
      <View style={[styles.txIcon, { backgroundColor: style.bg }]}>
        <Ionicons name={style.icon} size={20} color={style.color} />
      </View>
      <View style={styles.txInfo}>
        <Text style={styles.txTitle} numberOfLines={1}>
          {tx.description || tx.type}
        </Text>
        <Text style={styles.txDate}>{when}</Text>
        {!!tx.reference && (
          <Text style={styles.txRef} numberOfLines={1}>
            {tx.reference}
          </Text>
        )}
      </View>
      <View style={styles.txRight}>
        <Text style={[styles.txScans, { color: style.color }]}>
          {style.sign}
          {scans}
        </Text>
        <Text style={styles.txScansLabel}>scan{scans === 1 ? '' : 's'}</Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  flex: { flex: 1 },
  stretch: { alignSelf: 'stretch' },
  pressed: { opacity: 0.75 },
  header: { paddingBottom: 24 },
  listContent: { paddingBottom: 110 },

  balanceCard: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: 16,
    padding: 16,
    marginTop: 16,
    alignItems: 'center',
  },
  balanceLeft: { flex: 1 },
  balanceLabel: { fontSize: 10, fontWeight: '800', color: 'rgba(255,255,255,0.75)', letterSpacing: 1 },
  balanceNum: { fontSize: 38, fontWeight: '900', color: '#5EEAD4', marginTop: 2 },
  balanceNumEmpty: { color: '#FCA5A5' },
  balanceSkeleton: { marginTop: 6, marginBottom: 4 },
  balanceSub: { fontSize: 11.5, color: 'rgba(255,255,255,0.8)' },
  balanceDivider: { width: 1, height: 56, backgroundColor: 'rgba(255,255,255,0.2)', marginHorizontal: 16 },
  balanceRight: { gap: 12 },
  miniStat: { alignItems: 'flex-start', gap: 2 },
  miniValue: { fontSize: 15, fontWeight: '800', color: '#FFFFFF' },
  miniLabel: { fontSize: 10.5, color: 'rgba(255,255,255,0.75)' },
  topUpButton: { marginTop: 14, backgroundColor: '#FFFFFF', borderColor: '#FFFFFF' },

  errorBlock: { marginHorizontal: 16, marginTop: 16 },

  pricingCard: {
    backgroundColor: COLORS.surface,
    margin: 16,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 10,
  },
  pricingHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pricingTitle: { fontSize: 15.5, fontWeight: '800', color: COLORS.text },
  pricingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pricingLabel: { fontSize: 13.5, color: COLORS.textSecondary },
  pricingValue: { fontSize: 13.5, fontWeight: '700', color: COLORS.text },
  packagesTitle: { fontSize: 12, fontWeight: '700', color: COLORS.textMuted, marginTop: 4 },
  packagesRow: { flexDirection: 'row', gap: 8 },
  pkgMini: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    minHeight: 48,
    gap: 1,
  },
  pkgMiniActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryBg },
  pkgMiniScans: { fontSize: 17, fontWeight: '900', color: COLORS.text },
  pkgMiniLabel: { fontSize: 9.5, color: COLORS.textMuted },
  pkgMiniPrice: { fontSize: 10.5, fontWeight: '700', color: COLORS.textSecondary, marginTop: 2 },

  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.text,
    marginHorizontal: 16,
    marginBottom: 10,
  },
  skeletonList: { paddingHorizontal: 16, gap: 10 },
  skeletonRow: { borderRadius: 14 },

  txCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 14,
    marginHorizontal: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  txIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  txInfo: { flex: 1, gap: 2 },
  txTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  txDate: { fontSize: 11.5, color: COLORS.textMuted },
  txRef: { fontSize: 10.5, color: COLORS.gray400 },
  txRight: { alignItems: 'flex-end' },
  txScans: { fontSize: 16, fontWeight: '800' },
  txScansLabel: { fontSize: 10, color: COLORS.textMuted },
});
