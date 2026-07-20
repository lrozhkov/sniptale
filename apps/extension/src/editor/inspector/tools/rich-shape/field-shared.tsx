import type React from 'react';

const FIELD_LABEL_CLASS_NAME =
  'block truncate text-[11px] font-semibold leading-4 text-[color:var(--sniptale-color-text-muted-strong)]';

export function FieldShell(props: { children: React.ReactNode; label: string }) {
  return (
    <label className="block min-w-0 space-y-1">
      <span className={FIELD_LABEL_CLASS_NAME}>{props.label}</span>
      {props.children}
    </label>
  );
}

export function clampNumber(value: number, min?: number, max?: number): number {
  const lowerBounded = min === undefined ? value : Math.max(min, value);
  return max === undefined ? lowerBounded : Math.min(max, lowerBounded);
}
