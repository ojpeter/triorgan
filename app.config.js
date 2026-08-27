// ─────────────────────────────────────────────────────────────────────────────
// Expo dynamic config.
//
// Everything environment-specific lives here, NOT in source files. Values are
// resolved at build time and read at runtime via `src/config/env.js`.
//
// IMPORTANT: never put a secret in `extra`. Anything here is embedded in the
// app bundle and is readable by anyone who downloads the app. API keys belong
// on the backend only — see BACKEND.md.
//
// Select an environment with EAS_BUILD_PROFILE (set automatically by EAS Build)
// or by exporting APP_ENV locally:
//   APP_ENV=development npx expo start
// ─────────────────────────────────────────────────────────────────────────────

const ENVIRONMENTS = {
  development: {
    // Local backend. Override per-machine without editing this file:
    //   EXPO_PUBLIC_API_BASE=http://192.168.1.50:8000/api/v1 npx expo start
    apiBase: process.env.EXPO_PUBLIC_API_BASE || 'http://10.44.201.158:8000/api/v1',
    // Allows the app to run against a local wallet stub before the payment
    // endpoints ship. Forced off in preview/production — see src/config/env.js.
    allowLocalWalletFallback: true,
    // Cleartext HTTP is required only to reach a local dev backend over the LAN.
    allowCleartext: true,
  },
  preview: {
    apiBase: process.env.EXPO_PUBLIC_API_BASE || 'https://triorgan-backend.onrender.com/api/v1',
    allowLocalWalletFallback: false,
    allowCleartext: false,
  },
  production: {
    apiBase: 'https://triorgan-backend.onrender.com/api/v1',
    allowLocalWalletFallback: false,
    allowCleartext: false,
  },
};

const profile = process.env.APP_ENV || process.env.EAS_BUILD_PROFILE || 'development';
const env = ENVIRONMENTS[profile] || ENVIRONMENTS.development;

module.exports = ({ config }) => ({
  ...config,
  extra: {
    ...config.extra,
    appEnv: profile,
    apiBase: env.apiBase,
    allowLocalWalletFallback: env.allowLocalWalletFallback,
    // Mirrored here so the release check in CI can read it. The build itself is
    // governed by the expo-build-properties plugin below.
    allowCleartext: env.allowCleartext,
  },
  plugins: [
    ...(config.plugins ?? []),
    [
      // SDK 54 generates the native splash from this plugin. The legacy
      // `expo.splash` key in app.json is the older path, and leaving only that
      // set is how a stale splash survives a config change.
      //
      // No `image` on purpose: the animated launch screen (src/components/
      // AppSplash.js) assembles the mark itself, so a static one here would
      // show the finished artwork before the animation rebuilds it. The colour
      // is read from app.json so the two cannot drift.
      'expo-splash-screen',
      {
        backgroundColor: config.splash?.backgroundColor ?? '#5B21B6',
        // Keep the launch screen dark-mode-stable; the gradient is the same
        // either way.
        dark: { backgroundColor: config.splash?.backgroundColor ?? '#5B21B6' },
      },
    ],
    [
      // Android blocks cleartext HTTP by default from API 28 up, and iOS ATS
      // blocks it too. This opens it for development only; release builds are
      // HTTPS-only, which is also a Play Store expectation.
      //
      // NOTE: `android.usesCleartextTraffic` is not a valid top-level Expo
      // config field — it has to go through this plugin. expo-doctor catches
      // that; the schema check is worth keeping in CI.
      'expo-build-properties',
      {
        android: { usesCleartextTraffic: env.allowCleartext },
      },
    ],
  ],
});
