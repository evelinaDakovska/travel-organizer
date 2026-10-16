import Constants from 'expo-constants';
import { Redirect, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  AppState,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { FEATURE_FEEDBACK_ENABLED } from '../src/config/features';
import {
  MAX_MESSAGE_LENGTH,
  MAX_NAME_LENGTH,
  type FeedbackDraft,
} from '../src/domain/feedback';
import {
  clearFeedbackDraft,
  clearFeedbackMessage,
  loadFeedbackDraft,
  saveFeedbackDraft,
} from '../src/repositories/feedbackDraft';
import { submitFeedback } from '../src/services/feedback';
import { Button } from '../src/ui/components/Button';
import { Field, Input } from '../src/ui/components/Field';
import { FormScroll } from '../src/ui/components/FormScroll';
import { Icon } from '../src/ui/components/Icon';
import { Screen } from '../src/ui/components/Screen';
import { ScreenHeader } from '../src/ui/components/ScreenHeader';
import { radius, spacing, type, useColors } from '../src/ui/tokens';

export default function FeedbackScreen() {
  if (!FEATURE_FEEDBACK_ENABLED) {
    return <Redirect href="/" />;
  }
  return <FeedbackScreenContent />;
}

function FeedbackScreenContent() {
  const c = useColors();
  const router = useRouter();

  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState<string | undefined>(undefined);
  const [isLoaded, setIsLoaded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [draftSaved, setDraftSaved] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const latestStateRef = useRef({ name: '', message: '', idempotencyKey: undefined as string | undefined });

  latestStateRef.current = { name, message, idempotencyKey };

  const appVersion = Constants.expoConfig?.version ?? '0.7.1';
  const appBuild = String(Constants.expoConfig?.android?.versionCode ?? '11');
  const androidVersion =
    Platform.OS === 'android'
      ? `Android ${Platform.Version}`
      : `${Platform.OS} ${Platform.Version}`;

  // 1. Initial Load: Restore saved draft
  useEffect(() => {
    let active = true;
    void (async () => {
      const draft = await loadFeedbackDraft();
      if (!active) return;
      setName(draft.name);
      setMessage(draft.message);
      setIdempotencyKey(draft.idempotencyKey);
      setIsLoaded(true);
      if (draft.message.trim().length > 0) {
        setDraftSaved(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // 2. Debounced Auto-save (only after initial load has finished)
  useEffect(() => {
    if (!isLoaded || submitting) return;

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      void (async () => {
        await saveFeedbackDraft({
          name: latestStateRef.current.name,
          message: latestStateRef.current.message,
          idempotencyKey: latestStateRef.current.idempotencyKey,
          updatedAt: new Date().toISOString(),
        });
        setDraftSaved(true);
      })();
    }, 400);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [name, message, isLoaded, submitting]);

  // 3. Flush draft immediately on App background / inactive
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'background' || nextState === 'inactive') {
        if (!isLoadedRef.current || submittingRef.current) return;
        void saveFeedbackDraft({
          name: latestStateRef.current.name,
          message: latestStateRef.current.message,
          idempotencyKey: latestStateRef.current.idempotencyKey,
          updatedAt: new Date().toISOString(),
        });
      }
    });
    return () => subscription.remove();
  }, []);

  const isLoadedRef = useRef(isLoaded);
  isLoadedRef.current = isLoaded;
  const submittingRef = useRef(submitting);
  submittingRef.current = submitting;

  const handleClearDraft = () => {
    if (submitting) return;

    Alert.alert(
      'Clear draft?',
      'This removes your unsent message and name from this device.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => {
            setName('');
            setMessage('');
            setDraftSaved(false);
            setStatusMessage(null);
            void clearFeedbackDraft();
          },
        },
      ],
    );
  };

  const handleSend = async () => {
    if (submitting) return;

    const trimmedMsg = message.trim();
    if (!trimmedMsg) {
      setStatusMessage({ type: 'error', text: 'Please write a message before sending.' });
      return;
    }

    if (trimmedMsg.length > MAX_MESSAGE_LENGTH) {
      setStatusMessage({
        type: 'error',
        text: `Message is too long (maximum ${MAX_MESSAGE_LENGTH} characters).`,
      });
      return;
    }

    setSubmitting(true);
    setStatusMessage(null);

    // Ensure we have an idempotencyKey
    const key = idempotencyKey ?? crypto.randomUUID();
    setIdempotencyKey(key);

    const result = await submitFeedback({
      name: name.trim() || undefined,
      message: trimmedMsg,
      idempotencyKey: key,
      appVersion,
      appBuild,
      androidVersion,
    });

    setSubmitting(false);

    if (result.success) {
      // Clear message, retain name, generate new key
      const nextDraft = await clearFeedbackMessage(name.trim());
      setMessage('');
      setIdempotencyKey(nextDraft.idempotencyKey);
      setDraftSaved(false);
      setStatusMessage({ type: 'success', text: result.message });
    } else {
      // Preserve draft on failure for retry
      setStatusMessage({ type: 'error', text: result.error });
    }
  };

  return (
    <Screen>
      <ScreenHeader
        title="Feedback"
        subtitle="Notes and suggestions for the app"
      />

      <FormScroll
        footer={
          <View style={styles.footerContainer}>
            <View style={styles.footerRow}>
              {draftSaved && message.trim().length > 0 ? (
                <View style={styles.savedBadge}>
                  <Icon name="check" size={14} color={c.accentText} />
                  <Text style={[type.caption, { color: c.accentText }]}>
                    Draft saved on this device
                  </Text>
                </View>
              ) : (
                <View style={styles.savedBadge} />
              )}

              {message.trim().length > 0 && !submitting ? (
                <Text
                  onPress={handleClearDraft}
                  accessibilityRole="button"
                  accessibilityLabel="Clear draft"
                  style={[type.caption, { color: c.textMuted }]}>
                  Clear draft
                </Text>
              ) : null}
            </View>

            {statusMessage ? (
              <View
                style={[
                  styles.statusCard,
                  {
                    backgroundColor:
                      statusMessage.type === 'success'
                        ? c.accentSoft
                        : c.dangerSoft,
                    borderColor:
                      statusMessage.type === 'success' ? c.accent : c.danger,
                  },
                ]}>
                <Text
                  style={[
                    type.body,
                    {
                      color:
                        statusMessage.type === 'success' ? c.accentText : c.danger,
                    },
                  ]}>
                  {statusMessage.text}
                </Text>
              </View>
            ) : null}

            <Button
              label={submitting ? 'Sending feedback…' : 'Send feedback'}
              busy={submitting}
              onPress={handleSend}
            />
          </View>
        }>
        <View style={styles.container}>
          <Field label="Name" hint="Optional">
            <Input
              value={name}
              onChangeText={setName}
              placeholder="Your name or nickname"
              maxLength={MAX_NAME_LENGTH}
              editable={!submitting}
              autoCapitalize="words"
            />
          </Field>

          <Field
            label="Message"
            hint={`${message.length} / ${MAX_MESSAGE_LENGTH}`}
            error={statusMessage?.type === 'error' && !message.trim() ? statusMessage.text : undefined}>
            <Input
              value={message}
              onChangeText={(txt) => {
                setMessage(txt);
                if (statusMessage?.type === 'error') setStatusMessage(null);
              }}
              placeholder="What did you try? What felt right or confusing? What would make this better?"
              multiline
              maxLength={MAX_MESSAGE_LENGTH}
              editable={!submitting}
              style={styles.messageInput}
            />
          </Field>

          <View style={[styles.diagnosticsCard, { backgroundColor: c.surfaceSunken }]}>
            <View style={styles.diagnosticsHeader}>
              <Icon name="zone" size={16} color={c.textMuted} />
              <Text style={[type.label, { color: c.textMuted }]}>
                Diagnostics included
              </Text>
            </View>
            <Text style={[type.caption, { color: c.textMuted, marginTop: spacing.xs }]}>
              App {appVersion} ({appBuild}) and {androidVersion} are included to help fix bugs. No trip contents, bookings, travellers, notes, or files are sent.
            </Text>
          </View>
        </View>
      </FormScroll>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.lg,
  },
  messageInput: {
    minHeight: 180,
    textAlignVertical: 'top',
  },
  diagnosticsCard: {
    borderRadius: radius.md,
    padding: spacing.md,
  },
  diagnosticsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  footerContainer: {
    gap: spacing.md,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 20,
  },
  savedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statusCard: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
  },
});
