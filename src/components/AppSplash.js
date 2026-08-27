// ─────────────────────────────────────────────────────────────────────────────
// TriaCare launch screen — the triad assembling.
//
// The app icon is the brand: three organs (heart, kidney, liver) held in a
// triangle inside concentric rings. "Tria" is three. So the launch screen does
// not invent a mark — it builds the one you already have, then hands off to a
// static icon that matches what just finished animating.
//
// Sequence: rings scan outward → the three nodes drop in, in organ order →
// the triangle draws between them → the wordmark resolves.
//
// Colour carries the meaning here. Each node uses that organ's colour from
// src/constants/colors.js, the same colours the organ cards and result screens
// use, so the palette is learned in the first two seconds of the app's life.
//
// The gradient matches the icon's own purple so the native splash (a flat
// SPLASH_MID with the icon on it) and this screen are continuous. A test fails
// if app.json and SPLASH_MID drift apart.
//
// Honours the system reduce-motion setting: the assembled frame renders at
// once. Motion sensitivity is a real accessibility need and a health app is a
// poor place to ignore it.
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
import Svg, { Circle, Line, Path } from 'react-native-svg';

/** Must equal expo.splash.backgroundColor in app.json. */
export const SPLASH_MID = '#5B21B6';

/** Sampled from assets/splash-icon.png so the two read as one artwork. */
const GRADIENT = ['#7E22CE', SPLASH_MID, '#4C1D95'];

// Organ glyphs, drawn in a 24×24 box and centred on each node.
// Simplified silhouettes: at node size these read as shape and colour, and a
// more literal anatomical drawing would only turn to mud.
const GLYPHS = {
  heart: {
    color: '#DC2626',
    d: 'M12 20.5C12 20.5 4.5 15.8 4.5 10.6A4.1 4.1 0 0 1 12 8.2a4.1 4.1 0 0 1 7.5 2.4c0 5.2-7.5 9.9-7.5 9.9z',
  },
  kidney: {
    color: '#0E7490',
    d: 'M14.6 3.6c3.1 0 5.2 3 5.2 7.4 0 5.2-2.9 9.4-6.6 9.4-2.4 0-3.9-1.5-3.9-3.2 0-2.5 3-2.7 3-4.8 0-2.3-3.2-2.1-3.2-4.9 0-2.3 2.4-3.9 5.5-3.9z',
  },
  liver: {
    color: '#B45309',
    d: 'M4.2 8.1c3.9-2.9 9.7-3.8 14.6-1.9 1 .4 1.4 1.6 1 2.5l-2.9 6.8c-.6 1.4-2 2.3-3.5 2.3H8.1a3.9 3.9 0 0 1-3.9-3.9V8.1z',
  },
};

// Node order is the order the app lists organs in, so the animation teaches the
// same sequence the Home screen uses.
const NODES = [
  { key: 'heart', label: 'Heart', angle: -90 },
  { key: 'kidney', label: 'Kidney', angle: 150 },
  { key: 'liver', label: 'Liver', angle: 30 },
];

const polar = (angleDeg, radius, cx, cy) => {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) };
};

