import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, Pressable,
  StyleSheet, StatusBar, Linking,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../constants/colors';
import { ORGANS } from '../constants/symptoms';
import { EDUCATION } from '../constants/education';

export default function EducationScreen({ route }) {
  const requestedOrgan = route?.params?.organId;
  const [activeOrgan, setActiveOrgan] = useState(requestedOrgan || 'heart');
  const [expandedSection, setExpandedSection] = useState(0);
  const insets = useSafeAreaInsets();

  // Deep links from a result screen ("Health education for Liver") must switch
  // tabs on arrival, not only on first mount.
  useEffect(() => {
    if (requestedOrgan && ORGANS[requestedOrgan]) {
      setActiveOrgan(requestedOrgan);
      setExpandedSection(0);
    }
  }, [requestedOrgan]);

  const organ = ORGANS[activeOrgan];
  const edu = EDUCATION[activeOrgan];

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <LinearGradient
        colors={['#5B21B6', '#7C3AED']}
        style={[styles.header, { paddingTop: insets.top + 12 }]}
      >
        <Text style={styles.headerTitle} accessibilityRole="header">
          Health Education
        </Text>
        <Text style={styles.headerSub}>
          Evidence-based guidance for heart, liver &amp; kidney health
        </Text>

        {/* Organ Tabs */}
        <View style={styles.tabRow} accessibilityRole="tablist">
          {Object.values(ORGANS).map((o) => {
            const selected = activeOrgan === o.id;
            return (
              <Pressable
                key={o.id}
                style={({ pressed }) => [
                  styles.tab,
                  selected && styles.tabActive,
                  pressed && styles.pressed,
                ]}
                onPress={() => { setActiveOrgan(o.id); setExpandedSection(0); }}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                accessibilityLabel={`${o.name} health information`}
              >
                <Text style={styles.tabEmoji} accessibilityElementsHidden>
                  {o.emoji}
                </Text>
                <Text style={[styles.tabLabel, selected && styles.tabLabelActive]}>
                  {o.name}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </LinearGradient>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

        {/* Organ Overview */}
        <View style={[styles.overviewCard, { borderColor: organ.colorBorder, backgroundColor: organ.colorBg }]}>
          <Text style={styles.overviewEmoji}>{organ.emoji}</Text>
          <View style={styles.overviewContent}>
            <Text style={[styles.overviewTitle, { color: organ.color }]}>{edu.title}</Text>
            <Text style={styles.overviewText}>{edu.overview}</Text>
          </View>
        </View>

        {/* Sections */}
        {edu.sections.map((section, index) => {
          const expanded = expandedSection === index;
          return (
            <View key={section.title} style={styles.sectionCard}>
              <Pressable
                style={({ pressed }) => [styles.sectionHeader, pressed && styles.pressed]}
                onPress={() => setExpandedSection(expanded ? -1 : index)}
                // Announces as a collapsible section with its current state, so
                // a screen-reader user knows the tap will expand or collapse it.
                accessibilityRole="button"
                accessibilityState={{ expanded }}
                accessibilityLabel={section.title}
                accessibilityHint={expanded ? 'Collapses this section' : 'Expands this section'}
              >
                <View style={[styles.sectionIconBg, { backgroundColor: organ.colorBg }]}>
                  <Text style={styles.sectionIcon} accessibilityElementsHidden>
                    {section.icon}
                  </Text>
                </View>
                <Text style={[styles.sectionTitle, expanded && { color: organ.color }]}>
                  {section.title}
                </Text>
                <Ionicons
                  name={expanded ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color={COLORS.textMuted}
                />
              </Pressable>

              {expanded && (
                <View style={styles.sectionBody}>
                  {section.tips.map((tip, ti) => (
                    <View key={ti} style={styles.tipRow}>
                      <View style={[styles.tipDot, { backgroundColor: organ.color }]} />
                      <Text style={styles.tipText}>{tip}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          );
        })}

        {/* Emergency CTA */}
        <View style={styles.emergencyCard}>
          <View style={styles.emergencyHeader}>
            <Text style={styles.emergencyEmoji}>🚨</Text>
            <Text style={styles.emergencyTitle}>When to Seek Emergency Care</Text>
          </View>
          <Text style={styles.emergencyText}>
            If you experience sudden severe chest pain, inability to breathe, coughing blood,
            vomiting blood, sudden confusion, or loss of consciousness — go to the nearest
            hospital emergency room immediately or call for emergency transport.
          </Text>
          {/* Tappable: in an emergency, nobody should have to memorise a number
              and retype it into the dialler. */}
          <View style={styles.emergencyNumbers}>
            {[
              { label: 'Police / ambulance', number: '999' },
              { label: 'Emergency line', number: '0800100066' },
            ].map(({ label, number }) => (
              <Pressable
                key={number}
                onPress={() => Linking.openURL(`tel:${number}`)}
                accessibilityRole="button"
                accessibilityLabel={`Call ${label}, ${number.split('').join(' ')}`}
                accessibilityHint="Opens your phone dialler"
                style={({ pressed }) => [styles.emergencyNum, pressed && styles.pressed]}
              >
                <Ionicons name="call" size={15} color={COLORS.danger} />
                <Text style={styles.emergencyNumText}>
                  {label}: {number}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    paddingBottom: 0,
    paddingHorizontal: 20,
  },
  pressed: { opacity: 0.75 },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.4,
    marginBottom: 4,
  },
  headerSub: {
    fontSize: 12.5,
    color: 'rgba(255,255,255,0.7)',
    marginBottom: 18,
  },
  tabRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: -1,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  tabActive: {
    backgroundColor: COLORS.background,
  },
  tabEmoji: { fontSize: 15 },
  tabLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.8)',
  },
  tabLabelActive: {
    color: COLORS.primary,
  },
  scroll: { flex: 1 },
  scrollContent: { padding: 16 },
  overviewCard: {
    flexDirection: 'row',
    gap: 12,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    marginBottom: 16,
    alignItems: 'flex-start',
  },
  overviewEmoji: { fontSize: 30, marginTop: 2 },
  overviewContent: { flex: 1 },
  overviewTitle: { fontSize: 16, fontWeight: '800', marginBottom: 6 },
  overviewText: { fontSize: 13.5, color: COLORS.textSecondary, lineHeight: 20 },
  sectionCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
  },
  sectionIconBg: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionIcon: { fontSize: 18 },
  sectionTitle: {
    flex: 1,
    fontSize: 14.5,
    fontWeight: '700',
    color: COLORS.text,
  },
  sectionBody: {
    padding: 14,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: COLORS.gray100,
  },
  tipRow: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 7,
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray100,
  },
  tipDot: {
    width: 7,
    height: 7,
    borderRadius: 99,
    marginTop: 7,
    flexShrink: 0,
  },
  tipText: {
    flex: 1,
    fontSize: 13.5,
    color: COLORS.textSecondary,
    lineHeight: 20,
  },
  emergencyCard: {
    backgroundColor: '#FEF2F2',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#FECACA',
    marginTop: 6,
  },
  emergencyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  emergencyEmoji: { fontSize: 22 },
  emergencyTitle: { fontSize: 15, fontWeight: '800', color: COLORS.danger },
  emergencyText: {
    fontSize: 13.5,
    color: COLORS.text,
    lineHeight: 20,
    marginBottom: 12,
  },
  emergencyNumbers: { gap: 6 },
  emergencyNum: { minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  emergencyNumText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.danger,
  },
});
