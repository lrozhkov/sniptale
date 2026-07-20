import { CompactTextarea } from './primitives';
import { cx } from './shared';

const TEXTAREA_FIELD_LABEL_CLASS_NAME = [
  'flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[12px] font-semibold',
  'text-[color:var(--sniptale-color-text-secondary)]',
].join(' ');

export function TextareaField(props: {
  className?: string | undefined;
  disabled?: boolean | undefined;
  label: string;
  minHeightClassName?: string | undefined;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label
      data-ui="shared.ui.compact-inspector.textarea-field"
      className={cx(
        'flex min-h-24 w-full min-w-0 items-start justify-between gap-3 rounded-[10px] border px-3 py-2',
        'border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_72%,transparent)]',
        'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-input)_62%,transparent)]',
        props.className
      )}
    >
      <span className={cx('min-w-0 pt-1', TEXTAREA_FIELD_LABEL_CLASS_NAME)} title={props.label}>
        {props.label}
      </span>
      <CompactTextarea
        aria-label={props.label}
        disabled={props.disabled}
        value={props.value}
        onChange={(event) => props.onChange(event.currentTarget.value)}
        className={cx(
          'min-h-20 flex-[1.25] border-transparent bg-transparent px-0 py-0 shadow-none',
          props.minHeightClassName
        )}
      />
    </label>
  );
}
