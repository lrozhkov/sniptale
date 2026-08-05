import React from 'react';
import type { FrameData } from '../../../../features/highlighter/contracts';
import { resolveFrameSurface } from '../../../../features/highlighter/frame-surface';
import { useFrameUIStore } from '../../frame-runtime/state/frame-ui.store';
import { Callout } from '../../callout';
import {
  getCalloutFrameColors,
  resolveCalloutColorBindings,
} from '../../../../features/highlighter/callout-color-bindings';

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
  const { apply, callout } = args;
  return {
    onStartEditing: () => args.props.setIsCalloutEditing(true),
    onStopEditing: () => args.props.setIsCalloutEditing(false),
    onContentChange: (bodyHtml) => apply({ ...callout, content: { ...callout.content, bodyHtml } }),
    onTitleChange: (titleText) => apply({ ...callout, content: { ...callout.content, titleText } }),
    onDelete: () => {
      apply({ ...callout, enabled: false });
      args.props.setIsCalloutEditing(false);
    },
    onSettingsClick: () => args.toggleSettings(args.frameId, 'callout-settings'),
    onPositionChange: (manualPlacement, behavior) =>
      apply({
        ...callout,
        placement: {
          ...callout.placement,
          manualPlacement,
          connectorBasePosition: behavior.connectorBasePosition,
          connectorBaseWidth: behavior.connectorBaseWidth,
          connectorFramePosition: behavior.connectorFramePosition,
          connectorWaypoint: behavior.connectorWaypoint,
          ...(behavior.translateConnectorGeometry
            ? {
                connectorAttachments: {
                  block:
                    behavior.connectorBasePosition === undefined
                      ? (callout.placement.connectorAttachments?.block ?? { mode: 'auto' })
                      : {
                          mode: 'free' as const,
                          perimeterPosition: behavior.connectorBasePosition,
                        },
                  frame:
                    behavior.connectorFramePosition === undefined
                      ? (callout.placement.connectorAttachments?.frame ?? { mode: 'auto' })
                      : {
                          mode: 'free' as const,
                          perimeterPosition: behavior.connectorFramePosition,
                        },
                },
              }
            : {}),
        },
      }),
    onTailBaseRangeChange: (connectorBasePosition, connectorBaseWidth, attachment) =>
      apply({
        ...callout,
        placement: {
          ...callout.placement,
          connectorAttachments: {
            block: attachment ?? { mode: 'free', perimeterPosition: connectorBasePosition },
            frame: callout.placement.connectorAttachments?.frame ?? { mode: 'auto' },
          },
          connectorBasePosition,
          connectorBaseWidth,
        },
      }),
    onTailFramePositionChange: (connectorFramePosition, attachment) =>
      apply({
        ...callout,
        placement: {
          ...callout.placement,
          connectorAttachments: {
            block: callout.placement.connectorAttachments?.block ?? { mode: 'auto' },
            frame: attachment ?? { mode: 'free', perimeterPosition: connectorFramePosition },
          },
          connectorFramePosition,
        },
      }),
    onWaypointChange: (connectorWaypoint) =>
      apply({
        ...callout,
        placement: { ...callout.placement, connectorWaypoint },
      }),
    onCurveChange: (curve) =>
      apply({
        ...callout,
        style: {
          ...callout.style,
          connector: { ...callout.style.connector, curve },
        },
      }),
    onWidthChange: (maxWidth, manualPlacement) =>
      apply({
        ...callout,
        placement: { ...callout.placement, manualPlacement },
        style: {
          ...callout.style,
          typography: { ...callout.style.typography, maxWidth },
        },
      }),
  };
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
