import type React from 'react';

const FIELD_LABEL_CLASS_NAME =
  'block break-words text-[13px] font-medium leading-[18px] text-[color:var(--sniptale-color-text-secondary)]';

export function FieldShell(props: {
  children: React.ReactNode;
  label: string;
  onActivate: () => void;
}) {
  return (
    <div
      className="block min-w-0 space-y-1"
      onPointerDown={(event) => {
        if (
          event.button === 0 &&
          event.target instanceof Element &&
          !event.target.closest('input,button')
        )
          event.preventDefault();
      }}
      onClick={(event) => {
        if (event.target instanceof Element && !event.target.closest('input,button'))
          props.onActivate();
      }}
    >
      <span className={FIELD_LABEL_CLASS_NAME}>{props.label}</span>
      {props.children}
    </div>
  );
}

export function clampNumber(value: number, min?: number, max?: number): number {
  const lowerBounded = min === undefined ? value : Math.max(min, value);
  return max === undefined ? lowerBounded : Math.min(max, lowerBounded);
}
