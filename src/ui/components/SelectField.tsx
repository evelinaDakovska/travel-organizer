import { useState } from 'react';

import { useColors } from '../tokens';
import { Icon } from './Icon';
import { ListRow, Rows } from './ListRow';
import { PickerButton } from './PickerButton';
import { Sheet } from './Sheet';

type Props<T extends string> = {
  value: T | null;
  options: readonly T[];
  onChange: (value: T | null) => void;
  labelFor: (value: T) => string;
  /** The sheet's heading: 'Type of activity'. */
  title: string;
  /** Offered as the first choice and shown when nothing is chosen: 'Not specified'. */
  noneLabel?: string;
  /** A line under an option in the sheet. */
  detailFor?: (value: T) => string | null;
};

/**
 * One choice out of many as a single field that opens a sheet (B10), where a row of chips would
 * spread a taxonomy across the form.
 */
export function SelectField<T extends string>({
  value,
  options,
  onChange,
  labelFor,
  title,
  noneLabel,
  detailFor,
}: Props<T>) {
  const c = useColors();
  const [open, setOpen] = useState(false);
  const choose = (next: T | null) => {
    setOpen(false);
    onChange(next);
  };
  const check = <Icon name="check" color={c.accentText} />;

  return (
    <>
      <PickerButton
        value={value ? labelFor(value) : (noneLabel ?? null)}
        placeholder={noneLabel ?? 'Choose'}
        onPress={() => setOpen(true)}
      />
      <Sheet visible={open} title={title} onClose={() => setOpen(false)}>
        <Rows>
          {noneLabel ? (
            <ListRow
              title={noneLabel}
              trailing={value === null ? check : null}
              onPress={() => choose(null)}
              accessibilityLabel={value === null ? `${noneLabel}, selected` : noneLabel}
            />
          ) : null}
          {options.map((option) => (
            <ListRow
              key={option}
              title={labelFor(option)}
              subtitle={detailFor?.(option)}
              trailing={option === value ? check : null}
              onPress={() => choose(option)}
              accessibilityLabel={
                option === value ? `${labelFor(option)}, selected` : labelFor(option)
              }
            />
          ))}
        </Rows>
      </Sheet>
    </>
  );
}
