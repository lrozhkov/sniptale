import './panel-layout.css';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import { translate } from '../../platform/i18n';

type Panel = 'inspector' | 'timeline';
type Preferences = Record<Panel, number | null>;
type Drag = {
  panel: Panel;
  pointer: number;
  target: HTMLDivElement;
  coordinate: number;
  size: number;
  previous: number | null;
};

type PanelResize = {
  panel: Panel;
  size: number;
  min: number;
  max: number;
  onPointerDown(event: PointerEvent<HTMLDivElement>): void;
  onPointerMove(event: PointerEvent<HTMLDivElement>): void;
  onPointerUp(event: PointerEvent<HTMLDivElement>): void;
  onPointerCancel(): void;
  onLostPointerCapture(): void;
  onKeyDown(event: KeyboardEvent<HTMLDivElement>): void;
  onDoubleClick(): void;
};

/** Axis-aware key policy; undefined means consume without changing this panel. */
function panelKeySize(panel: Panel, key: string, size: number, min: number, max: number) {
  const sizes: Partial<Record<string, number | null>> = {
    Enter: null,
    Home: min,
    End: max,
    [panel === 'inspector' ? 'ArrowLeft' : 'ArrowUp']: size + 24,
    [panel === 'inspector' ? 'ArrowRight' : 'ArrowDown']: size - 24,
  };
  return Object.hasOwn(sizes, key) ? sizes[key] : undefined;
}

const resizeKeys = new Set([
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Home',
  'End',
  'Enter',
  ' ',
]);

/** Mounted-editor preferences; effective bounds never overwrite the user's requested sizes. */
export function useReviewPanelLayout(enabled: boolean) {
  const container = useRef<HTMLDivElement>(null);
  const timeline = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const [preferences, setPreferences] = useState<Preferences>({ inspector: null, timeline: null });
  const [frame, setFrame] = useState({ width: 1254, height: 536, timeline: 140 });
  const bounds = {
    inspector: { min: 320, max: Math.max(320, Math.min(800, frame.width - 512)) },
    timeline: { min: 120, max: Math.max(120, frame.height - 220) },
  };
  const clamp = (panel: Panel, value: number) =>
    Math.round(Math.max(bounds[panel].min, Math.min(bounds[panel].max, value)));
  const inspectorWidth = enabled ? clamp('inspector', preferences.inspector ?? 320) : 320;
  const timelineHeight =
    enabled && preferences.timeline !== null ? clamp('timeline', preferences.timeline) : null;
  const current = useRef({ enabled, preferences, bounds });
  current.current = { enabled, preferences, bounds };
  const finish = useCallback((restore: boolean) => {
    const active = drag.current;
    if (!active) return;
    drag.current = null;
    if (restore) setPreferences((value) => ({ ...value, [active.panel]: active.previous }));
    if (active.target.hasPointerCapture(active.pointer))
      active.target.releasePointerCapture(active.pointer);
  }, []);
  useEffect(() => {
    if (!enabled) finish(true);
  }, [enabled, finish]);
  useEffect(() => {
    const node = container.current;
    if (!node) return;
    const measure = () => {
      const style = getComputedStyle(node);
      const next = {
        width:
          node.clientWidth -
          parseFloat(style.paddingLeft || '0') -
          parseFloat(style.paddingRight || '0'),
        height:
          node.clientHeight -
          parseFloat(style.paddingTop || '0') -
          parseFloat(style.paddingBottom || '0'),
        timeline: timeline.current?.getBoundingClientRect().height ?? 140,
      };
      setFrame((old) =>
        old.width === next.width && old.height === next.height && old.timeline === next.timeline
          ? old
          : next
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    if (timeline.current) observer.observe(timeline.current);
    const cancel = () => finish(true);
    window.addEventListener('blur', cancel);
    return () => {
      observer.disconnect();
      window.removeEventListener('blur', cancel);
      finish(false);
    };
  }, [finish]);
  const update = (panel: Panel, value: number | null) => {
    if (!current.current.enabled) return;
    const { min, max } = current.current.bounds[panel];
    const next = value === null ? null : Math.round(Math.max(min, Math.min(max, value)));
    setPreferences((old) => (old[panel] === next ? old : { ...old, [panel]: next }));
  };
  const resize = (panel: Panel): PanelResize => {
    const size = panel === 'inspector' ? inspectorWidth : (timelineHeight ?? frame.timeline);
    const reset = () => {
      finish(false);
      update(panel, null);
    };
    return {
      panel,
      size,
      ...bounds[panel],
      onDoubleClick: reset,
      onPointerDown: (event) => {
        if (event.button !== 0 || !current.current.enabled) return;
        event.preventDefault();
        event.stopPropagation();
        finish(true);
        event.currentTarget.focus();
        drag.current = {
          panel,
          pointer: event.pointerId,
          target: event.currentTarget,
          coordinate: panel === 'inspector' ? event.clientX : event.clientY,
          size,
          previous: current.current.preferences[panel],
        };
        event.currentTarget.setPointerCapture(event.pointerId);
      },
      onPointerMove: (event) => {
        const active = drag.current;
        if (!active || active.pointer !== event.pointerId) return;
        const coordinate = active.panel === 'inspector' ? event.clientX : event.clientY;
        update(active.panel, active.size + active.coordinate - coordinate);
      },
      onPointerUp: (event) => {
        if (drag.current?.pointer === event.pointerId) finish(false);
      },
      onPointerCancel: () => finish(true),
      onLostPointerCapture: () => finish(true),
      onKeyDown: (event) => {
        if (event.altKey || event.ctrlKey || event.metaKey) return;
        if (event.key === 'Escape') {
          if (drag.current) {
            event.preventDefault();
            event.stopPropagation();
            finish(true);
          }
          return;
        }
        if (!resizeKeys.has(event.key)) return;
        event.preventDefault();
        event.stopPropagation();
        finish(false);
        const value = panelKeySize(panel, event.key, size, bounds[panel].min, bounds[panel].max);
        if (value !== undefined) update(panel, value);
      },
    };
  };
  return {
    container,
    timeline,
    inspectorWidth,
    timelineHeight,
    inspector: resize('inspector'),
    timelineResize: resize('timeline'),
  };
}

/** Native separator keyboard semantics with a hit target over the existing panel seam. */
export function ReviewPanelResizeHandle({ resize }: { resize: PanelResize }) {
  const { panel, size, min, max, ...events } = resize;
  return (
    <div
      {...events}
      data-review-panel-resize={panel}
      data-ui={`gallery.videoReview.resize${panel === 'inspector' ? 'Inspector' : 'Timeline'}`}
      role="separator"
      aria-label={translate(
        panel === 'inspector'
          ? 'videoEditor.sidebar.resizeInspector'
          : 'gallery.videoReview.resizeTimeline'
      )}
      aria-orientation={panel === 'inspector' ? 'vertical' : 'horizontal'}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={Math.round(size)}
      title={translate('gallery.videoReview.resizePanelHint')}
      tabIndex={0}
      className={`review-panel-resize absolute z-20 touch-none outline-offset-[-2px]
        focus-visible:outline focus-visible:outline-2
        focus-visible:outline-[var(--sniptale-color-focus-ring)] ${
          panel === 'inspector' ? 'inset-y-0 -left-1 w-2' : 'inset-x-0 -top-1 h-2'
        }`}
    />
  );
}
