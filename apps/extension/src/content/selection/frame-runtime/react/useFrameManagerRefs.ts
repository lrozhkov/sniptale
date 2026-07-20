import { useRef } from 'react';
import type { MutableRefObject } from 'react';
import type { Root } from 'react-dom/client';
import { appendToContentOverlayRoot } from '../../../platform/dom-host';
import { applyIsolatedContentRootStyle } from '../../../platform/dom-host/isolated';
import type {
  BlurSettings,
  EffectMode,
  FocusSettings,
  FrameData,
  FrameState,
  HighlighterSettings,
} from '../../../../features/highlighter/contracts';
import type { CalloutSettings } from '@sniptale/runtime-contracts/highlighter/callout';
import type {
  GlobalStepBadgeSettings,
  StepBadgeSettings,
} from '@sniptale/runtime-contracts/highlighter/step-badge';
import {
  DEFAULT_BLUR_SETTINGS,
  DEFAULT_FOCUS_SETTINGS,
} from '../../../../features/highlighter/style/defaults';
import type { FrameManagerRefs } from '../contracts';

/**
 * Creates mutable refs used by frame manager orchestration.
 */
export function useFrameManagerRefs(): FrameManagerRefs {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rootsRef = useRef<Map<string, Root>>(new Map());
  const linkedElementsRef = useRef<Map<string, HTMLElement>>(new Map());
  const isClearingRef = useRef(false);
  const framesRef = useRef<FrameData[]>([]);
  const frameStatesRef = useRef<Map<string, FrameState>>(new Map());
  const prevFramesRef = useRef<FrameData[]>([]);
  const prevFrameStatesRef = useRef<Map<string, FrameState>>(new Map());
  const globalEffectModeRef = useRef<EffectMode>('border');
  const sessionBlurSettingsRef = useRef<BlurSettings>({ ...DEFAULT_BLUR_SETTINGS });
  const sessionFocusSettingsRef = useRef<FocusSettings>({ ...DEFAULT_FOCUS_SETTINGS });
  const sessionStepBadgeTemplateRef = useRef<StepBadgeSettings | null>(null);
  const sessionCalloutStyleRef = useRef<Partial<CalloutSettings> | null>(null);
  const stepBadgeOrderRef = useRef<Map<string, number>>(new Map());
  const globalStepBadgeSettingsRef = useRef<GlobalStepBadgeSettings>({ autoMode: true });
  const globalStepBadgeAutoModeRef = useRef(globalStepBadgeSettingsRef.current.autoMode);
  const highlighterSettingsCacheRef = useRef<HighlighterSettings | null>(null);

  return {
    containerRef,
    rootsRef,
    linkedElementsRef,
    isClearingRef,
    framesRef,
    frameStatesRef,
    prevFramesRef,
    prevFrameStatesRef,
    globalEffectModeRef,
    sessionBlurSettingsRef,
    sessionFocusSettingsRef,
    sessionStepBadgeTemplateRef,
    sessionCalloutStyleRef,
    stepBadgeOrderRef,
    globalStepBadgeSettingsRef,
    globalStepBadgeAutoModeRef,
    highlighterSettingsCacheRef,
  };
}

/**
 * Keeps frame-related refs aligned with state snapshots without re-subscribing listeners.
 */
export function syncFrameManagerStateRefs(
  frames: FrameData[],
  frameStates: Map<string, FrameState>,
  refs: Pick<
    FrameManagerRefs,
    | 'framesRef'
    | 'frameStatesRef'
    | 'prevFramesRef'
    | 'prevFrameStatesRef'
    | 'globalStepBadgeAutoModeRef'
  > &
    Pick<FrameManagerRefs, 'globalStepBadgeSettingsRef'>
) {
  if (frames !== refs.prevFramesRef.current) {
    refs.framesRef.current = frames;
    refs.prevFramesRef.current = frames;
  }

  if (frameStates !== refs.prevFrameStatesRef.current) {
    refs.frameStatesRef.current = frameStates;
    refs.prevFrameStatesRef.current = frameStates;
  }

  refs.globalStepBadgeAutoModeRef.current = refs.globalStepBadgeSettingsRef.current.autoMode;
}

/**
 * Ensures a single DOM container exists for frame overlays.
 */
export function useFrameContainer(containerRef: MutableRefObject<HTMLDivElement | null>) {
  return () => {
    if (containerRef.current) {
      return containerRef.current;
    }

    const container = document.createElement('div');
    container.className = 'sniptale-frames-container';
    applyIsolatedContentRootStyle(
      container,
      `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        width: auto;
        height: auto;
        pointer-events: none;
        z-index: 2147483642;
      `
    );
    appendToContentOverlayRoot(container);
    containerRef.current = container;

    return container;
  };
}
