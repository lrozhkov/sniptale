import { translate } from '../../platform/i18n';
import { useEffect, useRef, useState } from 'react';
import type { CursorFocusPath } from '../../features/video/project/cursor-focus-path/types';
import { sampleCursorFocusSegment } from '../../features/video/project/cursor-focus-path/evaluator';
import {
  projectQuickEditPoint,
  invertQuickEditProjection,
  type QuickEditHomography,
} from '../../features/video/composition/motion/spatial-geometry';

/** Handles use the same presented plane and inverse projection as content editing. */
export function ReviewCursorMotionOverlay(props: {
  path: CursorFocusPath;
  selectedKeyId?: string;
  onSelect?(id: string, time: number): void;
  onChange(path: CursorFocusPath): void;
  output: { width: number; height: number };
  video: { x: number; y: number; width: number; height: number };
  projection?: QuickEditHomography | undefined;
}) {
  const [draft, setDraft] = useState<CursorFocusPath | null>(null);
  const gesture = useRef<{
    pointer: number;
    id: string;
    before: CursorFocusPath;
    after: CursorFocusPath;
  } | null>(null);
  const cancel = () => {
    gesture.current = null;
    setDraft(null);
  };
  useEffect(() => {
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancel();
    };
    window.addEventListener('keydown', escape);
    window.addEventListener('blur', cancel);
    return () => {
      window.removeEventListener('keydown', escape);
      window.removeEventListener('blur', cancel);
    };
  }, []);
  const path = draft ?? props.path;
  const segment = path.segments[0];
  if (!segment) return null;
  const point = (p: { x: number; y: number }) => {
    const v = {
      x: props.video.x + p.x * props.video.width,
      y: props.video.y + p.y * props.video.height,
    };
    return props.projection ? (projectQuickEditPoint(props.projection, v) ?? v) : v;
  };
  const samples = sampleCursorFocusSegment(segment, path.smoothing).map(point);
  return (
    <svg
      data-ui="gallery.videoReview.cursorMotionPath"
      className="pointer-events-none absolute inset-0 h-full w-full overflow-hidden"
      viewBox={`0 0 ${props.output.width} ${props.output.height}`}
      aria-label={translate('gallery.videoReview.cursorMotionTrack')}
      onPointerMove={(e) => {
        const d = gesture.current;
        if (!d || d.pointer !== e.pointerId) return;
        e.stopPropagation();
        const bounds = e.currentTarget.getBoundingClientRect();
        let p = {
          x: ((e.clientX - bounds.left) * props.output.width) / bounds.width,
          y: ((e.clientY - bounds.top) * props.output.height) / bounds.height,
        };
        const inverse = props.projection && invertQuickEditProjection(props.projection);
        if (inverse) p = projectQuickEditPoint(inverse, p) ?? p;
        const x = Math.max(0, Math.min(1, (p.x - props.video.x) / props.video.width));
        const y = Math.max(0, Math.min(1, (p.y - props.video.y) / props.video.height));
        d.after = {
          ...d.before,
          segments: d.before.segments.map((s) => ({
            ...s,
            keys: s.keys.map((k) => (k.id === d.id ? { ...k, x, y } : k)),
          })),
        };
        setDraft(d.after);
      }}
      onPointerUp={(e) => {
        const d = gesture.current;
        if (!d || d.pointer !== e.pointerId) return;
        e.stopPropagation();
        cancel();
        if (e.currentTarget.hasPointerCapture(e.pointerId))
          e.currentTarget.releasePointerCapture(e.pointerId);
        if (d.after !== d.before) props.onChange(d.after);
      }}
      onPointerCancel={cancel}
    >
      <polyline
        points={samples.map((p) => `${p.x},${p.y}`).join(' ')}
        fill="none"
        stroke="var(--sniptale-color-accent)"
        strokeWidth={2}
        strokeDasharray="5 4"
      />
      {segment.keys.map((key, index) => {
        const p = point(key);
        return (
          <g key={key.id}>
            <circle
              data-cursor-motion-point={key.id}
              className="pointer-events-auto cursor-move"
              cx={p.x}
              cy={p.y}
              r={key.id === props.selectedKeyId ? 10 : 8}
              fill="var(--sniptale-color-surface-panel)"
              stroke="var(--sniptale-color-accent)"
              strokeWidth={2}
              role="button"
              tabIndex={0}
              aria-label={translate('gallery.videoReview.cursorMotionPoint').replace(
                '{number}',
                String(index + 1)
              )}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.stopPropagation();
                  props.onSelect?.(key.id, key.time);
                }
              }}
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                e.preventDefault();
                e.stopPropagation();
                props.onSelect?.(key.id, key.time);
                gesture.current = {
                  pointer: e.pointerId,
                  id: key.id,
                  before: props.path,
                  after: props.path,
                };
                e.currentTarget.ownerSVGElement?.setPointerCapture(e.pointerId);
              }}
            />
            <text
              x={p.x}
              y={p.y + 3.5}
              fontSize={10}
              textAnchor="middle"
              fill="var(--sniptale-color-text-primary)"
            >
              {index + 1}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
