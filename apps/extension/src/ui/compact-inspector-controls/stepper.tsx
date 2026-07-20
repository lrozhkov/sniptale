import type React from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useStepperRepeat } from '@sniptale/ui/compact-inspector-controls/stepper-repeat';
import { cx } from './shared';

interface NumericStepperProps {
  disabled?: boolean | undefined;
  label: string;
  onStep: (direction: 1 | -1) => void;
}

export function NumericStepper({ disabled, label, onStep }: NumericStepperProps) {
  const repeat = useStepperRepeat(onStep);

  return (
    <span
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
          'hover:bg-[color:var(--sniptale-color-surface-hover)]'
        )}
        {...getStepperButtonHandlers({ disabled, direction: 1, repeat })}
      >
        <ChevronUp size={10} strokeWidth={2.4} />
      </button>
      <button
        type="button"
        aria-label={`${label} decrease`}
        disabled={disabled}
        className={cx(
          'flex h-3.5 w-5 items-center justify-center rounded-[4px]',
          'hover:bg-[color:var(--sniptale-color-surface-hover)]'
        )}
        {...getStepperButtonHandlers({ disabled, direction: -1, repeat })}
      >
        <ChevronDown size={10} strokeWidth={2.4} />
      </button>
    </span>
  );
}

function getStepperButtonHandlers({
  disabled,
  direction,
  repeat,
}: {
  disabled?: boolean | undefined;
  direction: 1 | -1;
  repeat: ReturnType<typeof useStepperRepeat>;
}) {
  return {
    onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => {
      if (disabled) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      repeat.start(direction);
      bindPointerRelease(repeat.stop);
    },
    onPointerCancel: repeat.stop,
    onPointerUp: repeat.stop,
  };
}

function bindPointerRelease(stop: () => void) {
  const handlePointerUp = () => {
    stop();
    window.removeEventListener('pointerup', handlePointerUp);
    window.removeEventListener('pointercancel', handlePointerUp);
  };
  window.addEventListener('pointerup', handlePointerUp);
  window.addEventListener('pointercancel', handlePointerUp);
}
