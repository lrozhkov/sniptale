import type React from 'react';
import type { FrameData } from '../../../../features/highlighter/contracts';

export function getInteractiveFrameStyle(params: {
  currentFrame: FrameData;
  shouldShowBorder: boolean;
  borderWidth: number;
  borderStyle: string;
  borderColor: string;
  borderRadius: number;
  fillColor: string;
  boxShadow?: string;
  customCssStyles?: React.CSSProperties;
  state: 'idle' | 'hover' | 'editing';
}) {
  return {
    border: params.shouldShowBorder
      ? `${params.borderWidth}px ${params.borderStyle} ${params.borderColor}`
      : 'none',
    borderRadius: `${params.borderRadius}px`,
    opacity: 1,
    boxShadow: params.shouldShowBorder ? params.boxShadow : undefined,
    backgroundColor: params.fillColor,
    ...params.customCssStyles,
    position: 'relative',
    top: 0,
    left: 0,
    width: `${params.currentFrame.width}px`,
    height: `${params.currentFrame.height}px`,
    boxSizing: 'content-box',
    margin: 0,
    padding: 0,
    pointerEvents: params.state === 'editing' ? 'auto' : 'none',
    cursor: params.state === 'editing' ? 'move' : 'default',
  } satisfies React.CSSProperties;
}

export function getInteractiveFrameContainerStyle(frame: FrameData) {
  return {
    position: 'absolute',
    top: `${frame.y}px`,
    left: `${frame.x}px`,
    width: `${frame.width}px`,
    height: `${frame.height}px`,
    pointerEvents: 'none',
    zIndex: 'auto',
  } satisfies React.CSSProperties;
}
