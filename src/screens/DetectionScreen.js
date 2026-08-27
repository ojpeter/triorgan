import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, Alert, Image,
  ActivityIndicator, StatusBar, Pressable, ActionSheetIOS, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { COLORS } from '../constants/colors';
import { ORGANS, SYMPTOMS } from '../constants/symptoms';
import { runScreening } from '../services/screeningService';
import { SCAN_PRICE, formatUGX } from '../constants/payments';
import { useAuth } from '../context/AuthContext';
import { useWallet } from '../context/WalletContext';
import AuthGateModal from '../components/AuthGateModal';
import PaymentModal from '../components/PaymentModal';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { AppButton } from '../components/ui/AppButton';
import { Skeleton } from '../components/ui/StateViews';

/** Photos are large; more than this makes the request slow on a mobile link. */
const MAX_PHOTOS = 3;

export default function DetectionScreen({ route, navigation }) {
  const { organId } = route.params;
  const organ = ORGANS[organId];
  const symptoms = SYMPTOMS[organId];

  const { user } = useAuth();
  const { balanceScans, isReady: walletReady, refresh: refreshWallet, applyWallet } = useWallet();
  const insets = useSafeAreaInsets();

  const [selectedSymptoms, setSelectedSymptoms] = useState([]);
  const [capturedImages, setCapturedImages] = useState({}); // { [symptomId]: asset }
  const [analyzing, setAnalyzing] = useState(false);
  const [authModal, setAuthModal] = useState(false);
  const [paymentModal, setPaymentModal] = useState(false);

  // Guards against a double tap starting two screenings. State is too slow —
  // it does not update until the next render, and there are awaits before then.
  const inFlight = useRef(false);
  const abortRef = useRef(null);

  // Cancel any in-flight analysis if the user leaves the screen.
  useEffect(() => () => abortRef.current?.abort(), []);

  const toggleSymptom = useCallback((id) => {
    setSelectedSymptoms((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  }, []);

  const attachImage = useCallback((symptomId, asset) => {
    setCapturedImages((prev) => ({ ...prev, [symptomId]: asset }));
    setSelectedSymptoms((prev) => (prev.includes(symptomId) ? prev : [...prev, symptomId]));
  }, []);

  const removeImage = useCallback((symptomId) => {
    setCapturedImages((prev) => {
      const next = { ...prev };
      delete next[symptomId];
      return next;
    });
  }, []);

  const photoCount = Object.keys(capturedImages).length;

  const pickImage = useCallback(
    async (symptom, source) => {
      const permission =
        source === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        Alert.alert(
          source === 'camera' ? 'Camera access needed' : 'Photo access needed',
          'TriaCare needs this permission to attach a photo to your screening. You can enable it in your device Settings.'
        );
        return;
      }

      const options = {
        // Explicit rather than relying on the default: expo-image-picker 17
        // replaced the MediaTypeOptions enum with this string array.
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.6,
        base64: true,
      };
      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync(options)
          : await ImagePicker.launchImageLibraryAsync(options);

      if (!result.canceled && result.assets?.[0]) {
        attachImage(symptom.id, result.assets[0]);
      }
    },
    [attachImage]
  );

  const handlePhotoForSymptom = useCallback(
    (symptom) => {
      const alreadyHasPhoto = !!capturedImages[symptom.id];
      if (!alreadyHasPhoto && photoCount >= MAX_PHOTOS) {
        Alert.alert(
          'Photo limit reached',
          `You can attach up to ${MAX_PHOTOS} photos per screening. Remove one to add another.`
        );
        return;
      }

      const title = `Photo for ${symptom.shortName ?? symptom.name}`;
      const message = symptom.photoGuide ?? 'Take a clear, well-lit photo of the area.';

      // Use the platform's native sheet on iOS; Alert is the Android convention.
      if (Platform.OS === 'ios') {
        ActionSheetIOS.showActionSheetWithOptions(
          {
            title,
            message,
            options: ['Take photo', 'Choose from library', 'Cancel'],
            cancelButtonIndex: 2,
          },
          (index) => {
            if (index === 0) pickImage(symptom, 'camera');
            if (index === 1) pickImage(symptom, 'library');
          }
        );
        return;
      }

      Alert.alert(title, message, [
        { text: 'Take photo', onPress: () => pickImage(symptom, 'camera') },
        { text: 'Choose from library', onPress: () => pickImage(symptom, 'library') },
        { text: 'Cancel', style: 'cancel' },
      ]);
    },
    [capturedImages, photoCount, pickImage]
  );

  const handleAnalyze = useCallback(async () => {
    if (inFlight.current) return;

    if (!user) {
      setAuthModal(true);
      return;
    }
    if (selectedSymptoms.length === 0) {
      Alert.alert('Select a symptom', 'Tick at least one sign you can observe before analysing.');
      return;
    }

    inFlight.current = true;
    setAnalyzing(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const images = Object.entries(capturedImages)
        .filter(([, asset]) => !!asset?.base64)
        .slice(0, MAX_PHOTOS)
        .map(([symptomId, asset]) => ({ symptomId, base64: asset.base64 }));

      const result = await runScreening({
        userId: user.id,
        organ,
        selectedSymptoms,
        images,
        signal: controller.signal,
      });

      if (result.wallet) applyWallet(result.wallet);

      if (result.ok) {
        navigation.navigate('Result', {
          organId,
          selectedSymptoms,
          analysisResult: result.analysis,
          imageUris: Object.values(capturedImages).map((a) => a.uri),
        });
        return;
      }

      if (result.code === 'NO_CREDIT') {
        setPaymentModal(true);
        return;
      }

      // The credit is always returned by this point — say so, so the user is not
      // left wondering whether they just paid for nothing.
      Alert.alert(
        'Analysis could not finish',
        `${result.message}\n\nYour scan credit has not been used.`,
        result.retryable
          ? [{ text: 'Cancel', style: 'cancel' }, { text: 'Try again', onPress: handleAnalyze }]
          : [{ text: 'OK' }]
      );
    } catch {
      Alert.alert(
        'Analysis could not finish',
        'Something went wrong. Your scan credit has not been used.'
      );
    } finally {
      inFlight.current = false;
      abortRef.current = null;
      setAnalyzing(false);
      refreshWallet({ includeTransactions: false });
    }
  }, [
    user, selectedSymptoms, capturedImages, organ, organId,
    navigation, applyWallet, refreshWallet,
  ]);

  const progressPercent = useMemo(
    () => Math.round((selectedSymptoms.length / symptoms.length) * 100),
    [selectedSymptoms.length, symptoms.length]
  );

  const canAnalyze = selectedSymptoms.length > 0 && !analyzing;

  const buttonLabel = selectedSymptoms.length === 0
    ? 'Select symptoms to analyse'
    : `Analyse · ${formatUGX(SCAN_PRICE.UGX)}`;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      <AuthGateModal
        visible={authModal}
        onClose={() => setAuthModal(false)}
        onLogin={() => { setAuthModal(false); navigation.navigate('Login'); }}
        onRegister={() => { setAuthModal(false); navigation.navigate('Register'); }}
        feature="health screening"
      />
      <PaymentModal
        visible={paymentModal}
        onClose={() => setPaymentModal(false)}
        onSuccess={(w) => { applyWallet(w); setPaymentModal(false); }}
        organName={organ.name}
      />

      <ScreenHeader
        title={`${organ.name} Screening`}
        subtitle={organ.tagline}
        colors={organ.grad}
        onBack={() => navigation.goBack()}
        backLabel={`Back from ${organ.name} screening`}
      >
        <View style={styles.progressWrap}>
          <Text style={styles.progressText}>
            {selectedSymptoms.length} of {symptoms.length} signs selected
          </Text>
          <View
            style={styles.progressBar}
            accessibilityRole="progressbar"
            accessibilityValue={{ min: 0, max: symptoms.length, now: selectedSymptoms.length }}
            accessibilityLabel={`${selectedSymptoms.length} of ${symptoms.length} signs selected`}
          >
            <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
          </View>
        </View>
      </ScreenHeader>

      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.instructions}>
          Tick any signs you can currently observe on yourself or the patient. You can add a
          photo for each sign — up to {MAX_PHOTOS} per screening.
        </Text>

        {symptoms.map((symptom) => (
          <SymptomCard
            key={symptom.id}
            symptom={symptom}
            organ={organ}
            selected={selectedSymptoms.includes(symptom.id)}
            image={capturedImages[symptom.id]}
            onToggle={toggleSymptom}
            onAddPhoto={handlePhotoForSymptom}
            onRemovePhoto={removeImage}
          />
        ))}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) + 8 }]}>
        <AppButton
          label={buttonLabel}
          busyLabel="Analysing…"
          busy={analyzing}
          disabled={!canAnalyze}
          icon="analytics-outline"
          gradient={organ.grad}
          onPress={handleAnalyze}
          accessibilityHint={
            selectedSymptoms.length === 0
              ? 'Select at least one sign first'
              : 'Uses one scan credit'
          }
        />
        <View style={styles.footerMeta}>
          {!walletReady ? (
            <Skeleton width={190} height={12} />
          ) : (
            <Text style={styles.footerMetaText}>
              {balanceScans === 0
                ? `No scan credits — tap Analyse to top up · ${formatUGX(SCAN_PRICE.UGX)} per scan`
                : `${balanceScans} scan credit${balanceScans === 1 ? '' : 's'} remaining · ${formatUGX(SCAN_PRICE.UGX)} per scan`}
            </Text>
          )}
        </View>
      </View>

      {analyzing && (
        <View style={styles.blockingOverlay} accessibilityViewIsModal>
          <View style={styles.overlayCard} accessibilityLiveRegion="polite">
            <ActivityIndicator size="large" color={organ.color} />
            <Text style={styles.overlayTitle}>Analysing your screening</Text>
            <Text style={styles.overlayText}>
              This can take up to a minute. Please keep the app open.
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

// Memoised: without it, ticking one symptom re-rendered every card in the list.
const SymptomCard = React.memo(function SymptomCard({
  symptom, organ, selected, image, onToggle, onAddPhoto, onRemovePhoto,
}) {
  return (
    <View style={[styles.card, selected && { borderColor: organ.color, backgroundColor: organ.colorBg }]}>
      <Pressable
        onPress={() => onToggle(symptom.id)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: selected }}
        accessibilityLabel={symptom.name}
        accessibilityHint={symptom.description}
        style={({ pressed }) => [styles.cardHeader, pressed && styles.pressed]}
      >
        <Text style={styles.symptomEmoji} accessibilityElementsHidden>
          {symptom.icon}
        </Text>
        <View style={styles.symptomInfo}>
          <Text style={[styles.symptomName, selected && { color: organ.color }]}>
            {symptom.name}
          </Text>
          <SeverityBadge severity={symptom.severity} />
        </View>
        <View
          style={[styles.checkbox, selected && { backgroundColor: organ.color, borderColor: organ.color }]}
        >
          {selected && <Ionicons name="checkmark" size={15} color="#FFFFFF" />}
        </View>
      </Pressable>

      <Text style={styles.symptomDesc}>{symptom.description}</Text>

      <View style={styles.whyRow}>
        <Ionicons name="information-circle-outline" size={14} color={organ.color} />
        <Text style={[styles.whyText, { color: organ.color }]}>{symptom.why}</Text>
      </View>

      {symptom.canPhoto ? (
        image ? (
          <View style={styles.previewRow}>
            <Image
              source={{ uri: image.uri }}
              style={styles.preview}
              resizeMode="cover"
              accessibilityLabel={`Photo attached for ${symptom.name}`}
            />
            <View style={styles.previewActions}>
              <Text style={styles.previewLabel}>Photo attached</Text>
              <View style={styles.previewButtons}>
                <Pressable
                  onPress={() => onAddPhoto(symptom)}
                  accessibilityRole="button"
                  accessibilityLabel={`Replace photo for ${symptom.name}`}
                  hitSlop={8}
                  style={({ pressed }) => [styles.smallBtn, pressed && styles.pressed]}
                >
                  <Text style={styles.smallBtnText}>Replace</Text>
                </Pressable>
                <Pressable
                  onPress={() => onRemovePhoto(symptom.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove photo for ${symptom.name}`}
                  hitSlop={8}
                  style={({ pressed }) => [styles.smallBtn, styles.smallBtnDanger, pressed && styles.pressed]}
                >
                  <Text style={[styles.smallBtnText, { color: COLORS.danger }]}>Remove</Text>
                </Pressable>
              </View>
            </View>
          </View>
        ) : (
          <Pressable
            onPress={() => onAddPhoto(symptom)}
            accessibilityRole="button"
            accessibilityLabel={`Add a photo for ${symptom.name}`}
            accessibilityHint={symptom.photoGuide}
            style={({ pressed }) => [
              styles.addPhotoBtn,
              { borderColor: organ.colorLight },
              pressed && styles.pressed,
            ]}
          >
            <Ionicons name="camera-outline" size={17} color={organ.color} />
            <Text style={[styles.addPhotoText, { color: organ.color }]}>Add photo</Text>
          </Pressable>
        )
      ) : (
        <View style={styles.noPhotoNote}>
          <Ionicons name="eye-off-outline" size={13} color={COLORS.textMuted} />
          <Text style={styles.noPhotoText}>
            Cannot be photographed — tick it if it applies
          </Text>
        </View>
      )}
    </View>
  );
});

const SEVERITY = {
  critical: { color: '#7F1D1D', bg: '#FEE2E2', label: 'Critical' },
  high: { color: '#9A3412', bg: '#FFEDD5', label: 'High' },
  medium: { color: '#854D0E', bg: '#FEF9C3', label: 'Medium' },
  low: { color: '#065F46', bg: '#D1FAE5', label: 'Mild' },
};

function SeverityBadge({ severity }) {
  const config = SEVERITY[severity] ?? SEVERITY.medium;
  return (
    // Severity is conveyed by the word, not only by colour.
    <View style={[styles.badge, { backgroundColor: config.bg }]}>
      <Text style={[styles.badgeText, { color: config.color }]}>
        {config.label} severity
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  progressWrap: { marginTop: 14 },
  progressText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.9)',
    marginBottom: 6,
    fontWeight: '600',
  },
  progressBar: { height: 6, backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: 99 },
  progressFill: { height: '100%', backgroundColor: '#FFFFFF', borderRadius: 99 },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 190 },
  instructions: {
    fontSize: 13.5,
    color: COLORS.textSecondary,
    lineHeight: 20,
    marginBottom: 16,
    backgroundColor: COLORS.surface,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1.5,
    borderColor: COLORS.border,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    minHeight: 48,
    marginBottom: 10,
  },
  pressed: { opacity: 0.7 },
  symptomEmoji: { fontSize: 24, marginTop: 2 },
  symptomInfo: { flex: 1, gap: 5 },
  symptomName: { fontSize: 14.5, fontWeight: '700', color: COLORS.text, lineHeight: 20 },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: COLORS.gray300,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  symptomDesc: { fontSize: 13, color: COLORS.textSecondary, lineHeight: 19, marginBottom: 8 },
  whyRow: {
    flexDirection: 'row',
    gap: 6,
    backgroundColor: COLORS.primaryBg,
    padding: 10,
    borderRadius: 8,
    marginBottom: 10,
    alignItems: 'flex-start',
  },
  whyText: { flex: 1, fontSize: 12, lineHeight: 17, fontWeight: '500' },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 9, paddingVertical: 3, borderRadius: 99 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  addPhotoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: 10,
    minHeight: 48,
    paddingHorizontal: 14,
  },
  addPhotoText: { fontSize: 13.5, fontWeight: '700' },
  previewRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  preview: { width: 72, height: 72, borderRadius: 10, backgroundColor: COLORS.gray100 },
  previewActions: { flex: 1, gap: 8 },
  previewLabel: { fontSize: 12.5, fontWeight: '700', color: COLORS.success },
  previewButtons: { flexDirection: 'row', gap: 8 },
  smallBtn: {
    backgroundColor: COLORS.primaryBg,
    paddingHorizontal: 14,
    minHeight: 40,
    justifyContent: 'center',
    borderRadius: 8,
  },
  smallBtnDanger: { backgroundColor: COLORS.dangerBg },
  smallBtnText: { fontSize: 12.5, color: COLORS.primary, fontWeight: '700' },
  noPhotoNote: { flexDirection: 'row', gap: 5, alignItems: 'center' },
  noPhotoText: { fontSize: 11.5, color: COLORS.textMuted, flex: 1 },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
  },
  footerMeta: { marginTop: 10, alignItems: 'center', minHeight: 16 },
  footerMetaText: { fontSize: 11.5, color: COLORS.textMuted, textAlign: 'center' },
  blockingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(17,24,39,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  overlayCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    padding: 26,
    alignItems: 'center',
    gap: 12,
  },
  overlayTitle: { fontSize: 16.5, fontWeight: '800', color: COLORS.text, textAlign: 'center' },
  overlayText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 19,
  },
});
