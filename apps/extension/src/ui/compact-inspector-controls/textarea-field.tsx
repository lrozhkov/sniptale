import { CompactTextarea } from './primitives';
import { cx } from './shared';

const TEXTAREA_FIELD_LABEL_CLASS_NAME = [
  'select-none break-words text-[12px] font-semibold',
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
      className={cx('flex w-full min-w-0 flex-col items-stretch gap-1.5', props.className)}
    >
      <span className={cx('min-w-0', TEXTAREA_FIELD_LABEL_CLASS_NAME)} title={props.label}>
        {props.label}
      </span>
      <CompactTextarea
        aria-label={props.label}
        disabled={props.disabled}
        value={props.value}
        onChange={(event) => props.onChange(event.currentTarget.value)}
        className={cx('min-h-20 rounded-[6px] px-2.5 py-2 shadow-none', props.minHeightClassName)}
      />
    </label>
  );
}
