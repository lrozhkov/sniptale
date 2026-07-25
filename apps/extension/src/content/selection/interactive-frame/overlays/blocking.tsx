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
  clearSelection: () => void;
  setIsCalloutEditing: Dispatch<SetStateAction<boolean>>;
}) {
  if (!props.isFrameActive || props.state === 'editing' || !props.isCalloutEditing) {
    return null;
  }

  return (
    <FrameHoverOverlay
      portalTheme={props.portalTheme}
      isCalloutEditing={props.isCalloutEditing}
      frameId={props.frameId}
      clearSelection={props.clearSelection}
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
  isCalloutEditing: boolean;
  clearSelection: () => void;
  frameId: string;
  setIsCalloutEditing: Dispatch<SetStateAction<boolean>>;
}

export function InteractiveFrameBlockingOverlays({
  state,
  tempFrame,
  isFrameActive,
  isCalloutEditing,
  clearSelection,
  frameId,
  setIsCalloutEditing,
}: BlockingOverlaysProps): React.ReactElement | null {
  const portalTheme = useContentPortalTheme();
  const hoverOverlay = createHoverOverlay({
    isFrameActive,
    state,
    portalTheme,
    isCalloutEditing,
    frameId,
    clearSelection,
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
