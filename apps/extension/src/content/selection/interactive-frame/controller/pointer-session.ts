import { useRef } from 'react';
import type {
  EffectMode,
  FrameData,
  ResizeDirection,
} from '../../../../features/highlighter/contracts';

export function useInteractiveFramePointerSession(tempFrame: FrameData, effectMode: EffectMode) {
  return {
    isDraggingRef: useRef(false),
    isResizingRef: useRef(false),
    resizeDirectionRef: useRef<ResizeDirection | null>(null),
    startXRef: useRef(0),
    startYRef: useRef(0),
    startFrameRef: useRef<FrameData>(tempFrame),
    tempFrameRef: useRef(tempFrame),
    effectModeRef: useRef(effectMode),
  };
}
