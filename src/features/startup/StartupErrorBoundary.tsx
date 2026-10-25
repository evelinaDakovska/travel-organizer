import { Component, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from '../../ui/components/Button';
import { Screen } from '../../ui/components/Screen';
import { gutter, radius, spacing, type, useColors } from '../../ui/tokens';

type Props = {
  /** *Try again*: the caller remounts the database provider, which opens it afresh. */
  onRetry: () => void;
  /** Whether the database had opened: if so, the error came from a screen, not from the data. */
  opened: boolean;
  children: ReactNode;
};

type State = { error: Error | null };

/**
 * Around the database provider (release audit F-02). A database that cannot be opened or brought
 * up to date used to crash the app at every launch, with nothing to read. Now a screen says the
 * data was left as it was, shows the error to report, and offers *Try again*. Migrations run in
 * transactions, so a failed one has changed nothing.
 */
export class StartupErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  componentDidCatch(error: unknown) {
    console.warn('The app could not start', error);
  }

  private retry = () => {
    this.setState({ error: null });
    this.props.onRetry();
  };

  render() {
    if (this.state.error) {
      return <StartupError error={this.state.error} opened={this.props.opened} onRetry={this.retry} />;
    }
    return this.props.children;
  }
}

function StartupError({
  error,
  opened,
  onRetry,
}: {
  error: Error;
  opened: boolean;
  onRetry: () => void;
}) {
  const c = useColors();
  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[type.title, { color: c.text }]} accessibilityRole="header">
          {opened ? 'Something went wrong' : 'The app could not open your data'}
        </Text>
        <Text style={[type.body, { color: c.text }]}>
          {opened
            ? 'Your trips are saved on this phone. Try again; if this keeps happening, send the message below to whoever gave you the app.'
            : 'Your data is unchanged: nothing was deleted or overwritten. Try again; if this keeps happening, keep the app installed — do not clear its storage or uninstall it — and send the message below to whoever gave you the app.'}
        </Text>
        <View
          style={[styles.errorBox, { backgroundColor: c.surfaceSunken, borderColor: c.border }]}>
          <Text style={[type.caption, { color: c.textMuted }]} selectable>
            {error.message || error.name}
          </Text>
        </View>
        <Button label="Try again" onPress={onRetry} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: gutter.normal, paddingTop: spacing.xxl, gap: spacing.lg },
  errorBox: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: spacing.md,
  },
});
