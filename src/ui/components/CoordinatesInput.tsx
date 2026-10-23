import { useState } from 'react';

import { coordinatesText, parseCoordinates } from '../../domain/directions';
import { Input } from './Field';

type Props = {
  latitude: number | undefined;
  longitude: number | undefined;
  /** Both, or neither (empty). Text that is not a pair goes out as NaN, so the schema says why. */
  onChange: (latitude: number | undefined, longitude: number | undefined) => void;
  onBlur: () => void;
  invalid: boolean;
};

/**
 * A place's coordinates as one line, the way Google Maps copies them: '66.5115, 25.7311'. Keeps the
 * text as typed, like the amount field, so a half-typed pair is never rewritten under the cursor.
 */
export function CoordinatesInput({ latitude, longitude, onChange, onBlur, invalid }: Props) {
  const [text, setText] = useState(() => coordinatesText(latitude, longitude));

  return (
    <Input
      value={text}
      onChangeText={(next) => {
        setText(next);
        const parsed = parseCoordinates(next);
        if (parsed === undefined) onChange(undefined, undefined);
        else if (parsed === null) onChange(Number.NaN, Number.NaN);
        else onChange(parsed.latitude, parsed.longitude);
      }}
      onBlur={onBlur}
      keyboardType="numbers-and-punctuation"
      autoCorrect={false}
      placeholder="66.5115, 25.7311"
      invalid={invalid}
      accessibilityLabel="Coordinates, latitude and longitude"
    />
  );
}
