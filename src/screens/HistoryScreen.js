import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, StatusBar, Alert, FlatList } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS } from '../constants/colors';
import { ORGANS } from '../constants/symptoms';
import { getRiskStyle } from '../services/claudeService';
import { getHistory, clearHistory } from '../services/historyService';
import { formatDateTime } from '../constants/payments';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { IconButton } from '../components/ui/AppButton';
import { EmptyState } from '../components/ui/StateViews';

export default function HistoryScreen() {
  const [history, setHistory] = useState([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    setHistory(await getHistory());
    setLoaded(true);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleClear = useCallback(() => {
    Alert.alert(
      'Delete all screening history?',
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

  const counts = useMemo(() => {
    const byOrgan = { heart: 0, kidney: 0, liver: 0 };
    for (const item of history) {
      if (byOrgan[item.organId] !== undefined) byOrgan[item.organId] += 1;
    }
    return byOrgan;
  }, [history]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      <FlatList
        data={history}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <HistoryCard item={item} />}
        initialNumToRender={8}
        maxToRenderPerBatch={10}
        windowSize={7}
        removeClippedSubviews
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <>
            <ScreenHeader
              title="Screening History"
              subtitle={`${history.length} screening${history.length === 1 ? '' : 's'} saved`}
              right={
                history.length > 0 ? (
                  <IconButton
                    icon="trash-outline"
                    label="Delete all screening history"
                    accessibilityHint="Cannot be undone"
                    onPress={handleClear}
                    size={20}
                  />
                ) : null
              }
            />
            {history.length > 0 && (
              <View style={styles.statsRow}>
                {Object.values(ORGANS).map((organ) => (
                  <View
                    key={organ.id}
                    style={styles.statCard}
                    accessible
                    accessibilityLabel={`${counts[organ.id]} ${organ.name} screening${counts[organ.id] === 1 ? '' : 's'}`}
                  >
                    <LinearGradient colors={organ.grad} style={styles.statGradient}>
                      <Text style={styles.statEmoji} accessibilityElementsHidden>
                        {organ.emoji}
                      </Text>
                      <Text style={styles.statCount}>{counts[organ.id]}</Text>
                      <Text style={styles.statLabel}>{organ.name}</Text>
                    </LinearGradient>
                  </View>
                ))}
              </View>
            )}
            {history.length > 0 && (
              <Text style={styles.sectionTitle} accessibilityRole="header">
                All screenings
              </Text>
            )}
          </>
        }
        ListEmptyComponent={
          loaded ? (
            <EmptyState
              emoji="📋"
              title="No screenings yet"
              message="Complete a health screening and your results will appear here for easy reference."
              style={styles.empty}
            />
          ) : null
        }
        ListFooterComponent={
          history.length > 0 ? (
            <Text style={styles.footerNote}>
              Your screening results are stored on this device. Symptoms and any photo you
              attach are sent to our AI provider to produce the analysis.
            </Text>
          ) : null
        }
      />
    </View>
  );
}

const HistoryCard = React.memo(function HistoryCard({ item }) {
  const organ = ORGANS[item.organId];
  const risk = getRiskStyle(item.riskLevel);
  const when = formatDateTime(item.date);

  return (
    <View
      style={styles.card}
      accessible
      accessibilityLabel={`${organ.name} screening on ${when}. ${risk.label}, score ${item.riskScore} out of 100. ${item.summary}`}
    >
      <View style={[styles.cardAccent, { backgroundColor: organ.color }]} />
      <View style={styles.cardBody}>
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderLeft}>
            <Text style={styles.cardEmoji} accessibilityElementsHidden>
              {organ.emoji}
            </Text>
            <View style={styles.cardTitles}>
              <Text style={styles.cardTitle}>{organ.name} screening</Text>
              <Text style={styles.cardDate}>{when}</Text>
            </View>
          </View>
          <View style={[styles.riskBadge, { backgroundColor: risk.bg }]}>
            <Ionicons name={risk.icon} size={12} color={risk.color} />
            <Text style={[styles.riskBadgeText, { color: risk.color }]}>{risk.label}</Text>
          </View>
        </View>
        <Text style={styles.cardSummary} numberOfLines={2}>
          {item.summary}
        </Text>
        <View style={styles.cardMeta}>
          <View style={styles.metaItem}>
            <Ionicons name="list-outline" size={12} color={COLORS.textMuted} />
            <Text style={styles.metaText}>
              {item.symptomCount} symptom{item.symptomCount === 1 ? '' : 's'}
            </Text>
          </View>
          <View style={styles.metaItem}>
            <Ionicons name="speedometer-outline" size={12} color={COLORS.textMuted} />
            <Text style={styles.metaText}>Score {item.riskScore}/100</Text>
          </View>
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  listContent: { paddingBottom: 110 },
  statsRow: { flexDirection: 'row', gap: 10, padding: 16 },
  statCard: { flex: 1, borderRadius: 14, overflow: 'hidden' },
  statGradient: { padding: 14, alignItems: 'center', gap: 3 },
  statEmoji: { fontSize: 20 },
  statCount: { fontSize: 22, fontWeight: '900', color: '#FFFFFF' },
  statLabel: { fontSize: 11, color: 'rgba(255,255,255,0.9)', fontWeight: '600' },
  sectionTitle: {
    fontSize: 16, fontWeight: '800', color: COLORS.text,
    marginHorizontal: 16, marginBottom: 10,
  },
  empty: { marginTop: 40 },
  card: {
    flexDirection: 'row', backgroundColor: COLORS.surface,
    borderRadius: 14, marginHorizontal: 16, marginBottom: 10,
    borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden',
  },
  cardAccent: { width: 5 },
  cardBody: { flex: 1, padding: 14, gap: 8 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  cardHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  cardEmoji: { fontSize: 24 },
  cardTitles: { flex: 1 },
  cardTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  cardDate: { fontSize: 11.5, color: COLORS.textMuted, marginTop: 1 },
  riskBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 9, paddingVertical: 5, borderRadius: 99,
  },
  riskBadgeText: { fontSize: 10.5, fontWeight: '800' },
  cardSummary: { fontSize: 13, color: COLORS.textSecondary, lineHeight: 18 },
  cardMeta: { flexDirection: 'row', gap: 14 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 11.5, color: COLORS.textMuted },
  footerNote: {
    fontSize: 11.5, color: COLORS.textMuted, textAlign: 'center',
    lineHeight: 17, marginTop: 8, paddingHorizontal: 24,
  },
});
