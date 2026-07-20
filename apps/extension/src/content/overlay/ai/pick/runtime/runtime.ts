import { createLazyContentDefaultOwner } from '../../../../application/default-owner';
import { registerContentMode } from '../../../../application/mode-session';
import { createAiPickModeController } from './mode.controller';
import { createAiPickOverlayController } from './overlay';
import type { AiPickEnableOptions } from './mode.types';

export { resolveAiPickInteractionTarget } from './interaction-target';

const aiPickModeControllerOwner = createLazyContentDefaultOwner(() =>
  createAiPickModeController({
    overlayController: createAiPickOverlayController(),
  })
);

export async function enableAiPickMode(
  onContentSelect: Parameters<ReturnType<typeof aiPickModeControllerOwner.getOwner>['enable']>[0],
  options?: AiPickEnableOptions
): Promise<void> {
  const controller = aiPickModeControllerOwner.getOwner();
  if (options === undefined) {
    await controller.enable(onContentSelect);
    return;
  }

  await controller.enable(onContentSelect, options);
}

export async function refreshAiPickModeSnapshot(): Promise<void> {
  await aiPickModeControllerOwner.getOwner().refreshSnapshot();
}

export function disableAiPickMode(): void {
  aiPickModeControllerOwner.getOwnerIfCreated()?.disable();
}

registerContentMode('ai-pick', disableAiPickMode);
