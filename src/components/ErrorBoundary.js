// ─────────────────────────────────────────────────────────────────────────────
// Top-level error boundary.
//
// Without one, any render-time throw takes the whole app to a blank white
// screen with no way back. A health app in the field needs a recoverable
// failure mode, not a force-quit.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { COLORS } from '../constants/colors';
import { AppButton } from './ui/AppButton';

export class ErrorBoundary extends React.Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Replace with your crash reporter (Sentry, Bugsnag) when one is wired up.
    if (__DEV__) console.error('Unhandled render error:', error, info?.componentStack);
  }

  handleReset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.emoji} accessibilityElementsHidden>
            😔
          </Text>
          <Text style={styles.title} accessibilityRole="header">
            Something went wrong
          </Text>
          <Text style={styles.message}>
            The app hit an unexpected problem. Your saved screenings are safe.
          </Text>
          <AppButton
            label="Try again"
            icon="refresh-outline"
            onPress={this.handleReset}
            style={styles.button}
          />
          {__DEV__ && (
            <Text style={styles.debug} selectable>
              {String(this.state.error?.stack ?? this.state.error)}
            </Text>
          )}
        </ScrollView>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  emoji: { fontSize: 48 },
  title: { fontSize: 20, fontWeight: '800', color: COLORS.text, textAlign: 'center' },
  message: { fontSize: 14.5, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 21 },
  button: { alignSelf: 'stretch', marginTop: 12 },
  debug: { fontSize: 11, color: COLORS.textMuted, marginTop: 20, fontFamily: 'monospace' },
});
