import type React from 'react';
import type {
  EffectMode,
  FrameData,
  FrameState,
  ResizeDirection,
} from '../../../../features/highlighter/contracts';

export interface InteractiveFrameActionParams {
  frame: FrameData;
  frameWithoutLinkedElement: FrameData;
  tempFrame: FrameData;
  effectMode: EffectMode;
  setState: React.Dispatch<React.SetStateAction<'idle' | 'hover' | 'editing'>>;
  setTempFrame: React.Dispatch<React.SetStateAction<FrameData>>;
  setEffectMode: React.Dispatch<React.SetStateAction<EffectMode>>;
  closePopover: () => void;
  openPopover: (frameId: string) => void;
  onUpdate: (frame: FrameData) => void;
  onDelete: () => void;
  onCancel?: () => void;
  onEffectChange?: (frameId: string, mode: EffectMode) => void;
  startFrameRef: React.MutableRefObject<FrameData>;
  startEffectModeRef: React.MutableRefObject<EffectMode>;
}

export interface InteractiveFrameHoverOverlayProps {
  portalTheme: 'light' | 'dark' | null;
  isCalloutEditing: boolean;
  frameId: string;
  isPopoverOpen: boolean;
  isStepBadgePopoverOpen: boolean;
  isCalloutPopoverOpen: boolean;
  closePopover: () => void;
  hideTooltip: (frameId: string) => void;
  setIsStepBadgePopoverOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsCalloutPopoverOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsCalloutEditing: React.Dispatch<React.SetStateAction<boolean>>;
}

export interface InteractiveFrameSyncConfig {
  tempFrame: FrameData;
  effectMode: EffectMode;
  state: FrameState;
  tempFrameRef: React.MutableRefObject<FrameData>;
  effectModeRef: React.MutableRefObject<EffectMode>;
  stateRef: React.MutableRefObject<FrameState>;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

export interface InteractiveFrameListenerConfig {
  containerRef: React.RefObject<HTMLDivElement | null>;
  frameId: string;
  setTempFrame: React.Dispatch<React.SetStateAction<FrameData>>;
  stateRef: React.MutableRefObject<FrameState>;
  isDraggingRef: React.MutableRefObject<boolean>;
  isResizingRef: React.MutableRefObject<boolean>;
  resizeDirectionRef: React.MutableRefObject<ResizeDirection | null>;
  startXRef: React.MutableRefObject<number>;
  startYRef: React.MutableRefObject<number>;
  startFrameRef: React.MutableRefObject<FrameData>;
  effectModeRef: React.MutableRefObject<EffectMode>;
}

export interface InteractiveFrameHandlerConfig {
  state: FrameState;
  isDraggingRef: React.MutableRefObject<boolean>;
  isResizingRef: React.MutableRefObject<boolean>;
  resizeDirectionRef: React.MutableRefObject<ResizeDirection | null>;
  startXRef: React.MutableRefObject<number>;
  startYRef: React.MutableRefObject<number>;
  startFrameRef: React.MutableRefObject<FrameData>;
  tempFrameRef: React.MutableRefObject<FrameData>;
}
