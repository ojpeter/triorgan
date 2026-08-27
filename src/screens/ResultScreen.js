import React, { useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, StatusBar } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../constants/colors';
import { ORGANS } from '../constants/symptoms';
import { getRiskStyle } from '../services/claudeService';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { AppButton } from '../components/ui/AppButton';

export default function ResultScreen({ route, navigation }) {
  const { organId, analysisResult: result, selectedSymptoms = [] } = route.params;
  const organ = ORGANS[organId];

  // NOTE: every hook runs before any conditional return. The previous version
  // returned early for INVALID results and then called useEffect below it,
  // which changes the hook count between renders — a Rules of Hooks violation
  // that React can crash on.
  const isInvalid = result?.riskLevel === 'INVALID';
  const risk = useMemo(() => getRiskStyle(result?.riskLevel), [result?.riskLevel]);
  const insets = useSafeAreaInsets();

  // History is written by screeningService when the screening completes, not
  // here — a screen should not be the thing that persists a domain record, and
  // an unreadable photo must not be filed as a completed screening.

  if (isInvalid) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="dark-content" />
        <ScrollView
          contentContainerStyle={[styles.invalidContent, { paddingTop: insets.top + 40 }]}
        >
          <View style={styles.invalidIcon}>
            <Ionicons name="camera-reverse-outline" size={38} color="#B45309" />
          </View>
          <Text style={styles.invalidTitle} accessibilityRole="header">
            We could not read that photo
          </Text>
          <Text style={styles.invalidMessage}>{result.riskSummary}</Text>
          <Text style={styles.invalidHint}>
            Take a clear, well-lit photo of the relevant area — your eyes, nails, hands, skin or
            ankles. Your scan credit has not been used.
          </Text>
          <AppButton
            label="Try again"
            icon="refresh-outline"
            onPress={() => navigation.navigate('Detection', { organId })}
            style={styles.invalidAction}
          />
          <AppButton
            label="Back to home"
            variant="secondary"
            onPress={() => navigation.navigate('Home')}
            style={styles.invalidAction}
          />
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      <ScreenHeader
        title={`${organ.name} Screening Result`}
        subtitle={new Date().toLocaleDateString('en-UG', { dateStyle: 'full' })}
        colors={organ.grad}
        onBack={() => navigation.navigate('Home')}
        backLabel="Back to home"
      />

      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* The outcome is the most important thing on the screen, so it is a
            single accessible unit announced as one sentence rather than five
            fragments, and it is announced automatically on arrival. */}
        <View
          style={[styles.riskCard, { backgroundColor: risk.bg, borderColor: risk.color }]}
          accessible
          accessibilityLiveRegion="polite"
          accessibilityLabel={`${risk.label}. Score ${result.riskScore} out of 100. ${result.riskSummary}`}
        >
          <View style={styles.riskHeader}>
            <Ionicons name={risk.icon} size={30} color={risk.color} />
            <View style={styles.riskTitleGroup}>
              <Text style={[styles.riskLevel, { color: risk.color }]}>{risk.label}</Text>
              <Text style={styles.riskOrgan}>{organ.name} disease screening</Text>
            </View>
            <View style={styles.riskScoreCircle}>
              <Text style={[styles.riskScoreNum, { color: risk.color }]}>{result.riskScore}</Text>
              <Text style={styles.riskScoreDen}>/100</Text>
            </View>
          </View>
          <Text style={styles.riskSummary}>{result.riskSummary}</Text>
          {!!result.positiveNote && (
            <Text style={[styles.positiveNote, { color: risk.color }]}>{result.positiveNote}</Text>
          )}
        </View>

        {result.findings.length > 0 && (
          <Section title="Findings" icon="search-outline">
            {result.findings.map((finding, i) => (
              <FindingRow key={`${finding.symptom}-${i}`} finding={finding} />
            ))}
          </Section>
        )}

        {result.recommendations.length > 0 && (
          <Section title="Recommendations" icon="bulb-outline">
            {result.recommendations.map((rec, i) => (
              <RecommendationCard key={`${rec.title}-${i}`} rec={rec} />
            ))}
          </Section>
        )}

        <View style={styles.nextStepsCard}>
          <View style={styles.sectionHeader}>
            <Ionicons name="footsteps-outline" size={20} color={COLORS.primary} />
            <Text style={styles.sectionTitle} accessibilityRole="header">
              What to do next
            </Text>
          </View>
          <Text style={styles.nextStepsText}>{result.nextSteps}</Text>
        </View>

        <View style={styles.disclaimerCard} accessible>
          <Ionicons name="shield-outline" size={16} color={COLORS.textMuted} />
          <Text style={styles.disclaimerText}>{result.disclaimer}</Text>
        </View>

        <View style={styles.actions}>
          <AppButton
            label={`Health education for ${organ.name.toLowerCase()}`}
            icon="book-outline"
            gradient={organ.grad}
            // Params must be addressed to the screen inside the tab's stack —
            // passing them to the tab route alone leaves route.params undefined
            // on EducationScreen.
            onPress={() =>
              navigation.navigate('EducationTab', {
                screen: 'EducationMain',
                params: { organId },
              })
            }
          />
          <AppButton
            label="Screen again"
            icon="refresh-outline"
            variant="secondary"
            onPress={() => navigation.navigate('Detection', { organId })}
          />
          <AppButton
            label="Back to home"
            variant="secondary"
            onPress={() => navigation.navigate('Home')}
          />
        </View>

        <Text style={styles.metaNote}>
          Based on {selectedSymptoms.length} reported sign
          {selectedSymptoms.length === 1 ? '' : 's'}.
        </Text>
      </ScrollView>
    </View>
  );
}

