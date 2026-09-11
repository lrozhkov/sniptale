import { useEffect, useRef, useState, type CSSProperties } from 'react';

type PanelSide = 'left' | 'right';
const limits = {
  left: { min: 180, max: 320, initial: 224 },
  right: { min: 260, max: 420, initial: 300 },
};

/** Owns disposable panel visibility and dimensions; resizing never edits the guide. */
export function useGuidePanels() {
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(() => window.innerWidth >= 1200);
  const [widths, setWidths] = useState({ left: 224, right: 300 });
  const cancel = useRef<(() => void) | null>(null);
  useEffect(() => () => cancel.current?.(), []);
  const resize = (side: PanelSide, value: number) => {
    const bound = limits[side];
    setWidths((current) => ({
      ...current,
      [side]: Math.max(bound.min, Math.min(bound.max, value)),
    }));
  };
  return {
    leftOpen,
    rightOpen,
    toggleLeft: () => setLeftOpen((open) => !open),
    toggleRight: () => setRightOpen((open) => !open),
    widths,
    resize,
    cancel,
    style: {
      '--guide-left-width': `${leftOpen ? widths.left : 0}px`,
      '--guide-right-width': `${rightOpen ? widths.right : 0}px`,
    } as CSSProperties,
  };
}

/** Pointer and keyboard resizing share bounds; Escape restores the starting width. */
export function GuidePanelDivider({
  side,
  panels,
  label,
}: {
  side: PanelSide;
  panels: ReturnType<typeof useGuidePanels>;
  label: string;
}) {
  const bound = limits[side];
  const direction = side === 'left' ? 1 : -1;
  return (
    <div
      className={`guide-panel-divider guide-panel-divider-${side}`}
      role="separator"
      aria-label={label}
      aria-orientation="vertical"
      aria-valuemin={bound.min}
      aria-valuemax={bound.max}
      aria-valuenow={panels.widths[side]}
      tabIndex={0}
      onDoubleClick={() => panels.resize(side, bound.initial)}
      onKeyDown={(event) => {
        if (event.key === 'Home') panels.resize(side, bound.initial);
        else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight')
          panels.resize(
            side,
            panels.widths[side] + (event.key === 'ArrowRight' ? 16 : -16) * direction
          );
        else return;
        event.preventDefault();
      }}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        panels.cancel.current?.();
        const start = panels.widths[side];
        const origin = event.clientX;
        const pointerId = event.pointerId;
        const move = (next: PointerEvent) => {
          if (next.pointerId === pointerId)
            panels.resize(side, start + (next.clientX - origin) * direction);
        };
        const cleanup = () => {
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', finish);
          window.removeEventListener('pointercancel', abort);
          window.removeEventListener('keydown', key);
          window.removeEventListener('blur', restore);
          panels.cancel.current = null;
        };
        const restore = () => {
          panels.resize(side, start);
          cleanup();
        };
        const finish = (next: PointerEvent) => {
          if (next.pointerId === pointerId) cleanup();
        };
        const abort = (next: PointerEvent) => {
          if (next.pointerId === pointerId) restore();
        };
        const key = (next: KeyboardEvent) => {
          if (next.key !== 'Escape') return;
          next.preventDefault();
          restore();
        };
        panels.cancel.current = cleanup;
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', finish);
        window.addEventListener('pointercancel', abort);
        window.addEventListener('keydown', key);
        window.addEventListener('blur', restore);
      }}
    />
  );
}
