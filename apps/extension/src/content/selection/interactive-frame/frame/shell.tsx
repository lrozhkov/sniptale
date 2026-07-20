import React from 'react';
import type { FrameData, ResizeDirection } from '../../../../features/highlighter/contracts';
import { StepBadge } from '../../step-badge';
import { InteractiveFrameResizeHandles } from './handles';
import { getInteractiveFrameContainerStyle } from '../layout/style';

interface InteractiveFrameFrameShellProps {
  currentFrame: FrameData;
  frame: FrameData;
  frameRef: React.RefObject<HTMLDivElement | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  frameStyle: React.CSSProperties;
  frameZIndex: number;
  state: 'idle' | 'hover' | 'editing';
  borderColor: string;
  borderWidth: number;
  borderShadow?: NonNullable<FrameData['borderSettings']>['shadow'];
  tempFrame: FrameData;
  handleMouseDown: (event: React.MouseEvent) => void;
  handleResizeStart: (event: React.MouseEvent, direction: ResizeDirection) => void;
}

/** Renders the fixed frame container, resize handles, and optional step badge. */
export function InteractiveFrameFrameShell(props: InteractiveFrameFrameShellProps) {
  return (
    <div
      ref={props.containerRef as React.RefObject<HTMLDivElement>}
      className="sniptale-frame-container"
      style={getInteractiveFrameContainerStyle(props.currentFrame)}
    >
      <div
        ref={props.frameRef as React.RefObject<HTMLDivElement>}
        className="sniptale-interactive-frame"
        onMouseDown={props.handleMouseDown}
        style={{
          ...props.frameStyle,
          position: 'relative',
          top: 0,
          left: 0,
          zIndex: props.frameZIndex,
        }}
      >
        <InteractiveFrameResizeHandles
          state={props.state}
          tempFrame={props.tempFrame}
          borderColor={props.borderColor}
          onResizeStart={props.handleResizeStart}
        />
        {props.frame.stepBadge?.enabled && props.frame.stepBadge.value && (
          <StepBadge
            settings={props.frame.stepBadge}
            borderColor={props.borderColor}
            borderWidth={props.borderWidth}
            zIndex={props.frameZIndex}
            {...(props.borderShadow === undefined ? {} : { shadow: props.borderShadow })}
          />
        )}
      </div>
    </div>
  );
}
