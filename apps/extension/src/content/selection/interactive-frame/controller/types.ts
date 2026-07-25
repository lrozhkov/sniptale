import type React from 'react';
import type { FrameUIState } from '../../frame-runtime/state/frame-ui.store';
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
  setState: React.Dispatch<React.SetStateAction<FrameState>>;
  setTempFrame: React.Dispatch<React.SetStateAction<FrameData>>;
  setEffectMode: React.Dispatch<React.SetStateAction<EffectMode>>;
  closePopover: () => void;
  togglePopover: FrameUIState['togglePopover'];
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
  clearSelection: () => void;
  setIsCalloutEditing: React.Dispatch<React.SetStateAction<boolean>>;
}

export interface InteractiveFrameSyncConfig {
  tempFrame: FrameData;
  effectMode: EffectMode;
  state: FrameState;
  tempFrameRef: React.MutableRefObject<FrameData>;
  effectModeRef: React.MutableRefObject<EffectMode>;
  pointerIdRef: React.MutableRefObject<number | null>;
  resizeOriginStateRef: React.MutableRefObject<FrameState>;
  setState: React.Dispatch<React.SetStateAction<FrameState>>;
  onUpdate: (frame: FrameData) => void;
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
  tempFrameRef: React.MutableRefObject<FrameData>;
  effectModeRef: React.MutableRefObject<EffectMode>;
  pointerIdRef: React.MutableRefObject<number | null>;
  resizeOriginStateRef: React.MutableRefObject<FrameState>;
  resizeRafIdRef: React.MutableRefObject<number | null>;
  latestResizeSampleRef: React.MutableRefObject<InteractiveFramePointerSample | null>;
  setState: React.Dispatch<React.SetStateAction<FrameState>>;
  onUpdate: (frame: FrameData) => void;
}

export interface InteractiveFrameHandlerConfig {
  frameId: string;
  state: FrameState;
  isDraggingRef: React.MutableRefObject<boolean>;
  isResizingRef: React.MutableRefObject<boolean>;
  resizeDirectionRef: React.MutableRefObject<ResizeDirection | null>;
  startXRef: React.MutableRefObject<number>;
  startYRef: React.MutableRefObject<number>;
  startFrameRef: React.MutableRefObject<FrameData>;
  tempFrameRef: React.MutableRefObject<FrameData>;
  pointerIdRef: React.MutableRefObject<number | null>;
  resizeOriginStateRef: React.MutableRefObject<FrameState>;
  resizeRafIdRef: React.MutableRefObject<number | null>;
  latestResizeSampleRef: React.MutableRefObject<InteractiveFramePointerSample | null>;
  stateRef: React.MutableRefObject<FrameState>;
  setState: React.Dispatch<React.SetStateAction<FrameState>>;
  setTempFrame: React.Dispatch<React.SetStateAction<FrameData>>;
}

export interface InteractiveFramePointerSample {
  clientX: number;
  clientY: number;
  pointerId: number;
}
