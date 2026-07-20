import { useCallback } from 'react';
import { createLogger } from '@sniptale/platform/observability/logger';
import type { FrameManagerRefs, FrameSetter, RecalculateStepBadgesRef } from '../manager/types';
import { useFrameMutationActions } from '../mutation-actions';

const logger = createLogger({ namespace: 'ContentFrameManager' });

export function useFrameManagerMutations(
  setFrames: FrameSetter,
  refs: FrameManagerRefs,
  recalculateStepBadgesRef: RecalculateStepBadgesRef
) {
  const {
    containerRef,
    rootsRef,
    linkedElementsRef,
    isClearingRef,
    framesRef,
    globalEffectModeRef,
    globalStepBadgeAutoModeRef,
    sessionBlurSettingsRef,
    sessionFocusSettingsRef,
    sessionStepBadgeTemplateRef,
    highlighterSettingsCacheRef,
  } = refs;

  const mutations = useFrameMutationActions({
    setFrames,
    framesRef,
    linkedElementsRef,
    containerRef,
    rootsRef,
    isClearingRef,
    globalEffectModeRef,
    globalStepBadgeAutoModeRef,
    sessionBlurSettingsRef,
    sessionFocusSettingsRef,
    sessionStepBadgeTemplateRef,
    highlighterSettingsCacheRef,
    recalculateStepBadgesRef,
  });

  const hasFrameForElement = useCallback(
    (element: HTMLElement): boolean => {
      for (const [frameId, linkedElement] of linkedElementsRef.current.entries()) {
        if (linkedElement === element) {
          logger.log('Element already has a frame', frameId);
          return true;
        }
      }
      return false;
    },
    [linkedElementsRef]
  );

  return { hasFrameForElement, mutations };
}
