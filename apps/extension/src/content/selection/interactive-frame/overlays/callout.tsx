import React from 'react';
import type { FrameData } from '../../../../features/highlighter/contracts';
import { resolveFrameSurface } from '../../../../features/highlighter/frame-surface';
import { useFrameUIStore } from '../../frame-runtime/state/frame-ui.store';
import { Callout } from '../../callout';
import {
  getCalloutFrameColors,
  resolveCalloutColorBindings,
} from '../../../../features/highlighter/callout-color-bindings';
import { createFrameCalloutActions } from '../../../../features/highlighter/frame-annotation/callout/actions';

interface InteractiveFrameCalloutOverlayProps {
  frame: FrameData;
  currentFrame: FrameData;
  frameZIndex: number;
  isCalloutEditing: boolean;
  isCalloutPopoverOpen: boolean;
  isFrameEditing: boolean;
  calloutPopoverAnchorRef: React.RefObject<HTMLButtonElement | null>;
  setIsCalloutEditing: React.Dispatch<React.SetStateAction<boolean>>;
  setTempFrame: React.Dispatch<React.SetStateAction<FrameData>>;
  onUpdate: (frame: FrameData) => void;
}

function createCalloutActions(args: {
  apply: (callout: NonNullable<FrameData['callout']>) => void;
  callout: NonNullable<FrameData['callout']>;
  frameId: string;
  props: InteractiveFrameCalloutOverlayProps;
  toggleSettings: (frameId: string, popover: 'callout-settings') => void;
}): Pick<
  React.ComponentProps<typeof Callout>,
  | 'onContentChange'
  | 'onCurveChange'
  | 'onDelete'
  | 'onPositionChange'
  | 'onSettingsClick'
  | 'onStartEditing'
  | 'onStopEditing'
  | 'onTailBaseRangeChange'
  | 'onTailFramePositionChange'
  | 'onTitleChange'
  | 'onWaypointChange'
  | 'onWidthChange'
> {
  return createFrameCalloutActions({
    apply: args.apply,
    callout: args.callout,
    onDelete: () => {
      args.apply({ ...args.callout, enabled: false });
      args.props.setIsCalloutEditing(false);
    },
    onSettingsClick: () => args.toggleSettings(args.frameId, 'callout-settings'),
    onStartEditing: () => args.props.setIsCalloutEditing(true),
    onStopEditing: () => args.props.setIsCalloutEditing(false),
  });
}

/** Renders the editable callout overlay and keeps its update/delete behavior local to the callout seam. */
export function InteractiveFrameCalloutOverlay(props: InteractiveFrameCalloutOverlayProps) {
  const isAnyFrameSelected = useFrameUIStore((state) => state.selectedFrameId !== null);
  const toggleQuickPopover = useFrameUIStore((state) => state.toggleQuickPopover);
  const callout = props.currentFrame.callout ?? props.frame.callout;
  if (!callout?.enabled) {
    return null;
  }
  const effectMode = props.currentFrame.effectMode ?? props.frame.effectMode ?? 'border';
  const frameSurface = resolveFrameSurface({
    ...props.currentFrame,
    effectMode,
  });
  const frameBorderWidth = frameSurface.strokeVisible ? frameSurface.geometry.strokeWidth : 0;
  const frameColors = getCalloutFrameColors(
    props.currentFrame.borderSettings ?? props.frame.borderSettings
  );
  const resolvedCallout = {
    ...callout,
    style: resolveCalloutColorBindings(callout.style, frameColors),
  };

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
      frameBorderWidth={frameBorderWidth}
      settings={resolvedCallout}
      frameRect={props.currentFrame}
      zIndex={props.frameZIndex + 1}
      isEditing={props.isCalloutEditing}
      isFrameEditing={props.isFrameEditing}
      isSettingsOpen={props.isCalloutPopoverOpen}
      {...createCalloutActions({
        apply: applyCalloutFrameUpdate,
        callout,
        frameId: props.frame.id,
        props,
        toggleSettings: toggleQuickPopover,
      })}
      settingsAnchorRef={props.calloutPopoverAnchorRef}
      showSettingsHandle={!isAnyFrameSelected}
    />
  );
}
