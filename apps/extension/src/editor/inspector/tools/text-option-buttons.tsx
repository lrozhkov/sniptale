import type React from 'react';
import { ToggleGrid } from '../../chrome/ui';

type TextButtonOption<T extends string> = {
  icon: React.ReactNode;
  label: string;
  value: T;
};

export function TextIconOptionButtons<T extends string>(props: {
  ariaLabel: string;
  columns?: 3;
  onSelect: (value: T) => void;
  options: TextButtonOption<T>[];
  value: T;
}) {
  return (
    <ToggleGrid
      ariaLabel={props.ariaLabel}
      columns={props.columns ?? 3}
      options={props.options.map((option) => ({
        active: option.value === props.value,
        icon: option.icon,
        label: option.label,
        onToggle: () => props.onSelect(option.value),
      }))}
    />
  );
}
