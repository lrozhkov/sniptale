import type { CSSProperties } from 'react';
import type { FrameData, ResizeDirection } from '../../../../features/highlighter/contracts';

export function getResizeHandleStyle(
  direction: ResizeDirection,
  frame: FrameData,
  handleSize: number,
  borderWidth: number
): CSSProperties {
  const halfHandle = handleSize / 2;
  const leftStrokeCenter = frame.x + borderWidth / 2;
  const topStrokeCenter = frame.y + borderWidth / 2;
  const rightStrokeCenter = frame.x + frame.width + borderWidth * 1.5;
  const bottomStrokeCenter = frame.y + frame.height + borderWidth * 1.5;
  const centerX = (leftStrokeCenter + rightStrokeCenter) / 2 - halfHandle;
  const centerY = (topStrokeCenter + bottomStrokeCenter) / 2 - halfHandle;

  switch (direction) {
    case 'nw':
      return { top: topStrokeCenter - halfHandle, left: leftStrokeCenter - halfHandle };
    case 'n':
      return { top: topStrokeCenter - halfHandle, left: centerX };
    case 'ne':
      return { top: topStrokeCenter - halfHandle, left: rightStrokeCenter - halfHandle };
    case 'e':
      return { top: centerY, left: rightStrokeCenter - halfHandle };
    case 'se':
      return { top: bottomStrokeCenter - halfHandle, left: rightStrokeCenter - halfHandle };
    case 's':
      return { top: bottomStrokeCenter - halfHandle, left: centerX };
    case 'sw':
      return { top: bottomStrokeCenter - halfHandle, left: leftStrokeCenter - halfHandle };
    case 'w':
      return { top: centerY, left: leftStrokeCenter - halfHandle };
  }
}
