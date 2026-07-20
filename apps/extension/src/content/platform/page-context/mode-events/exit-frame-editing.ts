import {
  addContentRuntimeSignalEventListener,
  dispatchContentRuntimeSignalEvent,
  type ContentRuntimeEventTarget,
} from '../event-bus';

const EXIT_FRAME_EDITING_EVENT = 'sniptale-exit-frame-editing';

export function dispatchExitFrameEditing(target?: ContentRuntimeEventTarget): void {
  dispatchContentRuntimeSignalEvent(EXIT_FRAME_EDITING_EVENT, target);
}

export function addExitFrameEditingListener(
  listener: () => void,
  target?: ContentRuntimeEventTarget
): () => void {
  return addContentRuntimeSignalEventListener(EXIT_FRAME_EDITING_EVENT, listener, target);
}
