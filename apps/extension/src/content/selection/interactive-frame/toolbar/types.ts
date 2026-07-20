import type { Dispatch, SetStateAction } from 'react';
import type { EffectMode, FrameData, FrameState } from '../../../../features/highlighter/contracts';

export interface InteractiveFrameToolbarProps {
  state: FrameState;
  toolbarCoords: { x: number; y: number };
  effectMode: EffectMode;
  frame: FrameData;
  popoverAnchorRef: React.RefObject<HTMLButtonElement | null>;
  stepBadgePopoverAnchorRef: React.RefObject<HTMLButtonElement | null>;
  calloutPopoverAnchorRef: React.RefObject<HTMLButtonElement | null>;
  setIsStepBadgePopoverOpen: Dispatch<SetStateAction<boolean>>;
  setIsCalloutPopoverOpen: Dispatch<SetStateAction<boolean>>;
  setIsCalloutEditing: Dispatch<SetStateAction<boolean>>;
  setState: Dispatch<SetStateAction<FrameState>>;
  handleEffectButtonClick: (mode: EffectMode) => void;
  handleStartEditing: () => void;
  handleDelete: () => void;
  hideTooltip: (frameId: string) => void;
}
