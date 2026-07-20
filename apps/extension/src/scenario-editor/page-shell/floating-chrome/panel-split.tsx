import { useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';

import { floatingChromeClassNames } from '@sniptale/ui/floating-chrome';

const MIN_PANEL_RATIO = 0.28;
const MAX_PANEL_RATIO = 0.72;

function clampSplitRatio(value: number) {
  return Math.min(MAX_PANEL_RATIO, Math.max(MIN_PANEL_RATIO, value));
}

export function useFloatingPanelSplit(defaultRatio = 0.58) {
  const [ratio, setRatio] = useState(defaultRatio);
  const stepResize = (direction: 1 | -1) => {
    setRatio((current) => clampSplitRatio(current + direction * 0.05));
  };

  const startResize = (event: PointerEvent<HTMLButtonElement>) => {
    const container = event.currentTarget.parentElement;
    if (!container) {
      return;
    }
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const rect = container.getBoundingClientRect();
    const update = (clientY: number) => {
      setRatio(clampSplitRatio((clientY - rect.top) / Math.max(1, rect.height)));
    };
    update(event.clientY);
  };

  const updateResize = (event: PointerEvent<HTMLButtonElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
      return;
    }
    const container = event.currentTarget.parentElement;
    if (!container) {
      return;
    }
    const rect = container.getBoundingClientRect();
    setRatio(clampSplitRatio((event.clientY - rect.top) / Math.max(1, rect.height)));
  };

  return { ratio, startResize, stepResize, updateResize };
}

export function FloatingPanelSplitHandle(props: {
  label: string;
  onKeyStep: (direction: 1 | -1) => void;
  onPointerDown: (event: PointerEvent<HTMLButtonElement>) => void;
  onPointerMove: (event: PointerEvent<HTMLButtonElement>) => void;
}) {
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      props.onKeyStep(-1);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      props.onKeyStep(1);
    }
  };

  return (
    <button
      type="button"
      aria-label={props.label}
      title={props.label}
      onKeyDown={handleKeyDown}
      onPointerDown={props.onPointerDown}
      onPointerMove={props.onPointerMove}
      className={floatingChromeClassNames(
        'group flex h-3 shrink-0 cursor-row-resize items-center justify-center rounded-full',
        'bg-transparent transition',
        'focus-visible:outline focus-visible:outline-2',
        'focus-visible:outline-[var(--sniptale-color-border-accent-strong)]'
      )}
    >
      <span
        className={floatingChromeClassNames(
          'block h-1.5 w-16 rounded-full',
          'bg-[color:color-mix(in_srgb,var(--sniptale-color-text-inverse)_18%,transparent)]',
          'transition group-hover:bg-[color:color-mix(in_srgb,var(--sniptale-color-accent)_52%,transparent)]'
        )}
      />
    </button>
  );
}
