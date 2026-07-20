import { getNearestDataElement } from '../dom-helpers';
import { isExtensionUIElement, isNonDataInteractiveElement } from '../guards';
import type { AiPickModeState } from '../mode.types';
import type { AiPickOverlayController } from '../overlay';
import { aiPickModeLogger } from './shared';
import { resolveScopedAiPickTarget } from './target';

export function createMouseLeaveHandler(
  state: AiPickModeState,
  overlayController: Pick<AiPickOverlayController, 'hideHoverOverlay'>
) {
  return () => {
    if (!state.isEnabled) {
      return;
    }

    overlayController.hideHoverOverlay();
    aiPickModeLogger.debug('Hover preview hidden after leaving the viewport');
  };
}

export function createMouseMoveHandler(
  state: AiPickModeState,
  overlayController: Pick<AiPickOverlayController, 'hideHoverOverlay' | 'showHoverOverlay'>
) {
  return (event: MouseEvent, iframe?: HTMLIFrameElement): void => {
    if (!state.isEnabled) {
      return;
    }

    const target = resolveScopedAiPickTarget(state, event, iframe);
    if (!target) {
      overlayController.hideHoverOverlay();
      return;
    }

    if (isExtensionUIElement(target) || isNonDataInteractiveElement(target)) {
      overlayController.hideHoverOverlay();
      return;
    }

    const elementWithData = getNearestDataElement(state.domState.elementIndex, target);
    if (elementWithData) {
      overlayController.showHoverOverlay(elementWithData);
      return;
    }

    overlayController.hideHoverOverlay();
  };
}
