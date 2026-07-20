import React from 'react';
import type { CSSProperties } from 'react';
import type { FrameData, ResizeDirection } from '../../../../features/highlighter/contracts';
import { getCursorForDirection, Z_INDEX_FLOATING_UI } from '../layout/portal';
import { getResizeHandleStyle } from '../layout/resize-handle-position';

export function InteractiveFrameResizeHandleLayer(props: {
  directions: ResizeDirection[];
  tempFrame: FrameData;
  handleSize: number;
  offset: number;
  borderColor?: string;
  onResizeStart: (event: React.MouseEvent, direction: ResizeDirection) => void;
}) {
  const { directions, tempFrame, handleSize, offset, borderColor, onResizeStart } = props;
  const resolvedBorderColor = borderColor ?? 'var(--sniptale-color-accent)';

  const baseStyle: CSSProperties = {
    position: 'fixed',
    width: `${handleSize}px`,
    height: `${handleSize}px`,
    backgroundColor: 'var(--sniptale-color-surface-base)',
    border: `1px solid ${resolvedBorderColor}`,
    borderRadius: '2px',
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
            ...getResizeHandleStyle(dir, tempFrame, handleSize, offset),
            cursor: getCursorForDirection(dir),
          }}
          onMouseDown={(event) => onResizeStart(event, dir)}
        />
      ))}
    </>
  );
}
