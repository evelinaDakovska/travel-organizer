import { Pressable, Text } from 'react-native';

import { opacity, type, useColors } from '../tokens';
import { inputFrame } from './Field';

type Props = {
  value: string | null;
  placeholder: string;
  /** A quieter second line, such as the IANA id under a city name. */
  detail?: string | null;
  onPress: () => void;
  invalid?: boolean;
};

/** Looks like an input, opens a native picker. Shared by the date, time and timezone fields. */
export function PickerButton({ value, placeholder, detail, onPress, invalid = false }: Props) {
  const c = useColors();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [inputFrame(c, invalid), { opacity: pressed ? opacity.pressed : 1 }]}>
      <Text style={[type.body, { color: value ? c.text : c.textFaint }]} numberOfLines={1}>
        {value ?? placeholder}
      </Text>
      {detail ? (
        <Text style={[type.caption, { color: c.textMuted }]} numberOfLines={1}>
          {detail}
        </Text>
      ) : null}
    </Pressable>
  );
}
