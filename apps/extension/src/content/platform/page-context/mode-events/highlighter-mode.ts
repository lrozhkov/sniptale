import {
  addContentRuntimeDetailEventListener,
  dispatchContentRuntimeDetailEvent,
  type ContentRuntimeEventTarget,
} from '../event-bus';

type HighlighterModeChangedDetail = {
  enabled: boolean;
};

const HIGHLIGHTER_MODE_CHANGED_EVENT = 'sniptale-highlighter-mode-changed';

export function dispatchHighlighterModeChanged(
  detail: HighlighterModeChangedDetail,
  target?: ContentRuntimeEventTarget
): void {
  dispatchContentRuntimeDetailEvent(HIGHLIGHTER_MODE_CHANGED_EVENT, detail, target);
}

export function addHighlighterModeChangedListener(
  listener: (detail: HighlighterModeChangedDetail) => void,
  target?: ContentRuntimeEventTarget
): () => void {
  return addContentRuntimeDetailEventListener(HIGHLIGHTER_MODE_CHANGED_EVENT, listener, target);
}
