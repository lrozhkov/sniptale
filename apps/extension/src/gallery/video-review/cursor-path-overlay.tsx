import { useState, useEffect, useRef } from 'react';
import { translate } from '../../platform/i18n';
import { layoutCursorFocusControls } from '../../ui/cursor-focus-control-layout';
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
  sampleCursorFocusSegment,
  cursorFocusKeyControls,
} from '../../features/video/project/cursor-focus-path/evaluator';

/** Editor-only bounded handles. One pointer gesture owns its draft, cancellation and commit. */
interface ReviewCursorOverlayProps {
  path: CursorFocusPath;
  time: number;
  width: number;
  height: number;
  displayWidth?: number;
  bounds?: { left: number; top: number; right: number; bottom: number };
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
  const rawControls = cursorFocusKeyControls(segment, selected.id, path.smoothing);
  const controls = layoutReviewCursorControls(props, selected, rawControls);
  const point = (position: CursorFocusPoint) =>
    `${position.x * props.width},${position.y * props.height}`;
  const curve = sampleCursorFocusSegment(segment, path.smoothing).map(point).join(' ');
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
        <g key={key.id}>
          <circle
            cx={key.x * props.width}
            cy={key.y * props.height}
            r={handleRadius * (key.id === selected.id ? 1 : 0.7)}
            fill="color-mix(in srgb, var(--sniptale-color-accent) 25%, transparent)"
            stroke={
              key.id === selected.id
                ? 'var(--sniptale-color-accent)'
                : 'var(--sniptale-color-text-secondary)'
            }
            strokeWidth={key.id === selected.id ? 3 : 1.5}
            vectorEffect="non-scaling-stroke"
            aria-pressed={key.id === selected.id}
            data-cursor-focus-key={key.id}
            className="pointer-events-auto cursor-grab"
            role="button"
            tabIndex={0}
            aria-label={`${translate('videoEditor.sidebar.cursorFocusPathTitle')} ${key.time.toFixed(2)}`}
            onPointerDown={(event) => begin(event, key)}
            onKeyDown={(event) => navigateReviewCursorPoint(event, key, props, commitGeometry)}
          />
          {key.id === selected.id ? (
            <circle
              cx={key.x * props.width}
              cy={key.y * props.height}
              r={handleRadius * 0.25}
              fill="var(--sniptale-color-accent)"
            />
          ) : null}
        </g>
      ))}
      <ReviewCursorTangents
        props={props}
        selected={selected}
        controls={controls}
        handleRadius={handleRadius}
        begin={begin}
      />
    </svg>
  );
}

/** Tangent rendering and keyboard edits share the parent gesture and authoring authority. */
function ReviewCursorTangents({
  props,
  selected,
  controls,
  handleRadius,
  begin,
}: {
  props: ReviewCursorOverlayProps;
  selected: CursorFocusKey;
  controls: ReturnType<typeof cursorFocusKeyControls>;
  handleRadius: number;
  begin(
    event: React.PointerEvent<SVGCircleElement>,
    key: CursorFocusKey,
    handle?: 'incoming' | 'outgoing'
  ): void;
}) {
  return (
    <>
      {(['incoming', 'outgoing'] as const).map((handle) => {
        const position = controls[handle];
        if (!position) return null;
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
              r={handleRadius}
              fill="transparent"
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
                      [handle]: boundReviewCursorControl(props, {
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
                      }),
                    })
                  );
                }
              }}
            />
            <rect
              x={position.x * props.width - handleRadius * 0.4}
              y={position.y * props.height - handleRadius * 0.4}
              width={handleRadius * 0.8}
              height={handleRadius * 0.8}
              rx={handleRadius * 0.15}
              fill="color-mix(in srgb, var(--sniptale-color-accent) 25%, transparent)"
              stroke="var(--sniptale-color-accent)"
              strokeWidth="1.5"
              vectorEffect="non-scaling-stroke"
            />
          </g>
        );
      })}
    </>
  );
}

function layoutReviewCursorControls(
  props: ReviewCursorOverlayProps,
  selected: CursorFocusKey,
  controls: ReturnType<typeof cursorFocusKeyControls>
) {
  const width = props.displayWidth ?? props.width,
    height = (width * props.height) / props.width;
  const bounds = props.bounds ?? { left: 0, top: 0, right: 1, bottom: 1 };
  const display = (point: CursorFocusPoint | undefined) =>
    point && Math.hypot(point.x - selected.x, point.y - selected.y) > Number.EPSILON
      ? { x: point.x * width, y: point.y * height }
      : undefined;
  const layout = layoutCursorFocusControls({
    point: { x: selected.x * width, y: selected.y * height },
    controls: { incoming: display(controls.incoming), outgoing: display(controls.outgoing) },
    bounds: {
      left: bounds.left * width,
      top: bounds.top * height,
      right: bounds.right * width,
      bottom: bounds.bottom * height,
    },
  });
  const source = (point: CursorFocusPoint | undefined) =>
    point ? { x: point.x / width, y: point.y / height } : undefined;
  return { incoming: source(layout.incoming), outgoing: source(layout.outgoing) };
}

function boundReviewCursorControl(
  props: ReviewCursorOverlayProps,
  point: CursorFocusPoint
): CursorFocusPoint {
  const bounds = props.bounds ?? { left: 0, top: 0, right: 1, bottom: 1 };
  const radius = (props.width * 14) / (props.displayWidth ?? props.width);
  const insetX = Math.min(radius / props.width, (bounds.right - bounds.left) / 2);
  const insetY = Math.min(radius / props.height, (bounds.bottom - bounds.top) / 2);
  return {
    x: Math.max(bounds.left + insetX, Math.min(bounds.right - insetX, point.x)),
    y: Math.max(bounds.top + insetY, Math.min(bounds.bottom - insetY, point.y)),
  };
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
      .filter((item) => item.distance <= 14)
      .toSorted((a, b) => a.distance - b.distance);
    const activated = candidates.find((item) => item.name === handle);
    handle =
      candidates[0] && candidates[0].distance < distance(selected)
        ? activated && Math.abs(activated.distance - candidates[0].distance) < 0.01
          ? handle
          : candidates[0].name
        : undefined;
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
    next = updateCursorFocusKey(
      base,
      key.id,
      handle ? { [handle]: boundReviewCursorControl(props, position) } : position
    );
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
