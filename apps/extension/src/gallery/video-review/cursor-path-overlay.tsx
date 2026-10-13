import { useState, useEffect, useRef } from 'react';
import { translate } from '../../platform/i18n';
import type {
  CursorFocusPath,
  CursorFocusPoint,
  CursorFocusKey,
} from '../../features/video/project/cursor-focus-path/types';
import {
  updateCursorFocusKey,
  cursorFocusOverrideId,
  compareCursorFocusKeys,
} from '../../features/video/project/cursor-focus-path/authoring';
import {
  evaluateCursorFocusSegment,
  cursorFocusKeyControls,
} from '../../features/video/project/cursor-focus-path/evaluator';

/** Editor-only bounded handles. One pointer gesture owns its draft, cancellation and commit. */
interface ReviewCursorOverlayProps {
  path: CursorFocusPath;
  time: number;
  width: number;
  height: number;
  displayWidth?: number;
  onChange(path: CursorFocusPath): void;
  onSeek(time: number): void;
  selectedKeyId?: string;
  onSelect?(id: string, time: number): void;
}

export function ReviewCursorPathOverlay(props: ReviewCursorOverlayProps) {
  const [draft, setDraft] = useState<CursorFocusPath | null>(null);
  const cancel = useRef<(() => void) | null>(null);
  useEffect(() => () => cancel.current?.(), []);
  const path = draft ?? props.path;
  const segment =
    path.segments.find((item) => item.keys.some((key) => key.id === props.selectedKeyId)) ??
    path.segments.find((item) => props.time >= item.start && props.time <= item.end);
  if (!segment) return null;
  const selectedIndex = segment.keys.findIndex((key) => key.id === props.selectedKeyId);
  const index =
    selectedIndex >= 0
      ? selectedIndex
      : segment.keys.reduce(
          (closest, key, current) =>
            Math.abs(key.time - props.time) < Math.abs(segment.keys[closest]!.time - props.time) ||
            (Math.abs(key.time - props.time) ===
              Math.abs(segment.keys[closest]!.time - props.time) &&
              compareCursorFocusKeys(key, segment.keys[closest]!) > 0)
              ? current
              : closest,
          0
        );
  const keys = segment.keys.slice(Math.max(0, index - 1), index + 2);
  const selected = segment.keys[index]!;
  const handleRadius = (props.width * 10) / (props.displayWidth ?? props.width);
  const controls = cursorFocusKeyControls(segment, selected.id, path.smoothing);
  const point = (position: CursorFocusPoint) =>
    `${position.x * props.width},${position.y * props.height}`;
  const curve = Array.from({ length: 49 }, (_, step) =>
    evaluateCursorFocusSegment(
      segment,
      segment.start + ((segment.end - segment.start) * step) / 48,
      path.smoothing
    )
  )
    .filter((item) => item !== null)
    .map(point)
    .join(' ');
  const commitGeometry = (next: CursorFocusPath, id: string) => {
    props.onChange(next);
    const override = next.segments
      .flatMap((item) => item.keys)
      .find((item) => item.id === cursorFocusOverrideId(id));
    if (override) props.onSelect?.(override.id, override.time);
  };
  const begin = (
    event: React.PointerEvent<SVGCircleElement>,
    key: CursorFocusKey,
    handle?: 'incoming' | 'outgoing'
  ) =>
    beginReviewCursorGesture({ props, selected, controls, setDraft, cancel }, event, key, handle);

  return (
    <svg
      data-ui="cursorFocusPath.overlay"
      className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
      viewBox={`0 0 ${props.width} ${props.height}`}
      aria-label={translate('videoEditor.sidebar.cursorFocusPathTitle')}
    >
      <polyline
        points={curve}
        fill="none"
        stroke="var(--sniptale-color-accent)"
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
      />
      {keys.map((key) => (
        <circle
          key={key.id}
          cx={key.x * props.width}
          cy={key.y * props.height}
          r={handleRadius}
          fill="var(--sniptale-color-surface-panel)"
          stroke="var(--sniptale-color-accent)"
          strokeWidth="2"
          className="pointer-events-auto cursor-grab"
          role="button"
          tabIndex={0}
          aria-label={`${translate('videoEditor.sidebar.cursorFocusPathTitle')} ${key.time.toFixed(2)}`}
          onPointerDown={(event) => begin(event, key)}
          onKeyDown={(event) => navigateReviewCursorPoint(event, key, props, commitGeometry)}
        />
      ))}
      {(['incoming', 'outgoing'] as const).map((handle) => {
        const position = controls[handle];
        if (!position || Math.hypot(position.x - selected.x, position.y - selected.y) < 0.005)
          return null;
        return (
          <g key={handle}>
            <line
              x1={selected.x * props.width}
              y1={selected.y * props.height}
              x2={position.x * props.width}
              y2={position.y * props.height}
              stroke="var(--sniptale-color-text-secondary)"
              strokeDasharray="3 3"
            />
            <circle
              cx={position.x * props.width}
              cy={position.y * props.height}
              r={handleRadius * 0.8}
              fill="var(--sniptale-color-text-primary)"
              className="pointer-events-auto cursor-grab"
              role="button"
              tabIndex={0}
              aria-label={translate(
                handle === 'incoming'
                  ? 'videoEditor.sidebar.cursorFocusIncoming'
                  : 'videoEditor.sidebar.cursorFocusOutgoing'
              )}
              onPointerDown={(event) => begin(event, selected, handle)}
              onKeyDown={(event) => {
                if (event.key.startsWith('Arrow')) {
                  event.preventDefault();
                  props.onChange(
                    updateCursorFocusKey(props.path, selected.id, {
                      [handle]: {
                        x:
                          position.x +
                          (event.key === 'ArrowRight'
                            ? 0.01
                            : event.key === 'ArrowLeft'
                              ? -0.01
                              : 0),
                        y:
                          position.y +
                          (event.key === 'ArrowDown' ? 0.01 : event.key === 'ArrowUp' ? -0.01 : 0),
                      },
                    })
                  );
                }
              }}
            />
          </g>
        );
      })}
    </svg>
  );
}

