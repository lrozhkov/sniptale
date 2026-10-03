import { Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { translate } from '../../../../platform/i18n/popup';

export function PostRecordDeleteButton({
  disabled,
  onDelete,
}: {
  disabled: boolean;
  onDelete: () => void;
}) {
  const [armed, setArmed] = useState(false);
  const phase = useRef<'idle' | 'waiting' | 'armed'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reset = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    phase.current = 'idle';
    setArmed(false);
  };
  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    []
  );

  return (
    <button
      type="button"
      disabled={disabled}
      className={[
        'flex h-10 w-full items-center justify-center gap-2 rounded-md px-2 text-xs font-medium',
        'transition-colors duration-200 motion-reduce:transition-none focus-visible:outline-none',
        'focus-visible:ring-2 focus-visible:ring-[var(--sniptale-color-accent)]',
        'disabled:cursor-not-allowed disabled:opacity-50',
        armed
          ? 'bg-[var(--sniptale-color-danger-soft)] text-[var(--sniptale-color-danger)]'
          : [
              'text-[var(--sniptale-color-text-muted-strong)]',
              'hover:bg-[var(--sniptale-color-danger-soft)] hover:text-[var(--sniptale-color-danger)]',
            ].join(' '),
      ].join(' ')}
      onBlur={reset}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          reset();
        }
        if (event.repeat && (event.key === 'Enter' || event.key === ' ')) event.preventDefault();
      }}
      onClick={() => {
        if (disabled || phase.current === 'waiting') return;
        if (phase.current === 'armed') {
          reset();
          onDelete();
          return;
        }
        phase.current = 'waiting';
        timer.current = setTimeout(() => {
          timer.current = null;
          phase.current = 'armed';
          setArmed(true);
        }, 200);
      }}
    >
      <Trash2 aria-hidden="true" className="h-4 w-4 shrink-0" />
      <span aria-live="polite">
        {translate(armed ? 'popup.video.postRecordDeleteConfirm' : 'popup.video.postRecordDelete')}
      </span>
    </button>
  );
}
