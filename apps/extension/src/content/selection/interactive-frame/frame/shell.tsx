import React from 'react';
import type { FrameData, ResizeDirection } from '../../../../features/highlighter/contracts';
import { dispatchFrameStepBadgeChanged } from '../../../platform/page-context/frame-events';
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
        <InteractiveFrameResizeHandles
          state={props.state}
          isResizeHovered={props.isResizeHovered}
          tempFrame={props.tempFrame}
          borderColor={props.borderColor}
          borderWidth={props.borderWidth}
          onResizeStart={props.handleResizeStart}
        />
        {props.currentFrame.stepBadge?.enabled && props.currentFrame.stepBadge.value && (
          <StepBadge
            settings={props.currentFrame.stepBadge}
            borderColor={props.borderColor}
            borderWidth={props.borderWidth}
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
            zIndex={props.frameZIndex}
            {...(props.borderShadow === undefined ? {} : { shadow: props.borderShadow })}
          />
        )}
      </div>
    </div>
  );
}