function Section({ title, icon, children }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Ionicons name={icon} size={18} color={COLORS.primary} />
        <Text style={styles.sectionTitle} accessibilityRole="header">
          {title}
        </Text>
      </View>
      {children}
    </View>
  );
}

const URGENCY = {
  routine: { color: '#065F46', bg: '#ECFDF5', label: 'Routine' },
  soon: { color: '#92400E', bg: '#FFFBEB', label: 'See a clinician soon' },
  urgent: { color: '#B91C1C', bg: '#FEF2F2', label: 'Urgent' },
  emergency: { color: '#7F1D1D', bg: '#FFE4E6', label: 'Emergency' },
};

const FindingRow = React.memo(function FindingRow({ finding }) {
  const urgency = URGENCY[finding.urgency] ?? URGENCY.routine;
  return (
    <View
      style={styles.findingRow}
      accessible
      accessibilityLabel={`${finding.symptom}. ${finding.significance}. Urgency: ${urgency.label}.`}
    >
      <View style={styles.findingLeft}>
        <Text style={styles.findingSymptom}>{finding.symptom}</Text>
        <Text style={styles.findingSig}>{finding.significance}</Text>
      </View>
      <View style={[styles.urgencyBadge, { backgroundColor: urgency.bg }]}>
        <Text style={[styles.urgencyText, { color: urgency.color }]}>{urgency.label}</Text>
      </View>
    </View>
  );
});

const CATEGORY = {
  Lifestyle: { bg: '#EFF6FF', icon: '#1D4ED8', border: '#BFDBFE', name: 'bicycle-outline' },
  Diet: { bg: '#F0FDF4', icon: '#15803D', border: '#BBF7D0', name: 'nutrition-outline' },
  Medical: { bg: '#FEF2F2', icon: '#B91C1C', border: '#FECACA', name: 'medical-outline' },
  Monitoring: { bg: '#F5F3FF', icon: '#6D28D9', border: '#DDD6FE', name: 'pulse-outline' },
};

const RecommendationCard = React.memo(function RecommendationCard({ rec }) {
  const style = CATEGORY[rec.category] ?? CATEGORY.Monitoring;
  return (
    <View
      style={[styles.recCard, { backgroundColor: style.bg, borderColor: style.border }]}
      accessible
      accessibilityLabel={`${rec.category} recommendation. ${rec.title}. ${rec.detail}`}
    >
      <View style={styles.recHeader}>
        <View style={[styles.recIconBg, { backgroundColor: `${style.icon}22` }]}>
          <Ionicons name={style.name} size={16} color={style.icon} />
        </View>
        <View style={styles.recTitleGroup}>
          <Text style={[styles.recCategory, { color: style.icon }]}>
            {rec.category.toUpperCase()}
          </Text>
          <Text style={styles.recTitle}>{rec.title}</Text>
        </View>
      </View>
      <Text style={styles.recDetail}>{rec.detail}</Text>
    </View>
  );
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 48, gap: 14 },

  riskCard: { borderRadius: 18, padding: 18, borderWidth: 1.5, gap: 12 },
  riskHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  riskTitleGroup: { flex: 1 },
  riskLevel: { fontSize: 18, fontWeight: '900', letterSpacing: -0.3 },
  riskOrgan: { fontSize: 12.5, color: COLORS.textSecondary, marginTop: 2 },
  riskScoreCircle: { alignItems: 'center' },
  riskScoreNum: { fontSize: 28, fontWeight: '900' },
  riskScoreDen: { fontSize: 11, color: COLORS.textMuted, marginTop: -3 },
  riskSummary: { fontSize: 14.5, color: COLORS.text, lineHeight: 21 },
  positiveNote: { fontSize: 13, fontWeight: '700', lineHeight: 19 },

  section: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 10,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: COLORS.text },

  findingRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.gray100,
  },
  findingLeft: { flex: 1, gap: 3 },
  findingSymptom: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  findingSig: { fontSize: 12.5, color: COLORS.textSecondary, lineHeight: 18 },
  urgencyBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 99 },
  urgencyText: { fontSize: 11, fontWeight: '800' },

  recCard: { borderRadius: 12, padding: 14, borderWidth: 1, gap: 8 },
  recHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  recIconBg: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  recTitleGroup: { flex: 1 },
  recCategory: { fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  recTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text, marginTop: 1 },
  recDetail: { fontSize: 13, color: COLORS.textSecondary, lineHeight: 19 },

  nextStepsCard: {
    backgroundColor: COLORS.primaryBg,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.primaryBorder,
    gap: 10,
  },
  nextStepsText: { fontSize: 14, color: COLORS.text, lineHeight: 21 },

  disclaimerCard: {
    flexDirection: 'row',
    gap: 8,
    padding: 14,
    backgroundColor: COLORS.gray50,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'flex-start',
  },
  disclaimerText: { flex: 1, fontSize: 11.5, color: COLORS.textSecondary, lineHeight: 17 },

  actions: { gap: 10, marginTop: 4 },
  metaNote: { fontSize: 11.5, color: COLORS.textMuted, textAlign: 'center', marginTop: 4 },

  invalidContent: { flexGrow: 1, alignItems: 'center', padding: 32, gap: 14 },
  invalidIcon: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  invalidTitle: {
    fontSize: 21,
    fontWeight: '800',
    color: COLORS.text,
    textAlign: 'center',
    letterSpacing: -0.4,
  },
  invalidMessage: { fontSize: 15, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 23 },
  invalidHint: {
    fontSize: 13,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 12,
  },
  invalidAction: { alignSelf: 'stretch' },
});
