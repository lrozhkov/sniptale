import { createLogger } from '@sniptale/platform/observability/logger';
import type { EffectMode, FrameData } from '../../../../features/highlighter/contracts';
import {
  createAddFrameHandler,
  createAddFreeFrameHandler,
  createCalculateFrameCoords,
  createGenerateFrameId,
} from './frame-factory';
import {
  createAddAutoBlurFramesHandler,
  createClearAutoBlurFramesHandler,
  createSyncAutoBlurFramesHandler,
} from './auto-blur';
import { createClearFramesHandler } from './clear';
import { createRemoveFrameHandler } from './remove';
import { createUpdateFrameHandler } from './update';
import type { UseFrameMutationActionHelperOptions } from './types';

type FrameSetter = React.Dispatch<React.SetStateAction<FrameData[]>>;
const logger = createLogger({ namespace: 'ContentFrameMutations' });

function createSyncFocusOpacityHandler(setFrames: FrameSetter) {
  return (sourceFrameId: string, newOpacity: number) => {
    setFrames((prev) => {
      const focusFrames = prev.filter((frame) => frame.effectMode === 'focus');
      if (focusFrames.length <= 1) {
        return prev.map((frame) =>
          frame.id === sourceFrameId
            ? { ...frame, focusSettings: { ...frame.focusSettings, opacity: newOpacity } }
            : frame
        );
      }

      logger.log('Syncing focus opacity across frames', focusFrames.length, newOpacity);
      return prev.map((frame) =>
        frame.effectMode === 'focus'
          ? { ...frame, focusSettings: { ...frame.focusSettings, opacity: newOpacity } }
          : frame
      );
    });
  };
}

export function createUpdateFrameEffectHandler({
  globalEffectModeRef,
  sessionDefaultsInitializedRef,
  sessionBlurSettingsRef,
  sessionFocusSettingsRef,
  setFrames,
}: Pick<
  UseFrameMutationActionHelperOptions,
  | 'globalEffectModeRef'
  | 'sessionBlurSettingsRef'
  | 'sessionFocusSettingsRef'
  | 'setFrames'
  | 'sessionDefaultsInitializedRef'
>) {
  return (frameId: string, mode: EffectMode) => {
    globalEffectModeRef.current = mode;
    sessionDefaultsInitializedRef.current = true;
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
    addFreeFrame: createAddFreeFrameHandler({ ...options, generateFrameId }),
    updateFrame: createUpdateFrameHandler(options),
    removeFrame: createRemoveFrameHandler(options),
    clearFrames: createClearFramesHandler(options),
    updateFrameEffect: createUpdateFrameEffectHandler(options),
  };
}