function beginReviewCursorGesture(
  context: {
    props: ReviewCursorOverlayProps;
    selected: CursorFocusKey;
    controls: ReturnType<typeof cursorFocusKeyControls>;
    setDraft(path: CursorFocusPath | null): void;
    cancel: { current: (() => void) | null };
  },
  event: React.PointerEvent<SVGCircleElement>,
  key: CursorFocusKey,
  handle?: 'incoming' | 'outgoing'
) {
  const { props, selected, controls, setDraft, cancel } = context;
  const svg = event.currentTarget.ownerSVGElement;
  if (!svg) return;
  const rect = svg.getBoundingClientRect();
  if (key.id === selected.id) {
    const distance = (position: { x: number; y: number }) =>
      Math.hypot(
        event.clientX - rect.left - position.x * rect.width,
        event.clientY - rect.top - position.y * rect.height
      );
    const candidates = (['incoming', 'outgoing'] as const)
      .filter((name) => controls[name] !== undefined)
      .map((name) => ({ name, distance: distance(controls[name]!) }))
      .filter((item) => item.distance <= 12)
      .toSorted((a, b) => a.distance - b.distance);
    handle =
      candidates[0] && candidates[0].distance < distance(selected) ? candidates[0].name : undefined;
  }
  if (!handle && props.onSelect && props.selectedKeyId !== key.id) {
    event.preventDefault();
    event.stopPropagation();
    props.onSelect(key.id, key.time);
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  const base = props.path;
  let next = base;
  const move = (pointer: PointerEvent) => {
    const position = {
      x: (pointer.clientX - rect.left) / rect.width,
      y: (pointer.clientY - rect.top) / rect.height,
    };
    next = updateCursorFocusKey(base, key.id, handle ? { [handle]: position } : position);
    setDraft(next);
  };
  const cleanup = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', finish);
    window.removeEventListener('pointercancel', abort);
    window.removeEventListener('blur', abort);
    window.removeEventListener('keydown', escape);
    cancel.current = null;
    setDraft(null);
  };
  const finish = () => {
    cleanup();
    if (next !== base) {
      props.onChange(next);
      const override = next.segments
        .flatMap((item) => item.keys)
        .find((item) => item.id === cursorFocusOverrideId(key.id));
      if (!handle && override) props.onSelect?.(override.id, override.time);
    }
  };
  const abort = () => cleanup();
  const escape = (keyboard: KeyboardEvent) => {
    if (keyboard.key === 'Escape') {
      keyboard.preventDefault();
      keyboard.stopPropagation();
      abort();
    }
  };
  cancel.current?.();
  cancel.current = abort;
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', finish);
  window.addEventListener('pointercancel', abort);
  window.addEventListener('blur', abort);
  window.addEventListener('keydown', escape, { capture: false });
}
function navigateReviewCursorPoint(
  event: React.KeyboardEvent<SVGCircleElement>,
  key: CursorFocusKey,
  props: ReviewCursorOverlayProps,
  commitGeometry: (path: CursorFocusPath, id: string) => void
) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    event.stopPropagation();
    if (props.onSelect) props.onSelect(key.id, key.time);
    else props.onSeek(key.time);
  }
  if (event.key.startsWith('Arrow')) {
    event.preventDefault();
    event.stopPropagation();
    commitGeometry(
      updateCursorFocusKey(props.path, key.id, {
        x: key.x + (event.key === 'ArrowRight' ? 0.01 : event.key === 'ArrowLeft' ? -0.01 : 0),
        y: key.y + (event.key === 'ArrowDown' ? 0.01 : event.key === 'ArrowUp' ? -0.01 : 0),
      }),
      key.id
    );
  }
}
