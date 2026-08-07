import type { CSSProperties } from 'react';
import type { FrameAnnotationInteractionState, FrameAnnotationVisualState } from './model';

export function getFrameAnnotationInteractiveStyle(params: {
  frame: FrameAnnotationVisualState;
  state: FrameAnnotationInteractionState;
}): CSSProperties {
  return {
    opacity: 1,
    position: 'relative',
    top: 0,
    left: 0,
    width: `${params.frame.width}px`,
    height: `${params.frame.height}px`,
    boxSizing: 'border-box',
    margin: 0,
    padding: 0,
    border: 'none',
    background: 'transparent',
    pointerEvents: params.state === 'editing' || params.state === 'resizing' ? 'auto' : 'none',
    cursor: params.state === 'editing' ? 'move' : 'default',
  };
}

export function getFrameAnnotationFillStyle(params: {
  decorationVisible: boolean;
  fillVisible: boolean;
  fillColor: string;
  borderRadius: number;
  customCssStyles?: CSSProperties;
}): CSSProperties {
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
  };
}

export function getFrameAnnotationStrokeStyle(params: {
  visible: boolean;
  borderWidth: number;
  borderStyle: string;
  borderColor: string;
  borderRadius: number;
  boxShadow?: string;
}): CSSProperties {
  const outwardWidth = Math.max(0, params.borderWidth);
  return {
    position: 'absolute',
    inset: outwardWidth === 0 ? 0 : -outwardWidth,
    width: `calc(100% + ${outwardWidth * 2}px)`,
    height: `calc(100% + ${outwardWidth * 2}px)`,
    boxSizing: 'border-box',
    margin: 0,
    padding: 0,
    border: params.visible
      ? `${params.borderWidth}px ${params.borderStyle} ${params.borderColor}`
      : 'none',
    borderRadius: `${params.borderRadius === 0 ? 0 : params.borderRadius + outwardWidth}px`,
    boxShadow: params.visible ? params.boxShadow : undefined,
    background: 'transparent',
    zIndex: 1,
    pointerEvents: 'none',
  };
}

export function getFrameAnnotationContainerStyle(frame: FrameAnnotationVisualState): CSSProperties {
  return {
    position: 'absolute',
    top: `${frame.y}px`,
    left: `${frame.x}px`,
    width: `${frame.width}px`,
    height: `${frame.height}px`,
    pointerEvents: 'none',
    zIndex: 'auto',
  };
}
