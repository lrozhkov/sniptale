import React from 'react';
import type { FrameData, ResizeDirection } from '../../../../features/highlighter/contracts';
import { FrameAnnotationResizeHandleLayer } from '../../../../features/highlighter/frame-annotation/interaction/resize-handles';

export function InteractiveFrameResizeHandleLayer(props: {
  directions: ResizeDirection[];
  frameId: string;
  tempFrame: FrameData;
  handleSize: number;
  strokeWidth: number;
  visualScale?: number;
  borderColor?: string;
  onResizeStart: (event: React.PointerEvent, direction: ResizeDirection) => void;
}) {
  return (
    <FrameAnnotationResizeHandleLayer
      directions={props.directions}
      frameId={props.frameId}
      frameRect={props.tempFrame}
      handleSize={props.handleSize}
      strokeWidth={props.strokeWidth}
      {...(props.visualScale === undefined ? {} : { visualScale: props.visualScale })}
      onResizeStart={props.onResizeStart}
      {...(props.borderColor === undefined ? {} : { borderColor: props.borderColor })}
    />
  );
}
