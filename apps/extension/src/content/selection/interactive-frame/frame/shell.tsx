import React, { useLayoutEffect, useRef } from 'react';
import type { FrameData, ResizeDirection } from '../../../../features/highlighter/contracts';
import { dispatchFrameStepBadgeChanged } from '../../../platform/page-context/frame-events';
import { registerContentOwnedPassiveChrome } from '../../../platform/dom-host';
import { useFrameUIStore } from '../../frame-runtime/state/frame-ui.store';
import { StepBadge } from '../../step-badge';
import { InteractiveFrameResizeHandles } from './handles';
import {
  FrameAnnotationDecoration,
  getFrameAnnotationContainerStyle,
  isFrameHiddenDuringCapture,
} from '../../../../features/highlighter/frame-annotation';

interface InteractiveFrameFrameShellProps {
  currentFrame: FrameData;
  frame: FrameData;
  frameRef: React.RefObject<HTMLDivElement | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  frameStyle: React.CSSProperties;
  fillStyle: React.CSSProperties;
  strokeStyle: React.CSSProperties;
  frameZIndex: number;
  state: import('../../../../features/highlighter/contracts').FrameState;
  isResizeHovered: boolean;
  borderColor: string;
  borderWidth: number;
  borderShadow?: NonNullable<FrameData['borderSettings']>['shadow'];
  isStepBadgePopoverOpen: boolean;
  stepBadgePopoverAnchorRef: React.RefObject<HTMLButtonElement | null>;
  tempFrame: FrameData;
  handleMouseDown: (event: React.PointerEvent) => void;
  handleResizeStart: (event: React.PointerEvent, direction: ResizeDirection) => void;
}

/** Renders the fixed frame container, resize handles, and optional step badge. */
export function InteractiveFrameFrameShell(props: InteractiveFrameFrameShellProps) {
  const toggleQuickPopover = useFrameUIStore((state) => state.toggleQuickPopover);
  const fillRef = useRef<HTMLDivElement>(null);
  const strokeRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const cleanups = [
      registerContentOwnedPassiveChrome(props.containerRef.current),
      registerContentOwnedPassiveChrome(props.frameRef.current),
      registerContentOwnedPassiveChrome(fillRef.current),
      registerContentOwnedPassiveChrome(strokeRef.current),
    ];
    return () => cleanups.forEach((cleanup) => cleanup());
  }, [props.containerRef, props.frameRef]);

  return (
    <div
      ref={props.containerRef as React.RefObject<HTMLDivElement>}
      className="sniptale-frame-container"
      data-frame-id={props.frame.id}
      style={getFrameAnnotationContainerStyle(props.currentFrame)}
    >
      <div
        ref={props.frameRef as React.RefObject<HTMLDivElement>}
        className="sniptale-interactive-frame"
        data-frame-id={props.frame.id}
        onPointerDown={props.handleMouseDown}
        style={{
          ...props.frameStyle,
          position: 'relative',
          top: 0,
          left: 0,
          zIndex: props.frameZIndex,
        }}
      >
        <FrameAnnotationDecoration
          frameId={props.frame.id}
          hideDuringCapture={isFrameHiddenDuringCapture(props.currentFrame)}
          fillRef={fillRef}
          strokeRef={strokeRef}
          fillStyle={props.fillStyle}
          strokeStyle={props.strokeStyle}
        />
        <InteractiveFrameResizeHandles
          state={props.state}
          isResizeHovered={props.isResizeHovered}
          tempFrame={
            props.state === 'editing' || props.state === 'resizing'
              ? props.tempFrame
              : props.currentFrame
          }
          borderColor={props.borderColor}
          borderWidth={props.borderWidth}
          onResizeStart={props.handleResizeStart}
        />
      </div>
      {props.currentFrame.stepBadge?.enabled && (
        <StepBadge
          settings={props.currentFrame.stepBadge}
          borderColor={props.borderColor}
          borderWidth={props.borderWidth}
          {...(props.currentFrame.borderSettings?.fillColor
            ? { fillColor: props.currentFrame.borderSettings.fillColor }
            : {})}
          frameRect={props.currentFrame}
          isSettingsOpen={props.isStepBadgePopoverOpen}
          onPositionChange={(manualPlacement) => {
            dispatchFrameStepBadgeChanged({
              frameId: props.frame.id,
              settings: { manualPlacement },
            });
          }}
          onSettingsClick={() => toggleQuickPopover(props.frame.id, 'step-badge')}
          settingsAnchorRef={props.stepBadgePopoverAnchorRef}
          showSettingsHandle
          {...(props.borderShadow === undefined ? {} : { shadow: props.borderShadow })}
        />
      )}
    </div>
  );
}
