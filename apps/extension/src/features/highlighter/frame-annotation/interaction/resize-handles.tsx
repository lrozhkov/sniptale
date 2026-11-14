import React, { useEffect, useState, type CSSProperties } from 'react';
import type { ResizeDirection } from '../../contracts';
import type { FrameAnnotationRect } from '../model';
import { FRAME_ANNOTATION_Z_INDEX } from './z-index';

const FRAME_ANNOTATION_RESIZE_DIRECTIONS: ResizeDirection[] = [
  'nw',
  'n',
  'ne',
  'e',
  'se',
  's',
  'sw',
  'w',
];

export function FrameAnnotationResizeHandleLayer(props: {
  borderColor?: string;
  directions?: ResizeDirection[];
  frameId: string;
  frameRect: FrameAnnotationRect;
  handleSize: number;
  visualScale?: number;
  strokeWidth?: number;
  position?: 'absolute' | 'fixed';
  onResizeStart: (event: React.PointerEvent, direction: ResizeDirection) => void;
}) {
  const resolvedBorderColor = 'var(--sniptale-color-canvas-selection, #2563eb)';
  const [pressed, setPressed] = useState<ResizeDirection | null>(null);
  useEffect(() => {
    if (!pressed) return;
    const release = () => setPressed(null);
    window.addEventListener('pointerup', release, true);
    window.addEventListener('pointercancel', release, true);
    window.addEventListener('blur', release);
    return () => {
      window.removeEventListener('pointerup', release, true);
      window.removeEventListener('pointercancel', release, true);
      window.removeEventListener('blur', release);
    };
  }, [pressed]);

  const baseStyle: CSSProperties = {
    position: props.position ?? 'fixed',
    width: props.handleSize,
    height: props.handleSize,
    boxSizing: 'border-box',
    backgroundColor: '#ffffff',
    border: `1.25px solid ${resolvedBorderColor}`,
    borderRadius: '2px',
    zIndex: FRAME_ANNOTATION_Z_INDEX.resizeHandles,
    pointerEvents: 'auto',
  };

  return (
    <>
      {(props.directions ?? FRAME_ANNOTATION_RESIZE_DIRECTIONS).map((direction) => (
        <div
          key={direction}
          aria-hidden="true"
          className="sniptale-resize-handle"
          data-direction={direction}
          data-frame-control="resize-handle"
          data-frame-id={props.frameId}
          onPointerDown={(event) => {
            let closest = direction,
              distance = Infinity;
            for (const candidate of event.currentTarget.parentElement?.querySelectorAll<HTMLElement>(
              '[data-frame-control="resize-handle"]'
            ) ?? []) {
              if (candidate.dataset['frameId'] !== props.frameId) continue;
              const rect = candidate.getBoundingClientRect();
              if (!rect.width || !rect.height) continue;
              const candidateDirection = (
                props.directions ?? FRAME_ANNOTATION_RESIZE_DIRECTIONS
              ).find((value) => value === candidate.dataset['direction']);
              const next = Math.hypot(
                event.clientX - rect.left - rect.width / 2,
                event.clientY - rect.top - rect.height / 2
              );
              if (candidateDirection && next < distance) {
                closest = candidateDirection;
                distance = next;
              }
            }
            setPressed(closest);
            props.onResizeStart(event, closest);
          }}
          style={{
            ...baseStyle,
            backgroundColor: pressed === direction ? resolvedBorderColor : '#ffffff',
            ...getFrameAnnotationResizeHandleStyle(
              direction,
              props.frameRect,
              direction.length === 2 ? 9 : direction === 'n' || direction === 's' ? 12 : 6,
              direction.length === 2 ? 9 : direction === 'n' || direction === 's' ? 6 : 12
            ),
            width: direction.length === 2 ? 9 : direction === 'n' || direction === 's' ? 12 : 6,
            height: direction.length === 2 ? 9 : direction === 'n' || direction === 's' ? 6 : 12,
            borderRadius: direction.length === 2 ? 1.5 : 3,
            cursor: getFrameAnnotationResizeCursor(direction),
          }}
        >
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              width: 22,
              height: 22,
              transform: 'translate(-50%, -50%)',
              pointerEvents: 'auto',
            }}
          />
        </div>
      ))}
    </>
  );
}

function getFrameAnnotationResizeHandleStyle(
  direction: ResizeDirection,
  frame: FrameAnnotationRect,
  width: number,
  height: number
): CSSProperties {
  const half = width / 2;
  const halfY = height / 2;
  const right = frame.x + frame.width;
  const bottom = frame.y + frame.height;
  const centerX = frame.x + frame.width / 2 - half;
  const centerY = frame.y + frame.height / 2 - halfY;
  switch (direction) {
    case 'nw':
      return { left: frame.x - half, top: frame.y - halfY };
    case 'n':
      return { left: centerX, top: frame.y - halfY };
    case 'ne':
      return { left: right - half, top: frame.y - halfY };
    case 'e':
      return { left: right - half, top: centerY };
    case 'se':
      return { left: right - half, top: bottom - halfY };
    case 's':
      return { left: centerX, top: bottom - halfY };
    case 'sw':
      return { left: frame.x - half, top: bottom - halfY };
    case 'w':
      return { left: frame.x - half, top: centerY };
  }
}

function getFrameAnnotationResizeCursor(direction: ResizeDirection): string {
  if (direction === 'nw' || direction === 'se') return 'nwse-resize';
  if (direction === 'ne' || direction === 'sw') return 'nesw-resize';
  if (direction === 'n' || direction === 's') return 'ns-resize';
  return 'ew-resize';
}
