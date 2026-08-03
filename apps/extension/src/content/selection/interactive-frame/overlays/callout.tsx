import React from 'react';
import type { FrameData } from '../../../../features/highlighter/contracts';
import { useFrameUIStore } from '../../frame-runtime/state/frame-ui.store';
import { Callout } from '../../callout';

interface InteractiveFrameCalloutOverlayProps {
  frame: FrameData;
  currentFrame: FrameData;
  frameZIndex: number;
  isCalloutEditing: boolean;
  isCalloutPopoverOpen: boolean;
  calloutPopoverAnchorRef: React.RefObject<HTMLButtonElement | null>;
  setIsCalloutEditing: React.Dispatch<React.SetStateAction<boolean>>;
  setTempFrame: React.Dispatch<React.SetStateAction<FrameData>>;
  onUpdate: (frame: FrameData) => void;
}

/** Renders the editable callout overlay and keeps its update/delete behavior local to the callout seam. */
export function InteractiveFrameCalloutOverlay(props: InteractiveFrameCalloutOverlayProps) {
  const isAnyFrameSelected = useFrameUIStore((state) => state.selectedFrameId !== null);
  const toggleQuickPopover = useFrameUIStore((state) => state.toggleQuickPopover);
  const callout = props.currentFrame.callout ?? props.frame.callout;
  if (!callout?.enabled) {
    return null;
  }

  const applyCalloutFrameUpdate = (nextCallout: NonNullable<FrameData['callout']>) => {
    const nextFrameSnapshot = {
      ...props.currentFrame,
      callout: nextCallout,
    };

    props.setTempFrame(nextFrameSnapshot);
    props.onUpdate(nextFrameSnapshot);
  };

  return (
    <Callout
      frameId={props.frame.id}
      settings={callout}
      frameRect={props.currentFrame}
      zIndex={props.frameZIndex + 1}
      isEditing={props.isCalloutEditing}
      isSettingsOpen={props.isCalloutPopoverOpen}
      onStartEditing={() => props.setIsCalloutEditing(true)}
      onStopEditing={() => props.setIsCalloutEditing(false)}
      onContentChange={(htmlContent) => {
        applyCalloutFrameUpdate({
          ...callout,
          content: { ...callout.content, bodyHtml: htmlContent },
        });
      }}
      onTitleChange={(titleText) => {
        applyCalloutFrameUpdate({
          ...callout,
          content: { ...callout.content, titleText },
        });
      }}
      onDelete={() => {
        applyCalloutFrameUpdate({ ...callout, enabled: false });
        props.setIsCalloutEditing(false);
      }}
      onSettingsClick={() => toggleQuickPopover(props.frame.id, 'callout-settings')}
      onPositionChange={(manualPlacement) => {
        applyCalloutFrameUpdate({
          ...callout,
          placement: { ...callout.placement, manualPlacement },
        });
      }}
      onTailBaseRangeChange={(tailBasePosition, tailBaseWidth) => {
        applyCalloutFrameUpdate({
          ...callout,
          placement: {
            ...callout.placement,
            connectorBasePosition: tailBasePosition,
            connectorBaseWidth: tailBaseWidth,
          },
        });
      }}
      onTailFramePositionChange={(tailFramePosition) => {
        applyCalloutFrameUpdate({
          ...callout,
          placement: { ...callout.placement, connectorFramePosition: tailFramePosition },
        });
      }}
      onWidthChange={(maxWidth, manualPlacement) => {
        applyCalloutFrameUpdate({
          ...callout,
          placement: { ...callout.placement, manualPlacement },
          style: {
            ...callout.style,
            typography: { ...callout.style.typography, maxWidth },
          },
        });
      }}
      settingsAnchorRef={props.calloutPopoverAnchorRef}
      showSettingsHandle={!isAnyFrameSelected}
    />
  );
}
