import type React from 'react';
import { useCallback, useEffect, useRef } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useStepperRepeat } from '@sniptale/ui/compact-inspector-controls/stepper-repeat';
import { cx } from './shared';

interface NumericStepperProps {
  disabled?: boolean | undefined;
  label: string;
  onStep: (direction: 1 | -1) => void;
  /** Accept the preview once after release or native keyboard activation. */
  onFinish?: () => void;
  /** Restore the captured value when the active hold is interrupted. */
  onCancel?: () => void;
}

export function NumericStepper({
  disabled,
  label,
  onStep,
  onFinish,
  onCancel,
}: NumericStepperProps) {
  const latest = useRef({ onFinish, onCancel });
  latest.current = { onFinish, onCancel };
  const release = useRef<(() => void) | null>(null);
  const repeat = useStepperRepeat((direction) => {
    if (!disabled) onStep(direction);
  });
  const stopRepeat = useRef(repeat.stop);
  stopRepeat.current = repeat.stop;
  const finish = useCallback((commit: boolean) => {
    if (!release.current) return;
    const cleanup = release.current;
    release.current = null;
    cleanup();
    stopRepeat.current();
    if (commit) latest.current.onFinish?.();
    else latest.current.onCancel?.();
  }, []);
  useEffect(() => () => finish(false), [finish]);
  useEffect(() => {
    if (disabled) finish(false);
  }, [disabled, finish]);
  const start = (direction: 1 | -1, pointerId: number) => {
    finish(true);
    release.current = bindPointerRelease(pointerId, finish);
    repeat.start(direction);
  };

  return (
    <span
      data-ui="shared.ui.compact-inspector.numeric-stepper"
      className={cx(
        'flex shrink-0 flex-col opacity-0 transition-opacity',
        'group-hover/compact-numeric:opacity-100 group-focus-within/compact-numeric:opacity-100'
      )}
    >
      <button
        type="button"
        aria-label={`${label} increase`}
        disabled={disabled}
        className={cx(
          'flex h-3.5 w-5 items-center justify-center rounded-[4px]',
          'bg-transparent text-[color:var(--sniptale-color-text-secondary)]',
          'hover:text-[color:var(--sniptale-color-text-primary)]'
        )}
        {...getStepperButtonHandlers({ disabled, direction: 1, start, onStep, onFinish })}
      >
        <ChevronUp size={10} strokeWidth={2.4} />
      </button>
      <button
        type="button"
        aria-label={`${label} decrease`}
        disabled={disabled}
        className={cx(
          'flex h-3.5 w-5 items-center justify-center rounded-[4px]',
          'bg-transparent text-[color:var(--sniptale-color-text-secondary)]',
          'hover:text-[color:var(--sniptale-color-text-primary)]'
        )}
        {...getStepperButtonHandlers({ disabled, direction: -1, start, onStep, onFinish })}
      >
        <ChevronDown size={10} strokeWidth={2.4} />
      </button>
    </span>
  );
}

function getStepperButtonHandlers({
  disabled,
  direction,
  start,
  onStep,
  onFinish,
}: {
  disabled?: boolean | undefined;
  direction: 1 | -1;
  start: (direction: 1 | -1, pointerId: number) => void;
  onStep: NumericStepperProps['onStep'];
  onFinish: NumericStepperProps['onFinish'];
}) {
  return {
    onClick: (event: React.MouseEvent<HTMLButtonElement>) => {
      if (disabled || event.detail !== 0) return;
      event.stopPropagation();
      onStep(direction);
      onFinish?.();
    },
    onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => {
      if (disabled || event.button !== 0) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      start(direction, event.pointerId);
    },
  };
}

function bindPointerRelease(pointerId: number, finish: (commit: boolean) => void) {
  const handlePointerEnd = (event: PointerEvent) => {
    if (event.pointerId !== pointerId) return;
    finish(event.type === 'pointerup');
  };
  const cancel = () => finish(false);
  const handleKeyDown = (event: KeyboardEvent) => {
    if (
      event.key !== 'Escape' &&
      !((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z')
    )
      return;
    event.preventDefault();
    event.stopPropagation();
    cancel();
  };
  window.addEventListener('pointerup', handlePointerEnd, true);
  window.addEventListener('pointercancel', handlePointerEnd, true);
  window.addEventListener('blur', cancel);
  window.addEventListener('keydown', handleKeyDown, true);
  return () => {
    window.removeEventListener('pointerup', handlePointerEnd, true);
    window.removeEventListener('pointercancel', handlePointerEnd, true);
    window.removeEventListener('blur', cancel);
    window.removeEventListener('keydown', handleKeyDown, true);
  };
}
