import React from 'react';
import type { CSSProperties } from 'react';
import type { FrameData, ResizeDirection } from '../../../../features/highlighter/contracts';
import { getCursorForDirection, Z_INDEX_FLOATING_UI } from '../layout/portal';
import { getResizeHandleStyle } from '../layout/resize-handle-position';

export function InteractiveFrameResizeHandleLayer(props: {
  directions: ResizeDirection[];
  tempFrame: FrameData;
  handleSize: number;
  borderWidth: number;
  borderColor?: string;
  onResizeStart: (event: React.PointerEvent, direction: ResizeDirection) => void;
}) {
  const { directions, tempFrame, handleSize, borderWidth, borderColor, onResizeStart } = props;
  const resolvedBorderColor = borderColor ?? 'var(--sniptale-color-accent)';

  const baseStyle: CSSProperties = {
    position: 'fixed',
    width: `${handleSize}px`,
    height: `${handleSize}px`,
    boxSizing: 'border-box',
    backgroundColor: '#ffffff',
    border: `1px solid color-mix(in srgb, ${resolvedBorderColor} 46%, var(--sniptale-color-border-soft))`,
    borderRadius: '50%',
    boxShadow: '0 1px 4px color-mix(in srgb, var(--sniptale-color-shadow-strong) 22%, transparent)',
    zIndex: Z_INDEX_FLOATING_UI,
    pointerEvents: 'auto',
  };

  return (
    <>
      {directions.map((dir) => (
        <div
          key={dir}
          className="sniptale-resize-handle"
          data-direction={dir}
          style={{
            ...baseStyle,
            ...getResizeHandleStyle(dir, tempFrame, handleSize, borderWidth),
            cursor: getCursorForDirection(dir),
          }}
          aria-hidden="true"
          onPointerDown={(event) => onResizeStart(event, dir)}
        />
      ))}
    </>
  );
}
