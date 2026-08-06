import {
  addContentRuntimeDetailEventListener,
  dispatchContentRuntimeDetailEvent,
  type ContentRuntimeEventTarget,
} from '../event-bus';

type FrameEditingChangedDetail = {
  active: boolean;
};

const FRAME_EDITING_CHANGED_EVENT = 'sniptale-frame-editing-changed';

export function dispatchFrameEditingChanged(
  detail: FrameEditingChangedDetail,
  target?: ContentRuntimeEventTarget
): void {
  dispatchContentRuntimeDetailEvent(FRAME_EDITING_CHANGED_EVENT, detail, target);
}

export function addFrameEditingChangedListener(
  listener: (detail: FrameEditingChangedDetail) => void,
  target?: ContentRuntimeEventTarget
): () => void {
  return addContentRuntimeDetailEventListener(FRAME_EDITING_CHANGED_EVENT, listener, target);
}
