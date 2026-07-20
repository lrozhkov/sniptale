import { forwardRef, useRef, useState } from 'react';
import type React from 'react';
import type { ProductInputProps } from '@sniptale/ui/product-form-controls';
import { focusNextCompactInput } from '@sniptale/ui/compact-inspector-controls/focus';
import { cx } from './shared';

const TEXT_FIELD_LABEL_CLASS_NAME = [
  'flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[12px] font-semibold',
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
      className={cx(
        'flex min-h-10 items-center justify-between gap-3 rounded-[10px] border px-3 py-1.5',
        'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-input)_62%,transparent)]',
        invalid || editing
          ? 'border-[color:var(--sniptale-color-border-accent-strong)]'
          : 'border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_72%,transparent)]',
        className
      )}
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
        'h-8 min-w-0 flex-1 border-0 bg-transparent p-0 text-right outline-none',
        'text-[12px] font-semibold text-[color:var(--sniptale-color-text-primary)]',
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
