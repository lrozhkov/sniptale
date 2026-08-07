import React, { type CSSProperties } from 'react';
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
  strokeWidth?: number;
  position?: 'absolute' | 'fixed';
  onResizeStart: (event: React.PointerEvent, direction: ResizeDirection) => void;
}) {
  const resolvedBorderColor = props.borderColor ?? 'var(--sniptale-color-accent)';
  const baseStyle: CSSProperties = {
    position: props.position ?? 'fixed',
    width: props.handleSize,
    height: props.handleSize,
    boxSizing: 'border-box',
    backgroundColor: '#ffffff',
    border: `1px solid color-mix(in srgb, ${resolvedBorderColor} 46%, var(--sniptale-color-border-soft))`,
    borderRadius: '50%',
    boxShadow: '0 1px 4px color-mix(in srgb, var(--sniptale-color-shadow-strong) 22%, transparent)',
    zIndex: FRAME_ANNOTATION_Z_INDEX.floatingUi,
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
          onPointerDown={(event) => props.onResizeStart(event, direction)}
          style={{
            ...baseStyle,
            ...getFrameAnnotationResizeHandleStyle(
              direction,
              insetRectToStrokeCenter(props.frameRect, props.strokeWidth ?? 0),
              props.handleSize
            ),
            cursor: getFrameAnnotationResizeCursor(direction),
          }}
        />
      ))}
    </>
  );
}

function insetRectToStrokeCenter(
  frame: FrameAnnotationRect,
  strokeWidth: number
): FrameAnnotationRect {
  const inset = Math.max(0, strokeWidth) / 2;
  return {
    x: frame.x + inset,
    y: frame.y + inset,
    width: Math.max(0, frame.width - inset * 2),
    height: Math.max(0, frame.height - inset * 2),
  };
}

function getFrameAnnotationResizeHandleStyle(
  direction: ResizeDirection,
  frame: FrameAnnotationRect,
  handleSize: number
): CSSProperties {
  const half = handleSize / 2;
  const right = frame.x + frame.width;
  const bottom = frame.y + frame.height;
  const centerX = frame.x + frame.width / 2 - half;
  const centerY = frame.y + frame.height / 2 - half;
  switch (direction) {
    case 'nw':
      return { left: frame.x - half, top: frame.y - half };
    case 'n':
      return { left: centerX, top: frame.y - half };
    case 'ne':
      return { left: right - half, top: frame.y - half };
    case 'e':
      return { left: right - half, top: centerY };
    case 'se':
      return { left: right - half, top: bottom - half };
    case 's':
      return { left: centerX, top: bottom - half };
    case 'sw':
      return { left: frame.x - half, top: bottom - half };
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
