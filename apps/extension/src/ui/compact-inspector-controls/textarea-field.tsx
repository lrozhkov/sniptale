import { CompactTextarea } from './primitives';
import { cx } from './shared';
import { forwardRef, useRef } from 'react';
import type { ProductTextareaProps } from '@sniptale/ui/product-form-controls';
import { InspectorParameterRow, useInspectorLayout } from './layout';
import { InspectorFieldClear } from './text-field';

const TEXTAREA_FIELD_LABEL_CLASS_NAME = [
  'sniptale-interface-label',
  'select-none break-words text-[12px] font-semibold',
  'text-[color:var(--sniptale-color-text-secondary)]',
].join(' ');

type TextareaFieldProps = Omit<ProductTextareaProps, 'onChange'> & {
  label: string;
  minHeightClassName?: string | undefined;
  onChange: (value: string) => void;
  value: string;
};

/** Full-width text editing retains the native field ref and event owners. */
export const TextareaField = forwardRef<HTMLTextAreaElement, TextareaFieldProps>(
  function TextareaField(props, ref) {
    const { label, className, minHeightClassName, onChange, ...inputProps } = props;
    const inspector = useInspectorLayout();
    const input = useRef<HTMLTextAreaElement>(null);
    const setInput = (node: HTMLTextAreaElement | null) => {
      input.current = node;
      if (typeof ref === 'function') ref(node);
      else if (ref) ref.current = node;
    };
    if (inspector)
      return (
        <InspectorParameterRow
          label={label}
          stacked
          className={className}
          dataUi="shared.ui.compact-inspector.textarea-field"
        >
          <div className="sniptale-text-value" data-multiline="true">
            <CompactTextarea
              {...inputProps}
              ref={setInput}
              aria-label={inputProps['aria-label'] ?? label}
              onChange={(event) => onChange(event.currentTarget.value)}
              className={cx('sniptale-parameter-textarea', minHeightClassName)}
            />
            {!props.disabled && !props.readOnly && props.value.length > 0 ? (
              <InspectorFieldClear label={label} target={input} />
            ) : null}
          </div>
        </InspectorParameterRow>
      );
    return (
      <label
        data-ui="shared.ui.compact-inspector.textarea-field"
        className={cx('flex w-full min-w-0 flex-col items-stretch gap-1.5', props.className)}
      >
        <span className={cx('min-w-0', TEXTAREA_FIELD_LABEL_CLASS_NAME)} title={props.label}>
          {props.label}
        </span>
        <CompactTextarea
          ref={setInput}
          {...inputProps}
          aria-label={props.label}
          disabled={props.disabled}
          value={props.value}
          onChange={(event) => props.onChange(event.currentTarget.value)}
          className={cx('min-h-20 rounded-[6px] px-2.5 py-2 shadow-none', props.minHeightClassName)}
        />
      </label>
    );
  }
);
