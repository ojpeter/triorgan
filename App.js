import 'react-native-url-polyfill/auto';
import React, { useCallback, useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';

import { AuthProvider, useAuth } from './src/context/AuthContext';
import { WalletProvider } from './src/context/WalletContext';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import AppSplash from './src/components/AppSplash';
import { hasOnboarded } from './src/services/authService';
import { COLORS } from './src/constants/colors';

import OnboardingScreen from './src/screens/OnboardingScreen';
import LoginScreen from './src/screens/LoginScreen';
import RegisterScreen from './src/screens/RegisterScreen';
import ForgotPasswordScreen from './src/screens/ForgotPasswordScreen';
import HomeScreen from './src/screens/HomeScreen';
import DetectionScreen from './src/screens/DetectionScreen';
import ResultScreen from './src/screens/ResultScreen';
import EducationScreen from './src/screens/EducationScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import WalletScreen from './src/screens/WalletScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

// Keep the native splash up until the first real screen is ready to draw.
// Without this there is a blank frame between the native splash tearing down
// and React mounting. Failure here is not worth crashing over.
SplashScreen.preventAutoHideAsync().catch(() => {});

const stackOptions = { headerShown: false, animation: 'slide_from_right' };

// ── Tab stacks ───────────────────────────────────────────────────────────────

function HomeStack() {
  return (
    <Stack.Navigator screenOptions={stackOptions}>
      <Stack.Screen name="Home" component={HomeScreen} />
      <Stack.Screen name="Detection" component={DetectionScreen} />
      <Stack.Screen name="Result" component={ResultScreen} />
    </Stack.Navigator>
  );
}

function EducationStack() {
  return (
    <Stack.Navigator screenOptions={stackOptions}>
      <Stack.Screen name="EducationMain" component={EducationScreen} />
    </Stack.Navigator>
  );
}

function HistoryStack() {
  return (
    <Stack.Navigator screenOptions={stackOptions}>
      <Stack.Screen name="HistoryMain" component={HistoryScreen} />
    </Stack.Navigator>
  );
}

function WalletStack() {
  return (
    <Stack.Navigator screenOptions={stackOptions}>
      <Stack.Screen name="WalletMain" component={WalletScreen} />
    </Stack.Navigator>
  );
}

function ProfileStack() {
  return (
    <Stack.Navigator screenOptions={stackOptions}>
      <Stack.Screen name="ProfileMain" component={ProfileScreen} />
    </Stack.Navigator>
  );
}

// ── Tabs ─────────────────────────────────────────────────────────────────────

const TAB_ICONS = {
  HomeTab: ['home', 'home-outline'],
  EducationTab: ['book', 'book-outline'],
  HistoryTab: ['time', 'time-outline'],
  WalletTab: ['wallet', 'wallet-outline'],
  ProfileTab: ['person-circle', 'person-circle-outline'],
};

function MainApp() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: COLORS.primary,
        // Darker than the previous gray400, which failed contrast against the
        // white tab bar for the inactive labels.
        tabBarInactiveTintColor: COLORS.gray600,
        tabBarStyle: {
          backgroundColor: COLORS.surface,
          borderTopColor: COLORS.border,
          borderTopWidth: 1,
          height: 72,
          paddingBottom: 12,
          paddingTop: 8,
          elevation: 12,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.06,
          shadowRadius: 12,
        },
        tabBarLabelStyle: { fontSize: 10.5, fontWeight: '700', marginTop: 2 },
        tabBarIcon: ({ color, focused }) => {
          const [active, inactive] = TAB_ICONS[route.name] ?? ['ellipse', 'ellipse-outline'];
          return <Ionicons name={focused ? active : inactive} size={23} color={color} />;
        },
      })}
    >
      {/* `title` drives both the visible label and the accessibility label —
          the Home tab previously read out as "Screen". */}
      <Tab.Screen name="HomeTab" component={HomeStack} options={{ title: 'Home' }} />
      <Tab.Screen name="EducationTab" component={EducationStack} options={{ title: 'Learn' }} />
      <Tab.Screen name="HistoryTab" component={HistoryStack} options={{ title: 'History' }} />
      <Tab.Screen name="WalletTab" component={WalletStack} options={{ title: 'Wallet' }} />
      <Tab.Screen name="ProfileTab" component={ProfileStack} options={{ title: 'Profile' }} />
    </Tab.Navigator>
  );
}

// ── Root ─────────────────────────────────────────────────────────────────────

function RootNavigator() {
  const { user, loading } = useAuth();
  const [onboarded, setOnboarded] = useState(null);

  useEffect(() => {
    let alive = true;
    hasOnboarded().then((done) => {
      if (alive) setOnboarded(done);
    });
    return () => {
      alive = false;
    };
  }, []);

  const isReady = !loading && onboarded !== null;

  // Hand off from the native splash only once the first real screen has laid
  // out. Hiding it any earlier leaves a blank frame; the JS splash uses the
  // same purple, so the seam is invisible either way.
  const onLayout = useCallback(() => {
    if (isReady) SplashScreen.hideAsync().catch(() => {});
  }, [isReady]);

  if (!isReady) {
    return <AppSplash />;
  }

  // Auth state drives which stack exists, so screens never need to navigate
  // manually after signing in or out — that raced this swap and could leave a
  // signed-out user looking at a signed-in screen.
  return (
    <View style={styles.root} onLayout={onLayout}>
      <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
        {user ? (
          <Stack.Screen name="MainApp" component={MainApp} />
        ) : (
          <>
            {!onboarded && <Stack.Screen name="Onboarding" component={OnboardingScreen} />}
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Register" component={RegisterScreen} />
            <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
            {/* Guests may browse health education without an account. */}
            <Stack.Screen
              name="MainApp"
              component={MainApp}
              options={{ animation: 'slide_from_right' }}
            />
          </>
        )}
      </Stack.Navigator>
    </View>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <AuthProvider>
          <WalletProvider>
            <NavigationContainer>
              <StatusBar style="light" />
              <RootNavigator />
            </NavigationContainer>
          </WalletProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
});
