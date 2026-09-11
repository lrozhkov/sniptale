import { useEffect, useRef, useState, type CSSProperties } from 'react';

type PanelSide = 'left' | 'right';
type GuideLeftSection = 'structure' | 'resources';
const limits = {
  left: { min: 180, max: 320, initial: 320 },
  right: { min: 260, max: 420, initial: 420 },
};

/** Owns disposable panel visibility and dimensions; resizing never edits the guide. */
export function useGuidePanels() {
  const [viewport, setViewport] = useState(() => window.innerWidth);
  const [leftOpen, setLeftOpen] = useState(() => window.innerWidth >= 720);
  const [leftSection, setLeftSection] = useState<GuideLeftSection>('structure');
  const [rightOpen, setRightOpen] = useState(() => window.innerWidth >= 1200);
  const [requested, setWidths] = useState(() => ({
    left: 320,
    right:
      window.innerWidth >= 1200
        ? Math.max(260, Math.min(420, window.innerWidth - 32 - 640 - 320))
        : 420,
  }));
  const budget = viewport - 32 - 640;
  const inline = viewport >= 1200 && leftOpen && rightOpen;
  const left = Math.min(requested.left, inline ? Math.max(180, budget - 260) : 320);
  const right = Math.min(requested.right, inline ? Math.max(260, budget - left) : 420);
  const widths = { left, right };
  const bounds = {
    left: { ...limits.left, max: inline ? Math.min(320, budget - right) : 320 },
    right: { ...limits.right, max: inline ? Math.min(420, budget - left) : 420 },
  };
  const cancel = useRef<(() => void) | null>(null);
  useEffect(() => {
    const measure = () => setViewport(window.innerWidth);
    const releaseGesture = () => cancel.current?.();
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('resize', measure);
      releaseGesture();
    };
  }, []);
  const resize = (side: PanelSide, value: number) => {
    const bound = bounds[side];
    setWidths((current) => ({
      ...current,
      [side]: Math.max(bound.min, Math.min(bound.max, value)),
    }));
  };
  return {
    leftOpen,
    rightOpen,
    leftSection,
    openLeft: (section: GuideLeftSection) => {
      setLeftSection(section);
      setLeftOpen(true);
    },
    toggleLeft: () => setLeftOpen((open) => !open),
    toggleRight: () => setRightOpen((open) => !open),
    widths,
    bounds,
    resize,
    cancel,
    style: {
      '--guide-left-gap': leftOpen ? '8px' : '0px',
      '--guide-right-gap': rightOpen ? '8px' : '0px',
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
  const bound = panels.bounds[side];
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
      onDoubleClick={() => panels.resize(side, bound.max)}
      onKeyDown={(event) => {
        if (event.key === 'Home') panels.resize(side, bound.max);
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
