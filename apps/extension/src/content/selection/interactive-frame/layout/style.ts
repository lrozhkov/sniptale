import type React from 'react';
import type { FrameData, FrameState } from '../../../../features/highlighter/contracts';

export function getInteractiveFrameStyle(params: { currentFrame: FrameData; state: FrameState }) {
  return {
    opacity: 1,
    position: 'relative',
    top: 0,
    left: 0,
    width: `${params.currentFrame.width}px`,
    height: `${params.currentFrame.height}px`,
    boxSizing: 'border-box',
    margin: 0,
    padding: 0,
    border: 'none',
    background: 'transparent',
    pointerEvents: params.state === 'editing' || params.state === 'resizing' ? 'auto' : 'none',
    cursor: params.state === 'editing' ? 'move' : 'default',
  } satisfies React.CSSProperties;
}

export function getInteractiveFrameFillStyle(params: {
  decorationVisible: boolean;
  fillVisible: boolean;
  fillColor: string;
  borderRadius: number;
  customCssStyles?: React.CSSProperties;
}) {
  return {
    backgroundColor: params.fillVisible ? params.fillColor : 'transparent',
    ...(params.decorationVisible ? params.customCssStyles : undefined),
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    boxSizing: 'border-box',
    margin: 0,
    padding: 0,
    border: 'none',
    outline: 'none',
    clipPath: 'none',
    overflow: 'hidden',
    borderRadius: `${params.borderRadius}px`,
    zIndex: 0,
    pointerEvents: 'none',
  } satisfies React.CSSProperties;
}

export function getInteractiveFrameStrokeStyle(params: {
  visible: boolean;
  borderWidth: number;
  borderStyle: string;
  borderColor: string;
  borderRadius: number;
  boxShadow?: string;
}) {
  return {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    boxSizing: 'border-box',
    margin: 0,
    padding: 0,
    border: params.visible
      ? `${params.borderWidth}px ${params.borderStyle} ${params.borderColor}`
      : 'none',
    borderRadius: `${params.borderRadius}px`,
    boxShadow: params.visible ? params.boxShadow : undefined,
    background: 'transparent',
    zIndex: 1,
    pointerEvents: 'none',
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
