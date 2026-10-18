import { CommandPressScope, useCommandPress } from '@sniptale/ui/control-language/press';
import { forwardRef, useContext, useRef, useState } from 'react';
import type React from 'react';
import type { ProductInputProps } from '@sniptale/ui/product-form-controls';
import { focusNextCompactInput } from '@sniptale/ui/compact-inspector-controls/focus';
import { cx } from './shared';
import { X } from 'lucide-react';
import { translate } from '../../platform/i18n';
import { InspectorParameterRow, useInspectorLayout } from './layout';

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
  trailingActions?: React.ReactNode;
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { className, invalid = false, label, trailingActions, ...props },
  ref
) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const lastCommittedValueRef = useRef<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [uncontrolledText, setUncontrolledText] = useState(String(props.defaultValue ?? ''));
  const inspector = useInspectorLayout();
  const hasText = String(props.value ?? uncontrolledText).length > 0;
  const setInputRef = (node: HTMLInputElement | null) => assignTextFieldRef(inputRef, ref, node);

  if (inspector)
    return (
      <InspectorParameterRow
        label={label}
        valueMinimum={trailingActions ? 220 : 144}
        valueText={String(props.value ?? uncontrolledText)}
        className={className}
        dataUi="shared.ui.compact-inspector.text-field"
      >
        <div className={trailingActions ? 'sniptale-text-compound' : 'contents'}>
          <div className="sniptale-text-value">
            <TextFieldInput
              invalid={invalid}
              label={label}
              lastCommittedValueRef={lastCommittedValueRef}
              setEditing={setEditing}
              setInputRef={setInputRef}
              {...props}
              onChange={(event) => {
                setUncontrolledText(event.currentTarget.value);
                props.onChange?.(event);
              }}
            />
            {!props.disabled && !props.readOnly && hasText ? (
              <InspectorFieldClear label={label} target={inputRef} />
            ) : null}
          </div>
          {trailingActions ? <div className="sniptale-text-actions">{trailingActions}</div> : null}
        </div>
      </InspectorParameterRow>
    );

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

/** Clears through the native input event and keeps acceptance with the field owner. */
export function InspectorFieldClear(props: {
  label: string;
  target: React.RefObject<HTMLInputElement | HTMLTextAreaElement | null>;
}) {
  const label = translate('shared.ui.clearField').replace('{field}', props.label);
  const scoped = useContext(CommandPressScope);
  const press = useCommandPress({
    enabled: scoped,
    onPointerDown: (event) => event.preventDefault(),
    onClick: () => {
      const input = props.target.current;
      if (!input || input.matches(':disabled') || input.readOnly) return;
      const prototype =
        input instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(input, '');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.focus();
    },
  });
  const icon = <X size={14} aria-hidden="true" />;
  return (
    <button
      {...press.props}
      type="button"
      className="sniptale-field-clear"
      aria-label={label}
      title={label}
      data-command-press={scoped ? '' : undefined}
      data-pressing={press.pressed ? 'true' : undefined}
      data-command-chrome={scoped ? 'true' : undefined}
    >
      {scoped ? <span className="sniptale-command-content">{icon}</span> : icon}
    </button>
  );
}

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
      placeholder={props.placeholder ?? label}
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
