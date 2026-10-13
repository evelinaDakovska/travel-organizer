import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { spacing, type, useColors } from '../tokens';
import { Button } from './Button';
import { Input } from './Field';

type Props = {
  placeholder: string;
  /** Returns an error to show, or nothing when it was added. */
  onAdd: (text: string) => Promise<string | void>;
  buttonLabel?: string;
};

/**
 * A text field with Add beside it, for lists that grow one line at a time: a traveller, a list item.
 * The field clears on success and keeps the text, with the reason, when it was refused.
 */
export function AddByName({ placeholder, onAdd, buttonLabel = 'Add' }: Props) {
  const c = useColors();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const problem = await onAdd(text);
      if (problem) setError(problem);
      else {
        setText('');
        setError(null);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.block}>
      <View style={styles.row}>
        <View style={styles.grow}>
          <Input
            value={text}
            onChangeText={(next) => {
              setText(next);
              setError(null);
            }}
            placeholder={placeholder}
            invalid={!!error}
            returnKeyType="done"
            onSubmitEditing={() => void submit()}
            submitBehavior="submit"
          />
        </View>
        <Button
          label={buttonLabel}
          variant="secondary"
          compact
          busy={busy}
          onPress={() => void submit()}
        />
      </View>
      {error ? <Text style={[type.caption, { color: c.danger }]}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  grow: { flex: 1 },
});
