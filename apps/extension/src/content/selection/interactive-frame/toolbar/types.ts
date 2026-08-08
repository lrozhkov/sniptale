import type { Dispatch, SetStateAction } from 'react';
import type { EffectMode, FrameData, FrameState } from '../../../../features/highlighter/contracts';
import type { FrameUIState } from '../../frame-runtime/state/frame-ui.store';
import type { FrameCaptureVisibilityState } from './capture-visibility-state';

export interface InteractiveFrameToolbarProps {
  state: FrameState;
  toolbarCoords: { x: number; y: number };
  effectMode: EffectMode;
  frame: FrameData;
  captureVisibility: FrameCaptureVisibilityState;
  isSelected: boolean;
  isCalloutEditing: boolean;
  toolbarAnchorOffset: { x: number; y: number } | null;
  popoverAnchorRef: React.RefObject<HTMLButtonElement | null>;
  stepBadgePopoverAnchorRef: React.RefObject<HTMLButtonElement | null>;
  calloutPopoverAnchorRef: React.RefObject<HTMLButtonElement | null>;
  clearSelection: FrameUIState['clearSelection'];
  closePopover: FrameUIState['closePopover'];
  togglePopover: FrameUIState['togglePopover'];
  setIsCalloutEditing: Dispatch<SetStateAction<boolean>>;
  setActiveCalloutIndex?: Dispatch<SetStateAction<number>>;
  setTempFrame?: Dispatch<SetStateAction<FrameData>>;
  stageCalloutFrame?: (update: FrameData | ((frame: FrameData) => FrameData)) => FrameData;
  setState: Dispatch<SetStateAction<FrameState>>;
  handleEffectButtonClick: (mode: EffectMode) => void;
  handleStartEditing: () => void;
  handleDelete: () => void;
  onUpdate: (frame: FrameData) => void;
}
