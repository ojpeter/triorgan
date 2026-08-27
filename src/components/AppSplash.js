// ─────────────────────────────────────────────────────────────────────────────
// TriaCare launch screen.
//
// Concept — "vital sign": an ECG trace draws itself across a glass tile, a
// pulse ripples outward from it, then the wordmark resolves. The app screens
// heart, kidney and liver, so a vital-sign reading is the honest metaphor
// rather than a generic logo fade.
//
// Two constraints shaped the implementation:
//
//   1. The gradient's midpoint is SPLASH_MID, which is also the native splash's
//      backgroundColor in app.json. The tile sits where those meet, so the
//      native-to-JS handoff has nothing visible to hand off. Keep them in sync —
//      there is a test that fails if they drift.
//
//   2. Everything that can run on the UI thread does (transform + opacity, via
//      useNativeDriver). Only the trace's strokeDashoffset cannot, because it
//      is not a transform; it is a single interpolation and runs while the JS
//      thread is otherwise idle, waiting on two AsyncStorage reads.
//
// Honours "reduce motion": that setting exists partly for people who get
// vestibular symptoms from movement, and a health app should be the last one to
// ignore it. When set, the composed final frame renders immediately.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  AccessibilityInfo,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Circle, Defs, RadialGradient, Stop } from 'react-native-svg';

/** Must equal expo.splash.backgroundColor in app.json. */
export const SPLASH_MID = '#7C3AED';

const GRADIENT = ['#3B0764', SPLASH_MID, '#A78BFA'];

const AnimatedPath = Animated.createAnimatedComponent(Path);

// A single ECG cycle: flat baseline, P wave, the QRS spike, T wave, baseline.
// Drawn in a 120×48 viewBox and scaled, so it stays crisp at any density.
const TRACE = 'M2 24 H26 l5 -5 5 10 4 -22 6 39 5 -22 4 0 H74 l6 -9 5 9 H118';
const TRACE_LENGTH = 260; // Comfortably longer than the path; over-dashing is invisible.

