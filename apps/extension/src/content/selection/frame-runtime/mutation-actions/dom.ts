import type { EffectMode } from '../../../../features/highlighter/contracts';
import {
  createAddFrameHandler,
  createCalculateFrameCoords,
  createGenerateFrameId,
  createSyncFocusOpacityHandler,
  createUpdateFrameHandler,
} from './helpers';
import {
  createAddAutoBlurFramesHandler,
  createClearAutoBlurFramesHandler,
  createSyncAutoBlurFramesHandler,
} from './auto-blur';
import { createClearFramesHandler } from './clear';
import { createRemoveFrameHandler } from './remove';
import type { UseFrameMutationActionHelperOptions } from './types';

export function createUpdateFrameEffectHandler({
  globalEffectModeRef,
  sessionBlurSettingsRef,
  sessionFocusSettingsRef,
  setFrames,
}: Pick<
  UseFrameMutationActionHelperOptions,
  'globalEffectModeRef' | 'sessionBlurSettingsRef' | 'sessionFocusSettingsRef' | 'setFrames'
>) {
  return (frameId: string, mode: EffectMode) => {
    globalEffectModeRef.current = mode;
    setFrames((prev) => {
      const targetFrame = prev.find((frame) => frame.id === frameId);
      if (targetFrame?.blurSettings) {
        sessionBlurSettingsRef.current = { ...targetFrame.blurSettings };
      }
      if (targetFrame?.focusSettings) {
        sessionFocusSettingsRef.current = { ...targetFrame.focusSettings };
      }

      return prev.map((frame) => (frame.id === frameId ? { ...frame, effectMode: mode } : frame));
    });
  };
}

export function buildFrameMutationActions(options: UseFrameMutationActionHelperOptions) {
  const generateFrameId = createGenerateFrameId();
  const calculateFrameCoords = createCalculateFrameCoords(generateFrameId);

  return {
    addAutoBlurFrames: createAddAutoBlurFramesHandler(options),
    clearAutoBlurFrames: createClearAutoBlurFramesHandler(options),
    syncAutoBlurFrames: createSyncAutoBlurFramesHandler(options),
    syncFocusOpacity: createSyncFocusOpacityHandler(options.setFrames),
    addFrame: createAddFrameHandler({ ...options, calculateFrameCoords }),
    updateFrame: createUpdateFrameHandler(options),
    removeFrame: createRemoveFrameHandler(options),
    clearFrames: createClearFramesHandler(options),
    updateFrameEffect: createUpdateFrameEffectHandler(options),
  };
}
