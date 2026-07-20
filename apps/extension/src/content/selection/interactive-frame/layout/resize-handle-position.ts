import type { CSSProperties } from 'react';
import type { FrameData, ResizeDirection } from '../../../../features/highlighter/contracts';

export function getResizeHandleStyle(
  direction: ResizeDirection,
  frame: FrameData,
  handleSize: number,
  offset: number
): CSSProperties {
  const halfHandle = handleSize / 2;
  const right = frame.x + frame.width;
  const bottom = frame.y + frame.height;
  const centerX = frame.x + frame.width / 2 - halfHandle;
  const centerY = frame.y + frame.height / 2 - halfHandle;

  switch (direction) {
    case 'nw':
      return { top: frame.y + offset, left: frame.x + offset };
    case 'n':
      return { top: frame.y + offset, left: centerX };
    case 'ne':
      return { top: frame.y + offset, left: right - handleSize - offset };
    case 'e':
      return { top: centerY, left: right - handleSize - offset };
    case 'se':
      return { top: bottom - handleSize - offset, left: right - handleSize - offset };
    case 's':
      return { top: bottom - handleSize - offset, left: centerX };
    case 'sw':
      return { top: bottom - handleSize - offset, left: frame.x + offset };
    case 'w':
      return { top: centerY, left: frame.x + offset };
  }
}
