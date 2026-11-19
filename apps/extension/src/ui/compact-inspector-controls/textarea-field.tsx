import { CompactTextarea } from './primitives';
import { cx } from './shared';
import { forwardRef, useRef, type ReactNode } from 'react';
import type { ProductTextareaProps } from '@sniptale/ui/product-form-controls';
import { InspectorParameterRow, useInspectorLayout } from './layout';
import { InspectorFieldClear } from './text-field';

const TEXTAREA_FIELD_LABEL_CLASS_NAME = [
  'sniptale-interface-label',
  'select-none break-words text-[12px] font-semibold',
  'text-[color:var(--sniptale-color-text-secondary)]',
].join(' ');

type TextareaFieldProps = Omit<ProductTextareaProps, 'onChange'> & {
  accessory?: ReactNode;
  accessoryPersistent?: boolean;
  clearable?: boolean;
  label: string;
  minHeightClassName?: string | undefined;
  onChange: (value: string) => void;
  value: string;
};

/** Full-width text editing retains the native field ref and event owners. */
export const TextareaField = forwardRef<HTMLTextAreaElement, TextareaFieldProps>(
  function TextareaField(props, ref) {
    const {
      accessory,
      accessoryPersistent = false,
      clearable = true,
      label,
      className,
      minHeightClassName,
      onChange,
      ...inputProps
    } = props;
    const inspector = useInspectorLayout();
    const input = useRef<HTMLTextAreaElement>(null);
    const setInput = (node: HTMLTextAreaElement | null) => {
      input.current = node;
      if (typeof ref === 'function') ref(node);
      else if (ref) ref.current = node;
    };
    const field = (
      <div className="sniptale-text-value" data-multiline="true" data-framed>
        <CompactTextarea
          {...inputProps}
          ref={setInput}
          aria-label={inputProps['aria-label'] ?? label}
          onChange={(event) => onChange(event.currentTarget.value)}
          className={cx('sniptale-parameter-textarea', minHeightClassName)}
        />
        {clearable && !props.disabled && !props.readOnly && props.value.length > 0 ? (
          <InspectorFieldClear label={label} target={input} />
        ) : null}
        {accessory ? (
          <div
            className="sniptale-textarea-accessory"
            data-persistent={accessoryPersistent || undefined}
          >
            {accessory}
          </div>
        ) : null}
      </div>
    );
    if (inspector)
      return (
        <InspectorParameterRow
          label={label}
          stacked
          className={className}
          dataUi="shared.ui.compact-inspector.textarea-field"
        >
          {field}
        </InspectorParameterRow>
      );

    return (
      <label
        data-ui="shared.ui.compact-inspector.textarea-field"
        className={cx('flex w-full min-w-0 flex-col items-stretch gap-1.5', className)}
      >
        <span className={cx('min-w-0', TEXTAREA_FIELD_LABEL_CLASS_NAME)} title={label}>
          {label}
        </span>
        {field}
      </label>
    );
  }
);
