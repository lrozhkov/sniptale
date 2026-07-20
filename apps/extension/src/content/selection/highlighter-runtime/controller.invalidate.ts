import type { HoverController } from './controller.types';

export function createHighlighterControllerInvalidateCallbacks(
  hoverController: Pick<HoverController, 'invalidateFrameCache' | 'invalidateSettingsCache'>
) {
  return {
    invalidateFrameCache: () => {
      hoverController.invalidateFrameCache();
    },
    invalidateSettingsCache: () => {
      hoverController.invalidateSettingsCache();
    },
  };
}