export default function AppSplash({ tagline = 'Health Early Warning System' }) {
  const { width } = useWindowDimensions();
  const [reduceMotion, setReduceMotion] = useState(null);

  const tileSize = Math.min(Math.max(width * 0.30, 104), 148);

  // ── Animated values ────────────────────────────────────────────────────────
  const tile = useRef(new Animated.Value(0)).current; // scale + fade
  const draw = useRef(new Animated.Value(0)).current; // strokeDashoffset (JS thread)
  const word = useRef(new Animated.Value(0)).current; // wordmark
  const sub = useRef(new Animated.Value(0)).current; // tagline
  const ripple = useRef(new Animated.Value(0)).current; // expanding pulse ring
  const bar = useRef(new Animated.Value(0)).current; // progress sweep

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => alive && setReduceMotion(enabled))
      .catch(() => alive && setReduceMotion(false));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    // Wait until we know the motion preference, so we never start an animation
    // we are about to be told not to play.
    if (reduceMotion === null) return undefined;

    if (reduceMotion) {
      [tile, draw, word, sub].forEach((v) => v.setValue(1));
      return undefined;
    }

    const entrance = Animated.stagger(140, [
      Animated.timing(tile, {
        toValue: 1,
        duration: 520,
        easing: Easing.bezier(0.16, 1, 0.3, 1), // expo-out: settles, never bounces
        useNativeDriver: true,
      }),
      Animated.timing(word, {
        toValue: 1,
        duration: 460,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(sub, {
        toValue: 1,
        duration: 460,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]);

    // The trace draws slightly ahead of the wordmark, so the eye reads
    // "reading taken → identity" rather than the two arriving together.
    const trace = Animated.sequence([
      Animated.delay(220),
      Animated.timing(draw, {
        toValue: 1,
        duration: 900,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: false, // strokeDashoffset is not a transform
      }),
    ]);

    const rippleLoop = Animated.loop(
      Animated.sequence([
        Animated.delay(700),
        Animated.timing(ripple, {
          toValue: 1,
          duration: 1900,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(ripple, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    );

    const barLoop = Animated.loop(
      Animated.timing(bar, {
        toValue: 1,
        duration: 1400,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      })
    );

    entrance.start();
    trace.start();
    rippleLoop.start();
    barLoop.start();

    return () => {
      entrance.stop();
      trace.stop();
      rippleLoop.stop();
      barLoop.stop();
    };
  }, [reduceMotion, tile, draw, word, sub, ripple, bar]);

  // ── Derived styles ─────────────────────────────────────────────────────────
  const tileStyle = useMemo(
    () => ({
      opacity: tile,
      transform: [{ scale: tile.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1] }) }],
    }),
    [tile]
  );

  const wordStyle = useMemo(
    () => ({
      opacity: word,
      transform: [{ translateY: word.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
    }),
    [word]
  );

  const subStyle = useMemo(
    () => ({
      opacity: sub.interpolate({ inputRange: [0, 1], outputRange: [0, 0.85] }),
      transform: [{ translateY: sub.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
    }),
    [sub]
  );

  const rippleStyle = useMemo(
    () => ({
      opacity: ripple.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.28, 0] }),
      transform: [{ scale: ripple.interpolate({ inputRange: [0, 1], outputRange: [0.9, 2.1] }) }],
    }),
    [ripple]
  );

  const barStyle = useMemo(
    () => ({
      transform: [
        { translateX: bar.interpolate({ inputRange: [0, 1], outputRange: [-72, 72] }) },
        { scaleX: bar.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.4, 1, 0.4] }) },
      ],
    }),
    [bar]
  );

  const dashOffset = draw.interpolate({
    inputRange: [0, 1],
    outputRange: [TRACE_LENGTH, 0],
  });

  // Hold the frame until the motion preference is known — one tick, and it
  // avoids a flash of animation for someone who asked for none.
  if (reduceMotion === null) {
    return <View style={[styles.container, { backgroundColor: SPLASH_MID }]} />;
  }

  return (
    <LinearGradient
      colors={GRADIENT}
      locations={[0, 0.55, 1]}
      start={{ x: 0.15, y: 0 }}
      end={{ x: 0.85, y: 1 }}
      style={styles.container}
      // The screen speaks once, as a unit. Announcing a spinner and three
      // decorative shapes separately is noise.
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="TriaCare is starting"
      accessibilityLiveRegion="polite"
    >
      {/* Depth: a soft radial bloom behind the mark, and a cooler one low-left.
          Rendered in SVG so they stay smooth instead of banding. */}
      <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <RadialGradient id="bloom" cx="50%" cy="38%" r="55%">
            <Stop offset="0%" stopColor="#C4B5FD" stopOpacity="0.30" />
            <Stop offset="100%" stopColor="#C4B5FD" stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id="cool" cx="12%" cy="88%" r="45%">
            <Stop offset="0%" stopColor="#5EEAD4" stopOpacity="0.16" />
            <Stop offset="100%" stopColor="#5EEAD4" stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Circle cx="50%" cy="38%" r="55%" fill="url(#bloom)" />
        <Circle cx="12%" cy="88%" r="45%" fill="url(#cool)" />
      </Svg>

      <View style={styles.stage}>
        <View style={styles.markArea}>
          {/* Pulse propagating outward from the reading. */}
          {!reduceMotion && (
            <Animated.View
              style={[
                styles.ripple,
                { width: tileSize, height: tileSize, borderRadius: tileSize * 0.32 },
                rippleStyle,
              ]}
            />
          )}

          <Animated.View
            style={[
              styles.tile,
              { width: tileSize, height: tileSize, borderRadius: tileSize * 0.32 },
              tileStyle,
            ]}
          >
            <Svg width={tileSize * 0.66} height={tileSize * 0.3} viewBox="0 0 120 48">
              {/* Ghost of the full trace, so the line has somewhere to arrive. */}
              <Path
                d={TRACE}
                stroke="#FFFFFF"
                strokeOpacity={0.22}
                strokeWidth={4}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
              <AnimatedPath
                d={TRACE}
                stroke="#FFFFFF"
                strokeWidth={4}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
                strokeDasharray={TRACE_LENGTH}
                strokeDashoffset={reduceMotion ? 0 : dashOffset}
              />
            </Svg>
          </Animated.View>
        </View>

        <Animated.Text style={[styles.wordmark, wordStyle]} maxFontSizeMultiplier={1.25}>
          TriaCare
        </Animated.Text>

        <Animated.Text style={[styles.tagline, subStyle]} maxFontSizeMultiplier={1.35}>
          {tagline}
        </Animated.Text>

        {/* Indeterminate sweep. Reads as "working" without the stuck-spinner
            connotation, and collapses to a static rule under reduce-motion. */}
        <View
          style={styles.track}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {reduceMotion ? (
            <View style={[styles.sweep, styles.sweepStatic]} />
          ) : (
            <Animated.View style={[styles.sweep, barStyle]} />
          )}
        </View>
      </View>

      <Text style={styles.footer} maxFontSizeMultiplier={1.25}>
        by GOMO Technologies
      </Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  stage: { alignItems: 'center' },
  markArea: { alignItems: 'center', justifyContent: 'center' },
  ripple: {
    position: 'absolute',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  tile: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
    // Lifts the tile off the gradient; harmless where shadows are unsupported.
    shadowColor: '#1E0A3C',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.35,
    shadowRadius: 28,
    elevation: 12,
  },
  wordmark: {
    marginTop: 30,
    fontSize: 36,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.8,
  },
  tagline: {
    marginTop: 8,
    fontSize: 13.5,
    fontWeight: '500',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  track: {
    marginTop: 38,
    width: 144,
    height: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.18)',
    overflow: 'hidden',
    justifyContent: 'center',
  },
  sweep: {
    width: 56,
    height: 3,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
  },
  sweepStatic: { width: '100%', opacity: 0.7 },
  footer: {
    position: 'absolute',
    bottom: 44,
    fontSize: 11.5,
    fontWeight: '500',
    color: '#FFFFFF',
    opacity: 0.62,
    letterSpacing: 0.4,
  },
});
