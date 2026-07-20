import { forwardRef, useRef } from 'react';
import type {
  ButtonHTMLAttributes,
  ReactNode,
  InputHTMLAttributes,
  MutableRefObject,
  TextareaHTMLAttributes,
} from 'react';
import { resolveRangeVisualStyle } from '../range-control/style';

export { ProductSelect } from './select';
export type { ProductSelectOption, ProductSelectProps } from './select';

export interface ProductFieldProps {
  label?: ReactNode;
  error?: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
}

export interface ProductInputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
  onValueCommit?: (value: string) => void | Promise<void>;
}

export interface ProductTextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export interface ProductToggleProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  checked: boolean;
  size?: 'sm' | 'md';
}

export interface ProductRangeProps extends InputHTMLAttributes<HTMLInputElement> {
  onValueCommit?: (value: number) => void | Promise<void>;
}

export interface ProductKeyboardHintProps {
  shortcut: ReactNode;
  children: ReactNode;
}

function useCommitDeduper() {
  return useRef<string | null>(null);
}

function shouldSkipCommittedValue(
  lastCommittedValueRef: MutableRefObject<string | null>,
  nextValue: string
) {
  return lastCommittedValueRef.current === nextValue;
}

function commitStringValue(
  lastCommittedValueRef: MutableRefObject<string | null>,
  onValueCommit: ProductInputProps['onValueCommit'],
  value: string
) {
  if (!onValueCommit || shouldSkipCommittedValue(lastCommittedValueRef, value)) {
    return;
  }

  lastCommittedValueRef.current = value;
  void onValueCommit(value);
}

function commitNumberValue(
  lastCommittedValueRef: MutableRefObject<string | null>,
  onValueCommit: ProductRangeProps['onValueCommit'],
  rawValue: string
) {
  if (!onValueCommit || shouldSkipCommittedValue(lastCommittedValueRef, rawValue)) {
    return;
  }

  lastCommittedValueRef.current = rawValue;
  void onValueCommit(Number(rawValue));
}

export function ProductField({ label, error, hint, children }: ProductFieldProps) {
  return (
    <div>
      {label ? <label className="sniptale-label-sm">{label}</label> : null}
      {children}
      {error ? <div className="sniptale-error-text">{error}</div> : null}
      {hint ? <p className="mt-1 text-xs text-[var(--sniptale-color-text-dim)]">{hint}</p> : null}
    </div>
  );
}

export const ProductInput = forwardRef<HTMLInputElement, ProductInputProps>(function ProductInput(
  { className = '', invalid = false, onBlur, onKeyDown, onValueCommit, ...props },
  ref
) {
  const lastCommittedValueRef = useCommitDeduper();

  return (
    <input
      {...props}
      ref={ref}
      onBlur={(event) => {
        onBlur?.(event);
        commitStringValue(lastCommittedValueRef, onValueCommit, event.currentTarget.value);
      }}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (event.key === 'Enter') {
          commitStringValue(lastCommittedValueRef, onValueCommit, event.currentTarget.value);
        }
      }}
      className={['sniptale-input', invalid ? 'sniptale-input-error' : '', className]
        .filter(Boolean)
        .join(' ')}
    />
  );
});

export const ProductTextarea = forwardRef<HTMLTextAreaElement, ProductTextareaProps>(
  function ProductTextarea({ className = '', invalid = false, ...props }, ref) {
    return (
      <textarea
        {...props}
        ref={ref}
        className={['sniptale-textarea', invalid ? 'sniptale-input-error' : '', className]
          .filter(Boolean)
          .join(' ')}
      />
    );
  }
);

export const ProductToggle = forwardRef<HTMLButtonElement, ProductToggleProps>(
  function ProductToggle({ checked, className = '', size = 'md', type = 'button', ...props }, ref) {
    return (
      <button
        {...props}
        ref={ref}
        type={type}
        role="switch"
        aria-checked={checked}
        className={[
          'sniptale-product-toggle',
          checked ? 'sniptale-product-toggle-checked' : '',
          size === 'sm' ? 'sniptale-product-toggle-sm' : '',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <span className="sniptale-product-toggle-thumb" />
      </button>
    );
  }
);

export const ProductRange = forwardRef<HTMLInputElement, ProductRangeProps>(function ProductRange(
  {
    className = '',
    defaultValue,
    max,
    min,
    onBlur,
    onKeyUp,
    onPointerUp,
    onValueCommit,
    style,
    type = 'range',
    value,
    ...props
  },
  ref
) {
  const lastCommittedValueRef = useCommitDeduper();

  return (
    <input
      {...props}
      ref={ref}
      type={type}
      min={min}
      max={max}
      value={value}
      defaultValue={defaultValue}
      onBlur={(event) => {
        onBlur?.(event);
        commitNumberValue(lastCommittedValueRef, onValueCommit, event.currentTarget.value);
      }}
      onKeyUp={(event) => {
        onKeyUp?.(event);
        commitNumberValue(lastCommittedValueRef, onValueCommit, event.currentTarget.value);
      }}
      onPointerUp={(event) => {
        onPointerUp?.(event);
        commitNumberValue(lastCommittedValueRef, onValueCommit, event.currentTarget.value);
      }}
      className={['sniptale-range', className].join(' ')}
      style={resolveRangeVisualStyle({ defaultValue, max, min, style, value })}
    />
  );
});

export function ProductKeyboardHint({ shortcut, children }: ProductKeyboardHintProps) {
  return (
    <div className="inline-flex items-center gap-2 text-sm text-[var(--sniptale-color-text-secondary)]">
      <span className="sniptale-kbd">{shortcut}</span>
      <span>{children}</span>
    </div>
  );
}
