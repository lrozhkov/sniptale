import {
  addContentRuntimeDetailEventListener,
  dispatchContentRuntimeDetailEvent,
  type ContentRuntimeEventTarget,
} from '../event-bus';

type ModeDisabledDetail = {
  mode: 'ai-pick' | 'highlighter' | 'quick-edit';
};

const MODE_DISABLED_EVENT = 'sniptale-mode-disabled';

export function dispatchContentModeDisabled(
  detail: ModeDisabledDetail,
  target?: ContentRuntimeEventTarget
): void {
  dispatchContentRuntimeDetailEvent(MODE_DISABLED_EVENT, detail, target);
}

export function addContentModeDisabledListener(
  listener: (detail: ModeDisabledDetail) => void,
  target?: ContentRuntimeEventTarget
): () => void {
  return addContentRuntimeDetailEventListener(MODE_DISABLED_EVENT, listener, target);
}
