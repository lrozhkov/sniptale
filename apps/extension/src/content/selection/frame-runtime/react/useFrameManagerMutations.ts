import { useCallback } from 'react';
import { createLogger } from '@sniptale/platform/observability/logger';
import type { FrameManagerRefs, FrameSetter, RecalculateStepBadgesRef } from '../contracts';
import { buildFrameMutationActions } from '../mutation-actions';

const logger = createLogger({ namespace: 'ContentFrameManager' });

export function useFrameManagerMutations(
  setFrames: FrameSetter,
  refs: FrameManagerRefs,
  recalculateStepBadgesRef: RecalculateStepBadgesRef
) {
  const {
    containerRef,
    rootsRef,
    hostLayoutServiceRef,
    isClearingRef,
    framesRef,
    globalEffectModeRef,
    globalStepBadgeAutoModeRef,
    sessionSettingsRefs,
    sessionStepBadgeTemplateRef,
    highlighterSettingsCacheRef,
  } = refs;

  const mutations = buildFrameMutationActions({
    setFrames,
    framesRef,
    hostLayoutServiceRef,
    containerRef,
    rootsRef,
    isClearingRef,
    globalEffectModeRef,
    globalStepBadgeAutoModeRef,
    sessionBlurSettingsRef: sessionSettingsRefs.blurSettings,
    sessionDefaultsInitializedRef: sessionSettingsRefs.defaultsInitialized,
    sessionFocusSettingsRef: sessionSettingsRefs.focusSettings,
    sessionStepBadgeTemplateRef,
    highlighterSettingsCacheRef,
    recalculateStepBadgesRef,
  });

  const hasFrameForElement = useCallback(
    (element: HTMLElement): boolean => {
      if (hostLayoutServiceRef.current.hasElement(element)) {
        logger.log('Element already has a frame');
        return true;
      }
      return false;
    },
    [hostLayoutServiceRef]
  );

  return { hasFrameForElement, mutations };
}
