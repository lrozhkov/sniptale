import React from 'react';
import type { EffectMode, FrameData } from '../../../../features/highlighter/contracts';
import { CalloutSettingsPopover } from '../../callout-settings-popover';
import { FrameSettingsPopover } from '../../frame-settings-popover';
import { StepBadgePopover } from '../../step-badge-popover';
import { InteractiveFrameCalloutOverlay } from './callout';

export interface InteractiveFramePopoversProps {
  frame: FrameData;
  currentFrame: FrameData;
  frameZIndex: number;
  effectMode: EffectMode;
  isPopoverOpen: boolean;
  isStepBadgePopoverOpen: boolean;
  isCalloutPopoverOpen: boolean;
  isCalloutEditing: boolean;
  popoverAnchorRef: React.RefObject<HTMLButtonElement | null>;
  stepBadgePopoverAnchorRef: React.RefObject<HTMLButtonElement | null>;
  calloutPopoverAnchorRef: React.RefObject<HTMLButtonElement | null>;
  setIsStepBadgePopoverOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsCalloutPopoverOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsCalloutEditing: React.Dispatch<React.SetStateAction<boolean>>;
  setTempFrame: React.Dispatch<React.SetStateAction<FrameData>>;
  closePopover: () => void;
  onUpdate: (frame: FrameData) => void;
}

function applyFrameSettingsPatch(
  frame: FrameData,
  settings: {
    borderSettings?: FrameData['borderSettings'];
    blurSettings?: FrameData['blurSettings'];
    focusSettings?: FrameData['focusSettings'];
  }
): FrameData {
  return {
    ...frame,
    ...(settings.borderSettings === undefined ? {} : { borderSettings: settings.borderSettings }),
    ...(settings.blurSettings === undefined ? {} : { blurSettings: settings.blurSettings }),
    ...(settings.focusSettings === undefined ? {} : { focusSettings: settings.focusSettings }),
  };
}

function createFrameSettingsProps(props: InteractiveFramePopoversProps) {
  return {
    isOpen: props.isPopoverOpen,
    onClose: props.closePopover,
    effectMode: props.effectMode,
    frameId: props.currentFrame.id,
    onApplyToFrame: (settings: {
      borderSettings?: FrameData['borderSettings'];
      blurSettings?: FrameData['blurSettings'];
      focusSettings?: FrameData['focusSettings'];
    }) => {
      const nextFrame = applyFrameSettingsPatch(props.currentFrame, settings);
      props.setTempFrame(nextFrame);
      props.onUpdate(nextFrame);
    },
    anchorEl: props.popoverAnchorRef.current,
    ...(props.currentFrame.borderSettings === undefined
      ? {}
      : { borderSettings: props.currentFrame.borderSettings }),
    ...(props.currentFrame.blurSettings === undefined
      ? {}
      : { blurSettings: props.currentFrame.blurSettings }),
    ...(props.currentFrame.focusSettings === undefined
      ? {}
      : { focusSettings: props.currentFrame.focusSettings }),
  };
}

function createStepBadgeProps(props: InteractiveFramePopoversProps) {
  return {
    isOpen: props.isStepBadgePopoverOpen && !!props.frame.stepBadge?.enabled,
    onClose: () => props.setIsStepBadgePopoverOpen(false),
    frameId: props.frame.id,
    anchorEl: props.stepBadgePopoverAnchorRef.current,
    ...(props.frame.stepBadge === undefined ? {} : { stepBadge: props.frame.stepBadge }),
  };
}

function createCalloutSettingsProps(props: InteractiveFramePopoversProps) {
  return {
    isOpen: props.isCalloutPopoverOpen && !!props.frame.callout?.enabled,
    onClose: () => props.setIsCalloutPopoverOpen(false),
    frameId: props.frame.id,
    anchorEl: props.calloutPopoverAnchorRef.current,
    ...(props.frame.callout === undefined ? {} : { settings: props.frame.callout }),
  };
}

function renderCalloutOverlay(props: InteractiveFramePopoversProps) {
  return (
    <InteractiveFrameCalloutOverlay
      frame={props.frame}
      currentFrame={props.currentFrame}
      frameZIndex={props.frameZIndex}
      isCalloutEditing={props.isCalloutEditing}
      setIsCalloutEditing={props.setIsCalloutEditing}
      setTempFrame={props.setTempFrame}
      onUpdate={props.onUpdate}
    />
  );
}

/** Renders settings, step-badge, and callout popovers for a single frame. */
export function InteractiveFramePopovers(props: InteractiveFramePopoversProps) {
  const frameSettingsProps = createFrameSettingsProps(props);
  const stepBadgeProps = createStepBadgeProps(props);
  const calloutSettingsProps = createCalloutSettingsProps(props);

  return (
    <>
      <FrameSettingsPopover {...frameSettingsProps} />
      <StepBadgePopover {...stepBadgeProps} />
      {renderCalloutOverlay(props)}
      <CalloutSettingsPopover {...calloutSettingsProps} />
    </>
  );
}
