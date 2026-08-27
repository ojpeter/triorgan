// ─────────────────────────────────────────────────────────────────────────────
// TriaCare launch screen — the three organs arrive, meet, and settle.
//
// Choreography:
//   1. Heart, kidney and liver bounce in from off-screen, each along its own
//      axis (heart from above, kidney from the lower left, liver from the
//      lower right) so nothing crosses paths.
//   2. They huddle tight at the centre. A soft ring flashes on impact.
//   3. They relax outward into the triad from the app icon, the connecting
//      triangle draws, the rings bloom, and the wordmark resolves.
//
// Each node travels through three keyframes on a single Animated.Value — 0 is
// off-screen, 1 is the huddle, 2 is the resting triad — so the inbound bounce
// and the outward relax are one continuous motion rather than two animations
// fighting over the same transform.
//
// Colour does the explaining: each node carries that organ's colour from
// src/constants/colors.js, the same red/teal/amber the organ cards and result
// screens use.
//
// The gradient is sampled from assets/splash-icon.png, and app.json's flat
// splash colour equals SPLASH_MID, so the native splash and this screen are
// continuous. A test fails if those drift apart.
//
// Honours the system reduce-motion setting: the settled frame renders at once.
// Motion sensitivity is a real accessibility need and this is a health app.
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

// Organ glyphs in a 24×24 box. Simplified silhouettes — at node size these read
// as shape and colour, and a literal anatomical drawing would turn to mud.
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

// Angles match the app icon's arrangement. Each organ enters from beyond its
// own resting position, so the three never cross.
const NODES = [
  { key: 'heart', angle: -90 },
  { key: 'kidney', angle: 150 },
  { key: 'liver', angle: 30 },
];

/** How tightly they cluster when they meet, as a fraction of the resting orbit. */
const HUDDLE = 0.26;
/** How far off-screen they start, as a multiple of the mark's size. */
const ENTRY = 1.5;

const polar = (angleDeg, radius) => {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: radius * Math.cos(rad), y: radius * Math.sin(rad) };
};

