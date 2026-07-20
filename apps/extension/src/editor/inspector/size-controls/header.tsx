import { cx } from '../../chrome/ui';

interface SizeControlsHeaderProps {
  label: string;
  valueText?: string;
  className?: string;
  valueClassName?: string;
}

/**
 * Shared section header for editor size surfaces that need the same label/value rhythm.
 */
export function SizeControlsHeader(props: SizeControlsHeaderProps) {
  return (
    <div className={cx('flex items-center justify-between gap-3', props.className)}>
      <span className="text-[12px] font-bold uppercase text-[color:var(--sniptale-color-text-secondary)]">
        {props.label}
      </span>
      {props.valueText ? (
        <span
          className={cx(
            'text-xs font-medium text-[color:var(--sniptale-color-text-secondary)]',
            props.valueClassName
          )}
        >
          {props.valueText}
        </span>
      ) : null}
    </div>
  );
}
