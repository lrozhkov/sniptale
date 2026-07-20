import { getContentEventTargetElement } from '../../../../../platform/dom-host';
import { dispatchContentModeDisabled } from '../../../../../platform/page-context/mode-events';
import { isExtensionUIElement } from '../guards';
import type { AiPickModeState } from '../mode.types';
import { aiPickModeLogger } from './shared';

export function createKeyDownHandler(state: AiPickModeState, disable: () => void) {
  return (event: KeyboardEvent): void => {
    if (!state.isEnabled || event.key !== 'Escape') {
      return;
    }

    const target = getContentEventTargetElement(event);
    if (target && isExtensionUIElement(target)) {
      aiPickModeLogger.debug('Ignoring AI pick Escape from extension-owned UI');
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    disable();
    dispatchContentModeDisabled({ mode: 'ai-pick' });
    aiPickModeLogger.log('Cancelled AI pick mode from keyboard');
  };
}