export default function AppSplash({ tagline = 'Heart · Kidney · Liver' }) {
  const { width } = useWindowDimensions();
  const [reduceMotion, setReduceMotion] = useState(null);

  const size = Math.min(Math.max(width * 0.62, 220), 320);
  const centre = size / 2;
  const orbit = size * 0.23;
  const nodeR = size * 0.115;

  // Three keyframes per node: off-screen → huddle → resting triad.
  const tracks = useMemo(
    () =>
      NODES.map((node) => ({
        ...node,
        from: polar(node.angle, size * ENTRY),
        meet: polar(node.angle, orbit * HUDDLE),
        rest: polar(node.angle, orbit),
      })),
    [size, orbit]
  );

  // ── Animated values ────────────────────────────────────────────────────────
  // One value per node, travelling 0 → 1 → 2.
  const travel = useRef(NODES.map(() => new Animated.Value(0))).current;
  const impact = useRef(new Animated.Value(0)).current; // flash when they meet
  const rings = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;
  const web = useRef(new Animated.Value(0)).current; // connecting triangle
  const word = useRef(new Animated.Value(0)).current;
  const breathe = useRef(new Animated.Value(0)).current; // resting pulse

  useEffect(() => {
    let alive = true;
    // Wrapped in Promise.resolve rather than calling .then directly: this API
    // is absent on some platforms and returns undefined under certain test
    // doubles, and the launch screen must never be the thing that takes the
    // whole app down. Anything unexpected falls back to "motion allowed".
    Promise.resolve()
      .then(() => AccessibilityInfo.isReduceMotionEnabled?.())
      .then((on) => alive && setReduceMotion(on === true))
      .catch(() => alive && setReduceMotion(false));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (reduceMotion === null) return undefined;

    if (reduceMotion) {
      travel.forEach((v) => v.setValue(2));
      [...rings, web, word].forEach((v) => v.setValue(1));
      return undefined;
    }

    // 1 — bounce in. Easing.bounce settles with a couple of real rebounds, so
    // the arrival reads as weight rather than a slide.
    const arrive = Animated.stagger(
      60,
      travel.map((v) =>
        Animated.timing(v, {
          toValue: 1,
          duration: 620,
          easing: Easing.bounce,
          useNativeDriver: true,
        })
      )
    );

    // 2 — the meeting registers.
    const flash = Animated.sequence([
      Animated.timing(impact, {
        toValue: 1,
        duration: 120,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(impact, {
        toValue: 0,
        duration: 460,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]);

    // 3 — relax apart. A gentle overshoot, so they ease into place and stop
    // rather than snapping.
    const relax = Animated.parallel([
      ...travel.map((v) =>
        Animated.timing(v, {
          toValue: 2,
          duration: 640,
          easing: Easing.out(Easing.back(1.4)),
          useNativeDriver: true,
        })
      ),
      Animated.stagger(
        70,
        rings.map((v) =>
          Animated.timing(v, {
            toValue: 1,
            duration: 520,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          })
        )
      ),
      Animated.sequence([
        Animated.delay(180),
        Animated.timing(web, {
          toValue: 1,
          duration: 420,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
      // The wordmark overlaps the relax rather than queueing behind it —
      // sequential stages are what pushed this past three seconds.
      Animated.sequence([
        Animated.delay(300),
        Animated.timing(word, {
          toValue: 1,
          duration: 440,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
    ]);

    const intro = Animated.sequence([
      arrive,
      Animated.parallel([flash, Animated.sequence([Animated.delay(150), relax])]),
    ]);

    // Once settled, a slow breath keeps the screen alive on a long start.
    const breatheLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, {
          toValue: 1,
          duration: 1800,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(breathe, {
          toValue: 0,
          duration: 1800,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );

    intro.start(({ finished }) => {
      if (finished) breatheLoop.start();
    });

    return () => {
      intro.stop();
      breatheLoop.stop();
    };
  }, [reduceMotion, travel, impact, rings, web, word, breathe]);

  // Hold a frame of the native splash's own colour while the motion preference
  // is read — one tick, indistinguishable from what is already on screen.
  if (reduceMotion === null) {
    return <View style={[styles.container, { backgroundColor: SPLASH_MID }]} />;
  }

  const breatheScale = breathe.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.035],
  });

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
        <Animated.View
          style={[
            { width: size, height: size },
            !reduceMotion && { transform: [{ scale: breatheScale }] },
          ]}
        >
          {/* Impact flash at the moment they meet. */}
          {!reduceMotion && (
            <Animated.View
              style={[
                StyleSheet.absoluteFill,
                {
                  opacity: impact.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, 0.5],
                  }),
                  transform: [
                    { scale: impact.interpolate({ inputRange: [0, 1], outputRange: [0.15, 1.1] }) },
                  ],
                },
              ]}
            >
              <Svg width={size} height={size}>
                <Circle
                  cx={centre}
                  cy={centre}
                  r={size * 0.3}
                  stroke="#FFFFFF"
                  strokeWidth={2}
                  fill="none"
                />
              </Svg>
            </Animated.View>
          )}

          {/* Concentric rings, straight from the app icon. */}
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
                    { scale: value.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) },
                  ],
                },
              ]}
            >
              <Svg width={size} height={size}>
                <Circle
                  cx={centre}
                  cy={centre}
                  r={size * (0.44 - i * 0.075)}
                  stroke="#FFFFFF"
                  strokeWidth={1.5}
                  fill="none"
                />
              </Svg>
            </Animated.View>
          ))}

          {/* The triangle binding the three, drawn once they have settled. */}
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: web }]}>
            <Svg width={size} height={size}>
              {tracks.map((from, i) => {
                const to = tracks[(i + 1) % tracks.length];
                return (
                  <Line
                    key={`edge-${from.key}`}
                    x1={centre + from.rest.x}
                    y1={centre + from.rest.y}
                    x2={centre + to.rest.x}
                    y2={centre + to.rest.y}
                    stroke="#FFFFFF"
                    strokeOpacity={0.55}
                    strokeWidth={1.25}
                  />
                );
              })}
            </Svg>
          </Animated.View>

          {/* The organs. */}
          {tracks.map((node, i) => {
            const glyph = GLYPHS[node.key];
            const t = travel[i];
            return (
              <Animated.View
                key={node.key}
                style={[
                  styles.node,
                  {
                    width: nodeR * 2,
                    height: nodeR * 2,
                    borderRadius: nodeR,
                    left: centre - nodeR,
                    top: centre - nodeR,
                    transform: [
                      {
                        translateX: t.interpolate({
                          inputRange: [0, 1, 2],
                          outputRange: [node.from.x, node.meet.x, node.rest.x],
                        }),
                      },
                      {
                        translateY: t.interpolate({
                          inputRange: [0, 1, 2],
                          outputRange: [node.from.y, node.meet.y, node.rest.y],
                        }),
                      },
                      {
                        // Slightly compressed in the huddle, full size at rest.
                        scale: t.interpolate({
                          inputRange: [0, 1, 2],
                          outputRange: [0.75, 0.88, 1],
                        }),
                      },
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
        </Animated.View>

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
          style={[
            styles.tagline,
            { opacity: word.interpolate({ inputRange: [0, 1], outputRange: [0, 0.82] }) },
          ]}
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
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
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
