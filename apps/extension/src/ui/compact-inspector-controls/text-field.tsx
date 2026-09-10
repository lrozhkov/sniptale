import { forwardRef, useRef, useState } from 'react';
import type React from 'react';
import type { ProductInputProps } from '@sniptale/ui/product-form-controls';
import { focusNextCompactInput } from '@sniptale/ui/compact-inspector-controls/focus';
import { cx } from './shared';

const TEXT_FIELD_LABEL_CLASS_NAME = [
  'select-none break-words',
  'text-[length:var(--sniptale-compact-font-size,12px)] font-semibold',
  'text-[color:var(--sniptale-color-text-secondary)]',
].join(' ');

function commitTextValue(
  lastCommittedValueRef: React.MutableRefObject<string | null>,
  onValueCommit: TextFieldProps['onValueCommit'],
  value: string
) {
  if (!onValueCommit || lastCommittedValueRef.current === value) {
    return;
  }
  lastCommittedValueRef.current = value;
  void onValueCommit(value);
}

export interface TextFieldProps extends ProductInputProps {
  inputClassName?: string | undefined;
  label: string;
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { className, invalid = false, label, ...props },
  ref
) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const lastCommittedValueRef = useRef<string | null>(null);
  const [editing, setEditing] = useState(false);
  const setInputRef = (node: HTMLInputElement | null) => assignTextFieldRef(inputRef, ref, node);

  return (
    <div
      data-ui="shared.ui.compact-inspector.text-field"
      data-editing={editing ? 'true' : 'false'}
      className={cx('flex w-full min-w-0 flex-col items-stretch gap-1.5', className)}
    >
      <span className={cx('min-w-0', TEXT_FIELD_LABEL_CLASS_NAME)} title={label}>
        {label}
      </span>
      <TextFieldInput
        invalid={invalid}
        label={label}
        lastCommittedValueRef={lastCommittedValueRef}
        setEditing={setEditing}
        setInputRef={setInputRef}
        {...props}
      />
    </div>
  );
});

function TextFieldInput({
  inputClassName,
  invalid,
  label,
  lastCommittedValueRef,
  onBlur,
  onFocus,
  onKeyDown,
  onValueCommit,
  setEditing,
  setInputRef,
  ...props
}: TextFieldProps & {
  invalid: boolean;
  lastCommittedValueRef: React.MutableRefObject<string | null>;
  setEditing: (editing: boolean) => void;
  setInputRef: (node: HTMLInputElement | null) => void;
}) {
  return (
    <input
      {...props}
      ref={setInputRef}
      aria-label={props['aria-label'] ?? label}
      aria-invalid={invalid || undefined}
      onFocus={(event) => handleTextFieldFocus(event, setEditing, onFocus)}
      onBlur={(event) => {
        setEditing(false);
        onBlur?.(event);
        commitTextValue(lastCommittedValueRef, onValueCommit, event.currentTarget.value);
      }}
      onKeyDown={(event) =>
        handleTextFieldKeyDown(event, lastCommittedValueRef, onKeyDown, onValueCommit)
      }
      className={cx(
        'h-[var(--sniptale-compact-control-height,32px)]',
        'w-full min-w-0 rounded-[6px] border px-2.5 py-1 text-left outline-none',
        'bg-[color:var(--sniptale-color-surface-input)]',
        'border-[color:var(--sniptale-color-border-soft)]',
        'focus:border-[color:var(--sniptale-color-border-accent-strong)]',
        'disabled:cursor-not-allowed disabled:opacity-50',
        invalid && 'border-[color:var(--sniptale-color-border-accent-strong)]',
        'text-[length:var(--sniptale-compact-font-size,12px)] font-semibold',
        'text-[color:var(--sniptale-color-text-primary)]',
        'placeholder:text-[color:var(--sniptale-color-text-muted)]',
        inputClassName
      )}
    />
  );
}

function handleTextFieldFocus(
  event: React.FocusEvent<HTMLInputElement>,
  setEditing: (editing: boolean) => void,
  onFocus: TextFieldProps['onFocus']
) {
  setEditing(true);
  onFocus?.(event);
}

function handleTextFieldKeyDown(
  event: React.KeyboardEvent<HTMLInputElement>,
  lastCommittedValueRef: React.MutableRefObject<string | null>,
  onKeyDown: TextFieldProps['onKeyDown'],
  onValueCommit: TextFieldProps['onValueCommit']
) {
  onKeyDown?.(event);
  if (event.defaultPrevented) {
    return;
  }
  if (event.key === 'Enter') {
    event.preventDefault();
    commitTextValue(lastCommittedValueRef, onValueCommit, event.currentTarget.value);
    focusNextCompactInput(event.currentTarget);
  }
  if (event.key === 'Escape') {
    event.preventDefault();
    event.currentTarget.blur();
  }
}

function assignTextFieldRef(
  inputRef: React.MutableRefObject<HTMLInputElement | null>,
  ref: React.ForwardedRef<HTMLInputElement>,
  node: HTMLInputElement | null
) {
  inputRef.current = node;
  if (typeof ref === 'function') {
    ref(node);
  } else if (ref) {
    ref.current = node;
  }
}