export default function AppSplash({ tagline = 'Heart · Kidney · Liver' }) {
  const { width } = useWindowDimensions();
  const [reduceMotion, setReduceMotion] = useState(null);

  // The mark is the hero: big enough to be the subject, not an app-icon
  // floating in space.
  const size = Math.min(Math.max(width * 0.62, 220), 320);
  const cx = size / 2;
  const cy = size / 2;
  const orbit = size * 0.23;
  const nodeR = size * 0.115;

  const positions = useMemo(
    () => NODES.map((n) => ({ ...n, ...polar(n.angle, orbit, cx, cy) })),
    [orbit, cx, cy]
  );

  // ── Animated values ────────────────────────────────────────────────────────
  const rings = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;
  const nodes = useRef(NODES.map(() => new Animated.Value(0))).current;
  const web = useRef(new Animated.Value(0)).current;
  const word = useRef(new Animated.Value(0)).current;
  const scan = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((on) => alive && setReduceMotion(on))
      .catch(() => alive && setReduceMotion(false));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (reduceMotion === null) return undefined;

    if (reduceMotion) {
      [...rings, ...nodes, web, word].forEach((v) => v.setValue(1));
      return undefined;
    }

    // Rings sweep outward first — the "scan" that finds the organs.
    const ringIn = Animated.stagger(
      110,
      rings.map((v) =>
        Animated.timing(v, {
          toValue: 1,
          duration: 620,
          easing: Easing.bezier(0.16, 1, 0.3, 1),
          useNativeDriver: true,
        })
      )
    );

    // Then each organ lands, in the app's own organ order.
    const nodesIn = Animated.stagger(
      130,
      nodes.map((v) =>
        Animated.timing(v, {
          toValue: 1,
          duration: 520,
          easing: Easing.bezier(0.16, 1, 0.3, 1),
          useNativeDriver: true,
        })
      )
    );

    const webIn = Animated.timing(web, {
      toValue: 1,
      duration: 460,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });

    const wordIn = Animated.timing(word, {
      toValue: 1,
      duration: 520,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });

    const intro = Animated.sequence([
      ringIn,
      Animated.parallel([nodesIn, Animated.sequence([Animated.delay(260), webIn])]),
      wordIn,
    ]);

    // A slow continuous scan ring, so a slow start still feels alive.
    const scanLoop = Animated.loop(
      Animated.sequence([
        Animated.delay(1500),
        Animated.timing(scan, {
          toValue: 1,
          duration: 2200,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(scan, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    );

    intro.start();
    scanLoop.start();
    return () => {
      intro.stop();
      scanLoop.stop();
    };
  }, [reduceMotion, rings, nodes, web, word, scan]);

  // Hold a frame of the native splash's own colour while the motion preference
  // is read — one tick, and indistinguishable from what is already on screen.
  if (reduceMotion === null) {
    return <View style={[styles.container, { backgroundColor: SPLASH_MID }]} />;
  }

  return (
    <LinearGradient
      colors={GRADIENT}
      locations={[0, 0.5, 1]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.container}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="TriaCare is starting"
      accessibilityLiveRegion="polite"
    >
      <View style={styles.stage}>
        <View style={{ width: size, height: size }}>
          {/* Continuous outward scan, behind the mark. */}
          {!reduceMotion && (
            <Animated.View
              style={[
                StyleSheet.absoluteFill,
                {
                  opacity: scan.interpolate({
                    inputRange: [0, 0.1, 1],
                    outputRange: [0, 0.22, 0],
                  }),
                  transform: [
                    { scale: scan.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1.5] }) },
                  ],
                },
              ]}
            >
              <Svg width={size} height={size}>
                <Circle
                  cx={cx}
                  cy={cy}
                  r={size * 0.44}
                  stroke="#FFFFFF"
                  strokeWidth={1.5}
                  fill="none"
                />
              </Svg>
            </Animated.View>
          )}

          {/* Concentric rings — straight from the icon. */}
          {rings.map((value, i) => (
            <Animated.View
              key={`ring-${i}`}
              style={[
                StyleSheet.absoluteFill,
                {
                  opacity: value.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, 0.34 - i * 0.07],
                  }),
                  transform: [
                    { scale: value.interpolate({ inputRange: [0, 1], outputRange: [0.72, 1] }) },
                  ],
                },
              ]}
            >
              <Svg width={size} height={size}>
                <Circle
                  cx={cx}
                  cy={cy}
                  r={size * (0.44 - i * 0.075)}
                  stroke="#FFFFFF"
                  strokeWidth={1.5}
                  fill="none"
                />
              </Svg>
            </Animated.View>
          ))}

          {/* The triangle that binds the three. */}
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: web }]}>
            <Svg width={size} height={size}>
              {positions.map((from, i) => {
                const to = positions[(i + 1) % positions.length];
                return (
                  <Line
                    key={`edge-${from.key}`}
                    x1={from.x}
                    y1={from.y}
                    x2={to.x}
                    y2={to.y}
                    stroke="#FFFFFF"
                    strokeOpacity={0.55}
                    strokeWidth={1.25}
                  />
                );
              })}
            </Svg>
          </Animated.View>

          {/* The organs. */}
          {positions.map((node, i) => {
            const glyph = GLYPHS[node.key];
            const value = nodes[i];
            return (
              <Animated.View
                key={node.key}
                style={[
                  styles.node,
                  {
                    width: nodeR * 2,
                    height: nodeR * 2,
                    borderRadius: nodeR,
                    left: node.x - nodeR,
                    top: node.y - nodeR,
                    opacity: value,
                    transform: [
                      { scale: value.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) },
                    ],
                  },
                ]}
              >
                <Svg width={nodeR * 1.25} height={nodeR * 1.25} viewBox="0 0 24 24">
                  <Path d={glyph.d} fill={glyph.color} />
                </Svg>
              </Animated.View>
            );
          })}
        </View>

        <Animated.Text
          style={[
            styles.wordmark,
            {
              opacity: word,
              transform: [
                { translateY: word.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) },
              ],
            },
          ]}
          maxFontSizeMultiplier={1.25}
        >
          TriaCare
        </Animated.Text>

        <Animated.Text
          style={[styles.tagline, { opacity: word.interpolate({ inputRange: [0, 1], outputRange: [0, 0.82] }) }]}
          maxFontSizeMultiplier={1.35}
        >
          {tagline}
        </Animated.Text>
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
  node: {
    position: 'absolute',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#1E0A3C',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },
  wordmark: {
    marginTop: 26,
    fontSize: 38,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.9,
  },
  tagline: {
    marginTop: 10,
    fontSize: 12.5,
    fontWeight: '600',
    color: '#FFFFFF',
    letterSpacing: 2.4,
    textTransform: 'uppercase',
  },
  footer: {
    position: 'absolute',
    bottom: 44,
    fontSize: 11.5,
    fontWeight: '500',
    color: '#FFFFFF',
    opacity: 0.6,
    letterSpacing: 0.4,
  },
});
