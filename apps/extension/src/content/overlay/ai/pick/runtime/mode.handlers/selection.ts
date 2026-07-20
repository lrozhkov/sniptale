import { getDataIdsForElement, getNearestDataElement } from '../dom-helpers';
import { isExtensionUIElement, isNonDataInteractiveElement } from '../guards';
import type { AiPickModeState } from '../mode.types';
import { aiPickModeLogger, blockAiPickPointerEvent } from './shared';
import { resolveEnabledAiPickTarget } from './target';

function notifyAiPickSelection(state: AiPickModeState, selectedIds: Set<string>): void {
  if (state.onContentSelect && state.parsedTree) {
    state.onContentSelect(state.parsedTree, selectedIds);
    return;
  }

  aiPickModeLogger.error('Cannot complete AI pick selection without callback or parsed tree');
}

export function createClickHandler(state: AiPickModeState) {
  return (event: MouseEvent, iframe?: HTMLIFrameElement): void => {
    const target = resolveEnabledAiPickTarget(state, event, iframe);
    if (!target) {
      return;
    }

    if (isExtensionUIElement(target)) {
      aiPickModeLogger.debug('Skipping AI pick click on extension UI');
      return;
    }

    if (isNonDataInteractiveElement(target)) {
      aiPickModeLogger.debug('Blocking AI pick click on interactive page UI');
      blockAiPickPointerEvent(event);
      return;
    }

    const elementWithData = getNearestDataElement(state.domState.elementIndex, target);
    if (!elementWithData) {
      aiPickModeLogger.debug('Blocking AI pick click on non-data area');
      blockAiPickPointerEvent(event);
      return;
    }

    blockAiPickPointerEvent(event);
    const selectedIds = getDataIdsForElement(state.domState.elementIndex, elementWithData);
    aiPickModeLogger.debug('Selected AI pick target', { selectedIdCount: selectedIds.size });
    notifyAiPickSelection(state, selectedIds);
  };
}

export function createPointerDownHandler(state: AiPickModeState) {
  return (event: MouseEvent, iframe?: HTMLIFrameElement): void => {
    const target = resolveEnabledAiPickTarget(state, event, iframe);
    if (!target) {
      return;
    }

    if (isExtensionUIElement(target)) {
      return;
    }

    blockAiPickPointerEvent(event);
  };
}
