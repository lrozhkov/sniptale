import React, { useLayoutEffect, useRef } from 'react';
import type { FrameData, ResizeDirection } from '../../../../features/highlighter/contracts';
import { dispatchFrameStepBadgeChanged } from '../../../platform/page-context/frame-events';
import { registerContentOwnedPassiveChrome } from '../../../platform/dom-host';
import { useFrameUIStore } from '../../frame-runtime/state/frame-ui.store';
import { StepBadge } from '../../step-badge';
import { InteractiveFrameResizeHandles } from './handles';
import { getInteractiveFrameContainerStyle } from '../layout/style';

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
  const isAnyFrameSelected = useFrameUIStore((state) => state.selectedFrameId !== null);
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
      style={getInteractiveFrameContainerStyle(props.currentFrame)}
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
        <div
          aria-hidden="true"
          className="sniptale-interactive-frame-fill"
          data-frame-id={props.frame.id}
          ref={fillRef}
          style={props.fillStyle}
        />
        <div
          aria-hidden="true"
          className="sniptale-interactive-frame-stroke"
          data-frame-id={props.frame.id}
          ref={strokeRef}
          style={props.strokeStyle}
        />
        <InteractiveFrameResizeHandles
          state={props.state}
          isResizeHovered={props.isResizeHovered}
          tempFrame={props.tempFrame}
          borderColor={props.borderColor}
          borderWidth={props.borderWidth}
          onResizeStart={props.handleResizeStart}
        />
      </div>
      {props.currentFrame.stepBadge?.enabled && props.currentFrame.stepBadge.value && (
        <StepBadge
          settings={props.currentFrame.stepBadge}
          borderColor={props.borderColor}
          borderWidth={props.borderWidth}
          {...(props.currentFrame.borderSettings?.fillColor
            ? { fillColor: props.currentFrame.borderSettings.fillColor }
            : {})}
          {...(props.currentFrame.borderSettings?.fillOpacity === undefined
            ? {}
            : { fillOpacity: props.currentFrame.borderSettings.fillOpacity })}
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
          showSettingsHandle={!isAnyFrameSelected}
          {...(props.borderShadow === undefined ? {} : { shadow: props.borderShadow })}
        />
      )}
    </div>
  );
}
