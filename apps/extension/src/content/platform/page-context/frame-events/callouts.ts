import type { CalloutSettings } from '../../../../features/highlighter/contracts';
import {
  addContentRuntimeDetailEventListener,
  dispatchContentRuntimeDetailEvent,
  type ContentRuntimeEventTarget,
} from '../event-bus';

export type FrameCalloutChangedDetail = {
  frameId: string;
  settings: Partial<CalloutSettings>;
};

export type CalloutDeleteDetail = {
  frameId: string;
};

type CalloutBlurRequestDetail = {
  frameId: string;
};

const FRAME_CALLOUT_CHANGED_EVENT = 'sniptale-frame-callout-changed';
const CALLOUT_POPOVER_SETTINGS_CHANGED_EVENT = 'sniptale-callout-popover-settings-changed';
const CALLOUT_DELETE_EVENT = 'sniptale-callout-delete';
const CALLOUT_BLUR_REQUEST_EVENT = 'sniptale-callout-blur-request';

export function dispatchFrameCalloutChanged(
  detail: FrameCalloutChangedDetail,
  target?: ContentRuntimeEventTarget
): void {
  dispatchContentRuntimeDetailEvent(FRAME_CALLOUT_CHANGED_EVENT, detail, target);
}

export function addFrameCalloutChangedListener(
  listener: (detail: FrameCalloutChangedDetail) => void,
  target?: ContentRuntimeEventTarget
): () => void {
  return addContentRuntimeDetailEventListener(FRAME_CALLOUT_CHANGED_EVENT, listener, target);
}

export function dispatchCalloutPopoverSettingsChanged(
  detail: FrameCalloutChangedDetail,
  target?: ContentRuntimeEventTarget
): void {
  dispatchContentRuntimeDetailEvent(CALLOUT_POPOVER_SETTINGS_CHANGED_EVENT, detail, target);
}

export function addCalloutPopoverSettingsChangedListener(
  listener: (detail: FrameCalloutChangedDetail) => void,
  target?: ContentRuntimeEventTarget
): () => void {
  return addContentRuntimeDetailEventListener(
    CALLOUT_POPOVER_SETTINGS_CHANGED_EVENT,
    listener,
    target
  );
}

export function dispatchCalloutDelete(
  detail: CalloutDeleteDetail,
  target?: ContentRuntimeEventTarget
): void {
  dispatchContentRuntimeDetailEvent(CALLOUT_DELETE_EVENT, detail, target);
}

export function addCalloutDeleteListener(
  listener: (detail: CalloutDeleteDetail) => void,
  target?: ContentRuntimeEventTarget
): () => void {
  return addContentRuntimeDetailEventListener(CALLOUT_DELETE_EVENT, listener, target);
}

export function dispatchCalloutBlurRequest(
  detail: CalloutBlurRequestDetail,
  target?: ContentRuntimeEventTarget
): void {
  dispatchContentRuntimeDetailEvent(CALLOUT_BLUR_REQUEST_EVENT, detail, target);
}

export function addCalloutBlurRequestListener(
  listener: (detail: CalloutBlurRequestDetail) => void,
  target?: ContentRuntimeEventTarget
): () => void {
  return addContentRuntimeDetailEventListener(CALLOUT_BLUR_REQUEST_EVENT, listener, target);
}
