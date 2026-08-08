import React from 'react';
import type { CalloutSettings } from '@sniptale/runtime-contracts/highlighter/callout';
import type { FrameData } from '../../../../features/highlighter/contracts';
import { resolveFrameSurface } from '../../../../features/highlighter/frame-surface';
import { useFrameUIStore } from '../../frame-runtime/state/frame-ui.store';
import { Callout } from '../../callout';
import {
  getCalloutFrameColors,
  resolveCalloutColorBindings,
} from '../../../../features/highlighter/callout-color-bindings';
import { createFrameCalloutActions } from '../../../../features/highlighter/frame-annotation/callout/actions';
import {
  getFrameCallout,
  removeFrameCallout,
  setFrameCallout,
} from '../../../../features/highlighter/frame-annotation/callout/collection';

interface InteractiveFrameCalloutOverlayProps {
  frame: FrameData;
  currentFrame: FrameData;
  frameZIndex: number;
  isCalloutEditing: boolean;
  isCalloutPopoverOpen: boolean;
  isFrameEditing: boolean;
  calloutPopoverAnchorRef: React.RefObject<HTMLButtonElement | null>;
  calloutIndex?: number;
  setActiveCalloutIndex?: React.Dispatch<React.SetStateAction<number>>;
  setIsCalloutEditing: React.Dispatch<React.SetStateAction<boolean>>;
  setTempFrame: React.Dispatch<React.SetStateAction<FrameData>>;
  stageCalloutFrame?: (update: FrameData | ((frame: FrameData) => FrameData)) => FrameData;
  onUpdate: (frame: FrameData) => void;
}

function createCalloutActions(args: {
  apply: (callout: CalloutSettings) => void;
  callout: CalloutSettings;
  frameId: string;
  props: InteractiveFrameCalloutOverlayProps;
  toggleSettings: (frameId: string, popover: 'callout-settings', calloutIndex?: number) => void;
  settingsAnchor: HTMLButtonElement | null;
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
      const nextFrame = args.props.stageCalloutFrame
        ? args.props.stageCalloutFrame(
            (current) => removeFrameCallout(current, args.props.calloutIndex ?? 0) as FrameData
          )
        : (removeFrameCallout(args.props.currentFrame, args.props.calloutIndex ?? 0) as FrameData);
      if (!args.props.stageCalloutFrame) args.props.setTempFrame(nextFrame);
      args.props.onUpdate(nextFrame as FrameData);
      args.props.setIsCalloutEditing(false);
    },
    onSettingsClick: () => {
      args.props.calloutPopoverAnchorRef.current = args.settingsAnchor;
      args.props.setActiveCalloutIndex?.(args.props.calloutIndex ?? 0);
      args.toggleSettings(args.frameId, 'callout-settings', args.props.calloutIndex ?? 0);
    },
    onStartEditing: () => {
      args.props.setActiveCalloutIndex?.(args.props.calloutIndex ?? 0);
      args.props.setIsCalloutEditing(true);
    },
    onStopEditing: () => args.props.setIsCalloutEditing(false),
  });
}

/** Renders the editable callout overlay and keeps its update/delete behavior local to the callout seam. */
export function InteractiveFrameCalloutOverlay(props: InteractiveFrameCalloutOverlayProps) {
  const calloutIndex = props.calloutIndex ?? 0;
  const toggleQuickPopover = useFrameUIStore((state) => state.toggleQuickPopover);
  const localSettingsAnchorRef = React.useRef<HTMLButtonElement | null>(null);
  const callout =
    getFrameCallout(props.currentFrame, calloutIndex) ?? getFrameCallout(props.frame, calloutIndex);
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

  const applyCalloutFrameUpdate = (nextCallout: CalloutSettings) => {
    const nextFrameSnapshot = props.stageCalloutFrame
      ? props.stageCalloutFrame(
          (current) => setFrameCallout(current, calloutIndex, nextCallout) as FrameData
        )
      : (setFrameCallout(props.currentFrame, calloutIndex, nextCallout) as FrameData);
    if (!props.stageCalloutFrame) props.setTempFrame(nextFrameSnapshot);
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
        settingsAnchor: localSettingsAnchorRef.current,
        toggleSettings: toggleQuickPopover,
      })}
      settingsAnchorRef={localSettingsAnchorRef}
      showSettingsHandle
    />
  );
}
