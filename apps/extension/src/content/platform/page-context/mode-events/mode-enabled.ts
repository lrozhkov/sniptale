import {
  addContentRuntimeDetailEventListener,
  dispatchContentRuntimeDetailEvent,
  type ContentRuntimeEventTarget,
} from '../event-bus';

type ModeEnabledDetail = {
  mode: 'quick-edit';
};

const MODE_ENABLED_EVENT = 'sniptale-mode-enabled';

export function dispatchContentModeEnabled(
  detail: ModeEnabledDetail,
  target?: ContentRuntimeEventTarget
): void {
  dispatchContentRuntimeDetailEvent(MODE_ENABLED_EVENT, detail, target);
}

export function addContentModeEnabledListener(
  listener: (detail: ModeEnabledDetail) => void,
  target?: ContentRuntimeEventTarget
): () => void {
  return addContentRuntimeDetailEventListener(MODE_ENABLED_EVENT, listener, target);
}
