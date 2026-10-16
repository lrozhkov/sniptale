import type React from 'react';

const FIELD_LABEL_CLASS_NAME =
  'block break-words text-[13px] font-medium leading-[18px] text-[color:var(--sniptale-color-text-secondary)]';

export function FieldShell(props: { children: React.ReactNode; label: string }) {
  return (
    <div className="block min-w-0 space-y-1">
      <span className={FIELD_LABEL_CLASS_NAME}>{props.label}</span>
      {props.children}
    </div>
  );
}

export function clampNumber(value: number, min?: number, max?: number): number {
  const lowerBounded = min === undefined ? value : Math.max(min, value);
  return max === undefined ? lowerBounded : Math.min(max, lowerBounded);
}
