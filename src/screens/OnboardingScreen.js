import React, { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, Dimensions, TouchableOpacity,
  StatusBar, Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { setOnboarded } from '../services/authService';

const { width, height } = Dimensions.get('window');

const SLIDES = [
  {
    id: '1', emoji: '🫀',
    title: 'Early Warning\nSaves Lives',
    subtitle: 'Most heart, kidney and liver diseases are detected too late in Africa. HeLiK puts early detection in your pocket.',
    grad: ['#5B21B6', '#7C3AED'], accent: '#DDD6FE',
  },
  {
    id: '2', emoji: '📸',
    title: 'Check Visible\nWarning Signs',
    subtitle: 'Select symptoms you can see on your body — eyelids, nails, skin, palms. Optionally add a photo for better AI analysis.',
    grad: ['#991B1B', '#DC2626'], accent: '#FECACA',
  },
  {
    id: '3', emoji: '🤖',
    title: 'AI-Powered\nHealth Screening',
    subtitle: 'Our AI analyses your inputs and gives you a risk assessment, recommendations and health education — in seconds.',
    grad: ['#0E7490', '#0891B2'], accent: '#A5F3FC',
  },
  {
    id: '4', emoji: '🌍',
    title: 'Built for\nEast Africa',
    subtitle: 'Designed for Ugandan and East African communities. Works offline, respects your privacy, and keeps your data on your device.',
    grad: ['#065F46', '#059669'], accent: '#A7F3D0',
  },
];

export default function OnboardingScreen({ navigation }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const flatRef = useRef(null);
  const scrollX = useRef(new Animated.Value(0)).current;

  const goNext = () => {
    if (activeIndex < SLIDES.length - 1) {
      flatRef.current?.scrollToIndex({ index: activeIndex + 1, animated: true });
    } else { handleFinish(); }
  };

  const handleFinish = async () => {
    await setOnboarded();
    navigation.replace('Login');
  };

  const onScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { x: scrollX } } }],
    { useNativeDriver: false }
  );

  const onMomentumEnd = (e) => {
    const index = Math.round(e.nativeEvent.contentOffset.x / width);
    setActiveIndex(index);
  };

  const current = SLIDES[activeIndex];

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <Animated.FlatList
        ref={flatRef}
        data={SLIDES}
        keyExtractor={i => i.id}
        horizontal pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        onMomentumScrollEnd={onMomentumEnd}
        renderItem={({ item, index }) => (
          <LinearGradient
            colors={item.grad}
            style={styles.slide}
            accessible
            accessibilityLabel={`Slide ${index + 1} of ${SLIDES.length}. ${item.title.replace(/\n/g, ' ')}. ${item.subtitle}`}
          >
            <View style={[styles.circle1, { backgroundColor: item.accent + '25' }]} />
            <View style={[styles.circle2, { backgroundColor: item.accent + '18' }]} />
            <View style={styles.slideContent}>
              <View style={[styles.logoPill, { backgroundColor: item.accent + '30' }]}>
                <Text style={[styles.logoText, { color: item.accent }]}>HeLiK</Text>
              </View>
              <View style={[styles.emojiWrapper, { backgroundColor: item.accent + '22' }]}>
                <Text style={styles.emoji} accessibilityElementsHidden>{item.emoji}</Text>
              </View>
              <Text style={styles.title}>{item.title}</Text>
              <Text style={styles.subtitle}>{item.subtitle}</Text>
            </View>
          </LinearGradient>
        )}
      />
      <LinearGradient colors={current.grad} style={styles.controls} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
        <View
          style={styles.dots}
          accessibilityRole="progressbar"
          accessibilityLabel={`Step ${activeIndex + 1} of ${SLIDES.length}`}
        >
          {SLIDES.map((_, i) => (
            <View key={i} style={[styles.dot, i === activeIndex ? styles.dotActive : { backgroundColor: 'rgba(255,255,255,0.35)' }]} />
          ))}
        </View>
        <View style={styles.btnRow}>
          {activeIndex < SLIDES.length - 1 ? (
            <>
              <TouchableOpacity
                onPress={handleFinish}
                style={styles.skipBtn}
                accessibilityRole="button"
                accessibilityLabel="Skip the introduction"
              >
                <Text style={styles.skipTxt}>Skip</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={goNext}
                style={styles.nextBtn}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={`Next, slide ${activeIndex + 2} of ${SLIDES.length}`}
              >
                <Text style={styles.nextTxt}>Next</Text>
                <Ionicons name="arrow-forward" size={16} color="#7C3AED" />
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity
              onPress={handleFinish}
              style={styles.getStartedBtn}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Get started"
            >
              <Text style={styles.getStartedTxt}>Get Started</Text>
              <Ionicons name="arrow-forward" size={18} color="#7C3AED" />
            </TouchableOpacity>
          )}
        </View>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  slide: { width, height, overflow: 'hidden' },
  circle1: { position: 'absolute', width: 340, height: 340, borderRadius: 170, top: -80, right: -80 },
  circle2: { position: 'absolute', width: 240, height: 240, borderRadius: 120, bottom: 160, left: -60 },
  slideContent: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, paddingBottom: 180 },
  logoPill: { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 99, marginBottom: 36 },
  logoText: { fontSize: 13, fontWeight: '700', letterSpacing: 0.5 },
  emojiWrapper: { width: 120, height: 120, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: 32 },
  emoji: { fontSize: 56 },
  title: { fontSize: 34, fontWeight: '800', color: '#FFFFFF', textAlign: 'center', letterSpacing: -0.8, lineHeight: 40, marginBottom: 18 },
  subtitle: { fontSize: 15.5, color: 'rgba(255,255,255,0.92)', textAlign: 'center', lineHeight: 24, maxWidth: 300 },
  controls: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingTop: 20, paddingBottom: 44, paddingHorizontal: 28 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 7, marginBottom: 22 },
  dot: { width: 7, height: 7, borderRadius: 99 },
  dotActive: { width: 24, height: 7, borderRadius: 99, backgroundColor: '#FFFFFF' },
  btnRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  skipBtn: { paddingHorizontal: 20, minHeight: 48, justifyContent: 'center' },
  skipTxt: { fontSize: 15, color: 'rgba(255,255,255,0.7)', fontWeight: '600' },
  nextBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFFFFF', paddingHorizontal: 24, minHeight: 48, borderRadius: 99 },
  nextTxt: { fontSize: 15, fontWeight: '700', color: '#7C3AED' },
  getStartedBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#FFFFFF', minHeight: 52, borderRadius: 99 },
  getStartedTxt: { fontSize: 16, fontWeight: '800', color: '#7C3AED' },
});
