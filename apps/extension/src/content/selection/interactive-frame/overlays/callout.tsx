import React from 'react';
import type { FrameData } from '../../../../features/highlighter/contracts';
import { Callout } from '../../callout';

interface InteractiveFrameCalloutOverlayProps {
  frame: FrameData;
  currentFrame: FrameData;
  frameZIndex: number;
  isCalloutEditing: boolean;
  setIsCalloutEditing: React.Dispatch<React.SetStateAction<boolean>>;
  setTempFrame: React.Dispatch<React.SetStateAction<FrameData>>;
  onUpdate: (frame: FrameData) => void;
}

/** Renders the editable callout overlay and keeps its update/delete behavior local to the callout seam. */
export function InteractiveFrameCalloutOverlay(props: InteractiveFrameCalloutOverlayProps) {
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
      onStartEditing={() => props.setIsCalloutEditing(true)}
      onStopEditing={() => props.setIsCalloutEditing(false)}
      onContentChange={(htmlContent) => {
        applyCalloutFrameUpdate({ ...callout, htmlContent });
      }}
      onDelete={() => {
        applyCalloutFrameUpdate({ ...callout, enabled: false });
        props.setIsCalloutEditing(false);
      }}
    />
  );
}
