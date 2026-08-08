import React from 'react';
import type { EffectMode, FrameData, FrameState } from '../../../../features/highlighter/contracts';
import { getCalloutFrameColors } from '../../../../features/highlighter/callout-color-bindings';
import { CalloutSettingsPopover } from '../../callout-settings-popover';
import { FrameSettingsPopover } from '../../frame-settings-popover';
import { StepBadgePopover } from '../../step-badge-popover';
import { InteractiveFrameCalloutOverlay } from './callout';
import {
  getFrameCallout,
  getFrameCalloutKey,
  getFrameCallouts,
  removeFrameCallout,
  setFrameCallout,
} from '../../../../features/highlighter/frame-annotation/callout/collection';

export interface InteractiveFramePopoversProps {
  frame: FrameData;
  currentFrame: FrameData;
  frameZIndex: number;
  effectMode: EffectMode;
  isPopoverOpen: boolean;
  isSelected: boolean;
  isStepBadgePopoverOpen: boolean;
  isCalloutPopoverOpen: boolean;
  isCalloutEditing: boolean;
  activeCalloutIndex?: number;
  state: FrameState;
  popoverAnchorRef: React.RefObject<HTMLButtonElement | null>;
  stepBadgePopoverAnchorRef: React.RefObject<HTMLButtonElement | null>;
  calloutPopoverAnchorRef: React.RefObject<HTMLButtonElement | null>;
  setIsCalloutEditing: React.Dispatch<React.SetStateAction<boolean>>;
  setActiveCalloutIndex?: React.Dispatch<React.SetStateAction<number>>;
  setTempFrame: React.Dispatch<React.SetStateAction<FrameData>>;
  stageCalloutFrame?: (update: FrameData | ((frame: FrameData) => FrameData)) => FrameData;
  closePopover: () => void;
  handleEffectModeSelect?: (mode: EffectMode) => void;
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
    ...(props.handleEffectModeSelect === undefined
      ? {}
      : { onEffectModeChange: props.handleEffectModeSelect }),
    effectMode: props.effectMode,
    frameId: props.currentFrame.id,
    frameRect: props.currentFrame,
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
  const stepBadge = props.currentFrame.stepBadge ?? props.frame.stepBadge;
  const borderSettings = props.currentFrame.borderSettings ?? props.frame.borderSettings;
  return {
    isOpen: props.isStepBadgePopoverOpen && !!stepBadge?.enabled,
    onClose: props.closePopover,
    frameId: props.frame.id,
    frameRect: props.currentFrame,
    anchorEl: props.stepBadgePopoverAnchorRef.current,
    ...(borderSettings
      ? {
          frameVisuals: {
            borderColor: borderSettings.color,
            borderWidth: borderSettings.width,
            fillColor: borderSettings.fillColor,
          },
        }
      : {}),
    ...(stepBadge === undefined ? {} : { stepBadge }),
  };
}

function createCalloutSettingsProps(props: InteractiveFramePopoversProps) {
  const activeCalloutIndex = props.activeCalloutIndex ?? 0;
  const callout =
    getFrameCallout(props.currentFrame, activeCalloutIndex) ??
    getFrameCallout(props.frame, activeCalloutIndex);
  const borderSettings = props.currentFrame.borderSettings ?? props.frame.borderSettings;
  return {
    isOpen: props.isCalloutPopoverOpen && !!callout?.enabled,
    calloutIndex: activeCalloutIndex,
    onClose: props.closePopover,
    frameId: props.frame.id,
    frameRect: props.currentFrame,
    frameColors: getCalloutFrameColors(borderSettings),
    anchorEl: props.calloutPopoverAnchorRef.current,
    onSettingsChange: (nextCallout: NonNullable<typeof callout>) => {
      if (!props.stageCalloutFrame) return;
      props.stageCalloutFrame(
        (current) => setFrameCallout(current, activeCalloutIndex, nextCallout) as FrameData
      );
    },
    onDelete: () => {
      if (!props.stageCalloutFrame) return;
      props.stageCalloutFrame(
        (current) => removeFrameCallout(current, activeCalloutIndex) as FrameData
      );
      props.setIsCalloutEditing(false);
    },
    ...(callout === undefined ? {} : { settings: callout }),
  };
}

function renderCalloutOverlay(props: InteractiveFramePopoversProps) {
  const activeCalloutIndex = props.activeCalloutIndex ?? 0;
  const calloutCount = Math.max(1, getFrameCallouts(props.currentFrame).length);
  return Array.from({ length: calloutCount }, (_, calloutIndex) => (
    <InteractiveFrameCalloutOverlay
      calloutIndex={calloutIndex}
      frame={props.frame}
      currentFrame={props.currentFrame}
      frameZIndex={props.frameZIndex + calloutIndex}
      isCalloutEditing={props.isCalloutEditing && activeCalloutIndex === calloutIndex}
      isCalloutPopoverOpen={props.isCalloutPopoverOpen && activeCalloutIndex === calloutIndex}
      isFrameEditing={props.state === 'editing'}
      key={getFrameCalloutKey(props.currentFrame, calloutIndex)}
      calloutPopoverAnchorRef={props.calloutPopoverAnchorRef}
      {...(props.setActiveCalloutIndex
        ? { setActiveCalloutIndex: props.setActiveCalloutIndex }
        : {})}
      setIsCalloutEditing={props.setIsCalloutEditing}
      setTempFrame={props.setTempFrame}
      {...(props.stageCalloutFrame ? { stageCalloutFrame: props.stageCalloutFrame } : {})}
      onUpdate={props.onUpdate}
    />
  ));
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
