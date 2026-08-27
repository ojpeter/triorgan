// ─────────────────────────────────────────────────────────────────────────────
// Branded loading screen.
//
// This replaces a bare ActivityIndicator on a near-white background. The old
// sequence was: purple native splash → hard cut to #F7F5FF with a lone spinner
// → the app. That white flash between two purple screens read as a glitch.
//
// The gradient's midpoint is #7C3AED, which is also the native splash's
// backgroundColor in app.json, so the handoff from native to JS is invisible —
// the logo simply stays put while the rest fades in. Keep those two in sync.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

/** Must match expo.splash.backgroundColor in app.json. */
export const SPLASH_MID = '#7C3AED';
const SPLASH_GRADIENT = ['#4C1D95', SPLASH_MID, '#8B5CF6'];

export default function BrandSplash({ tagline = 'Health Early Warning System' }) {
  const { width } = useWindowDimensions();

  // Gentle fade-and-rise, so the screen feels like it is arriving rather than
  // just sitting there. Native driver: this must not compete with the JS thread
  // while the session is being restored.
  const fade = useRef(new Animated.Value(0)).current;
  const rise = useRef(new Animated.Value(12)).current;
  // One value per dot so they can be offset in time.
  const dots = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, {
        toValue: 1,
        duration: 420,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(rise, {
        toValue: 0,
        duration: 480,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();

    const loops = dots.map((value, i) =>
      Animated.loop(
        Animated.sequence([
          // Each dot starts 160ms after the one before it, so the row reads as
          // a travelling wave rather than three lights blinking together.
          Animated.delay(i * 160),
          Animated.timing(value, {
            toValue: 1,
            duration: 520,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(value, {
            toValue: 0,
            duration: 520,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.delay((dots.length - 1 - i) * 160),
        ])
      )
    );
    loops.forEach((loop) => loop.start());
    return () => loops.forEach((loop) => loop.stop());
  }, [fade, rise, dots]);

  return (
    <LinearGradient
      colors={SPLASH_GRADIENT}
      start={{ x: 0.1, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={styles.container}
      // One announcement for the whole screen rather than a bare "progress bar".
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="TriaCare is starting"
      accessibilityLiveRegion="polite"
    >
      {/* Soft ambient shapes — the same motif the onboarding slides use, so the
          app looks like one product rather than two. */}
      <View style={[styles.orb, styles.orbTop, { width: width * 0.95, height: width * 0.95 }]} />
      <View style={[styles.orb, styles.orbBottom, { width: width * 0.7, height: width * 0.7 }]} />

      <Animated.View
        style={[styles.content, { opacity: fade, transform: [{ translateY: rise }] }]}
      >
        <View style={styles.mark}>
          <Ionicons name="pulse" size={38} color="#FFFFFF" />
        </View>

        <Text style={styles.wordmark} maxFontSizeMultiplier={1.3}>
          TriaCare
        </Text>
        <Text style={styles.tagline} maxFontSizeMultiplier={1.4}>
          {tagline}
        </Text>

        {/* Three pulsing dots instead of a spinner — quieter, and it reads as
            brand rather than as "the app is stuck". */}
        <View style={styles.dots} accessibilityElementsHidden importantForAccessibility="no">
          {dots.map((value, i) => (
            <Animated.View
              key={i}
              style={[
                styles.dot,
                i > 0 && styles.dotSpacing,
                {
                  opacity: value.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }),
                  transform: [
                    { scale: value.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1.15] }) },
                  ],
                },
              ]}
            />
          ))}
        </View>
      </Animated.View>

      <Text style={styles.footer} maxFontSizeMultiplier={1.3}>
        by GOMO Technologies
      </Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  orb: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  orbTop: { top: '-22%', right: '-30%' },
  orbBottom: { bottom: '-12%', left: '-25%' },
  content: { alignItems: 'center' },
  mark: {
    width: 84,
    height: 84,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  wordmark: {
    fontSize: 34,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.6,
  },
  tagline: {
    fontSize: 13.5,
    // 0.85 keeps this above WCAG AA on the mid-purple behind it.
    color: 'rgba(255,255,255,0.85)',
    marginTop: 6,
    fontWeight: '500',
  },
  dots: { flexDirection: 'row', marginTop: 34 },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
  },
  footer: {
    position: 'absolute',
    bottom: 46,
    fontSize: 11.5,
    color: 'rgba(255,255,255,0.65)',
    fontWeight: '500',
    letterSpacing: 0.3,
  },
});
