import { useRef } from 'react';
import type {
  EffectMode,
  FrameData,
  FrameState,
  ResizeDirection,
} from '../../../../features/highlighter/contracts';

export function useInteractiveFramePointerSession(tempFrame: FrameData, effectMode: EffectMode) {
  return {
    activity: {
      isDraggingRef: useRef(false),
      isResizingRef: useRef(false),
      resizeDirectionRef: useRef<ResizeDirection | null>(null),
      pointerIdRef: useRef<number | null>(null),
      resizeOriginStateRef: useRef<FrameState>('idle'),
      resizeRafIdRef: useRef<number | null>(null),
      latestResizeSampleRef: useRef<{ clientX: number; clientY: number; pointerId: number } | null>(
        null
      ),
    },
    current: {
      tempFrameRef: useRef(tempFrame),
      effectModeRef: useRef(effectMode),
    },
    origin: {
      startXRef: useRef(0),
      startYRef: useRef(0),
      startFrameRef: useRef<FrameData>(tempFrame),
    },
  };
}
