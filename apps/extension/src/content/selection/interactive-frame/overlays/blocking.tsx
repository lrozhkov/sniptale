import React from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { FrameData, FrameState } from '../../../../features/highlighter/contracts';
import { useContentPortalTheme } from '../layout/portal';
import { FrameEditingOverlay, FrameHoverOverlay } from './layers';
import { getInteractiveFrameOverlayClipPath } from '../layout/overlay-clip-path';

function createHoverOverlay(props: {
  isFrameActive: boolean;
  state: FrameState;
  portalTheme: 'light' | 'dark' | null;
  isCalloutEditing: boolean;
  frameId: string;
  isPopoverOpen: boolean;
  isStepBadgePopoverOpen: boolean;
  isCalloutPopoverOpen: boolean;
  closePopover: () => void;
  hideTooltip: (frameId: string) => void;
  setIsStepBadgePopoverOpen: Dispatch<SetStateAction<boolean>>;
  setIsCalloutPopoverOpen: Dispatch<SetStateAction<boolean>>;
  setIsCalloutEditing: Dispatch<SetStateAction<boolean>>;
}) {
  if (!props.isFrameActive || props.state === 'editing') {
    return null;
  }

  return (
    <FrameHoverOverlay
      portalTheme={props.portalTheme}
      isCalloutEditing={props.isCalloutEditing}
      frameId={props.frameId}
      isPopoverOpen={props.isPopoverOpen}
      isStepBadgePopoverOpen={props.isStepBadgePopoverOpen}
      isCalloutPopoverOpen={props.isCalloutPopoverOpen}
      closePopover={props.closePopover}
      hideTooltip={props.hideTooltip}
      setIsStepBadgePopoverOpen={props.setIsStepBadgePopoverOpen}
      setIsCalloutPopoverOpen={props.setIsCalloutPopoverOpen}
      setIsCalloutEditing={props.setIsCalloutEditing}
    />
  );
}

function createEditingOverlay(props: {
  portalTheme: 'light' | 'dark' | null;
  state: FrameState;
  tempFrame: FrameData;
}) {
  if (props.state !== 'editing') {
    return null;
  }

  return (
    <FrameEditingOverlay
      portalTheme={props.portalTheme}
      clipPath={getInteractiveFrameOverlayClipPath(props.tempFrame)}
    />
  );
}

interface BlockingOverlaysProps {
  state: FrameState;
  tempFrame: FrameData;
  isFrameActive: boolean;
  isPopoverOpen: boolean;
  isStepBadgePopoverOpen: boolean;
  isCalloutPopoverOpen: boolean;
  isCalloutEditing: boolean;
  closePopover: () => void;
  hideTooltip: (frameId: string) => void;
  frameId: string;
  setIsStepBadgePopoverOpen: Dispatch<SetStateAction<boolean>>;
  setIsCalloutPopoverOpen: Dispatch<SetStateAction<boolean>>;
  setIsCalloutEditing: Dispatch<SetStateAction<boolean>>;
}

export function InteractiveFrameBlockingOverlays({
  state,
  tempFrame,
  isFrameActive,
  isPopoverOpen,
  isStepBadgePopoverOpen,
  isCalloutPopoverOpen,
  isCalloutEditing,
  closePopover,
  hideTooltip,
  frameId,
  setIsStepBadgePopoverOpen,
  setIsCalloutPopoverOpen,
  setIsCalloutEditing,
}: BlockingOverlaysProps): React.ReactElement | null {
  const portalTheme = useContentPortalTheme();
  const hoverOverlay = createHoverOverlay({
    isFrameActive,
    state,
    portalTheme,
    isCalloutEditing,
    frameId,
    isPopoverOpen,
    isStepBadgePopoverOpen,
    isCalloutPopoverOpen,
    closePopover,
    hideTooltip,
    setIsStepBadgePopoverOpen,
    setIsCalloutPopoverOpen,
    setIsCalloutEditing,
  });

  const editingOverlay = createEditingOverlay({ portalTheme, state, tempFrame });

  if (!hoverOverlay && !editingOverlay) {
    return null;
  }

  return (
    <>
      {hoverOverlay}
      {editingOverlay}
    </>
  );
}
