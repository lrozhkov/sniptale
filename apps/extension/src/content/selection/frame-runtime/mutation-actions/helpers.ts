import { createLogger } from '@sniptale/platform/observability/logger';
import type { FrameData } from '../../../../features/highlighter/contracts';
export { createUpdateFrameHandler } from './update';
export {
  createAddFrameHandler,
  createCalculateFrameCoords,
  createGenerateFrameId,
} from './frame-factory';

type FrameSetter = React.Dispatch<React.SetStateAction<FrameData[]>>;
const logger = createLogger({ namespace: 'ContentFrameMutations' });

export function createSyncFocusOpacityHandler(setFrames: FrameSetter) {
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
