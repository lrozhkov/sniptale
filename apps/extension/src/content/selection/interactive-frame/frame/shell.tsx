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
  state: import('../../../../features/highlighter/contracts').FrameState;
  isResizeHovered: boolean;
  borderColor: string;
  borderWidth: number;
  borderShadow?: NonNullable<FrameData['borderSettings']>['shadow'];
  tempFrame: FrameData;
  handleMouseDown: (event: React.PointerEvent) => void;
  handleResizeStart: (event: React.PointerEvent, direction: ResizeDirection) => void;
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
        onPointerDown={props.handleMouseDown}
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
          isResizeHovered={props.isResizeHovered}
          tempFrame={props.tempFrame}
          borderColor={props.borderColor}
          borderWidth={props.borderWidth}
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
