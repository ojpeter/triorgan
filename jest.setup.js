/* eslint-env jest */
// Test environment wiring. Keep this thin — anything clever here hides bugs.

// AsyncStorage ships an official in-memory mock.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// src/config/env.js reads app.config.js -> expo.extra at runtime. Override only
// `expoConfig` and keep the rest of the real module — expo-asset (pulled in by
// @expo/vector-icons) reads other fields off it and crashes on a bare stub.
jest.mock('expo-constants', () => {
  const actual = jest.requireActual('expo-constants');
  return {
    ...actual,
    __esModule: true,
    default: {
      ...actual.default,
      expoConfig: {
        ...actual.default?.expoConfig,
        extra: {
          appEnv: 'test',
          apiBase: 'https://api.test.local/api/v1',
          allowLocalWalletFallback: true,
        },
      },
    },
  };
});

// Icon sets try to load real font files, which has no meaning under Jest.
// Render them as plain views carrying the icon name, so tests can still assert
// on an icon when they need to.
jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  const { View } = require('react-native');
  const Icon = ({ name, ...props }) =>
    React.createElement(View, { testID: `icon-${name}`, ...props });
  return {
    __esModule: true,
    Ionicons: Icon,
    MaterialIcons: Icon,
    MaterialCommunityIcons: Icon,
    FontAwesome: Icon,
    FontAwesome5: Icon,
    Feather: Icon,
    AntDesign: Icon,
    Entypo: Icon,
  };
});

// NOTE: react-native/Libraries/Animated/NativeAnimatedHelper was mocked here to
// silence a warning under SDK 51. React Native 0.81 removed that internal path,
// and jest-expo no longer emits the warning, so the mock is gone.
