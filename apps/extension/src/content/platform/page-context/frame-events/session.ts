import type { BlurSettings, FocusSettings } from '../../../../features/highlighter/contracts';
import {
  addContentRuntimeDetailEventListener,
  dispatchContentRuntimeDetailEvent,
  type ContentRuntimeEventTarget,
} from '../event-bus';

type FocusOpacityChangedDetail = {
  frameId: string;
  opacity: number;
};

type SessionBlurSettingsChangedDetail = {
  settings: BlurSettings;
};

type SessionFocusSettingsChangedDetail = {
  settings: FocusSettings;
};

const SESSION_BLUR_SETTINGS_CHANGED_EVENT = 'sniptale-session-blur-settings-changed';
const SESSION_FOCUS_SETTINGS_CHANGED_EVENT = 'sniptale-session-focus-settings-changed';
const FOCUS_OPACITY_CHANGED_EVENT = 'sniptale-focus-opacity-changed';

export function dispatchSessionBlurSettingsChanged(
  detail: SessionBlurSettingsChangedDetail,
  target?: ContentRuntimeEventTarget
): void {
  dispatchContentRuntimeDetailEvent(SESSION_BLUR_SETTINGS_CHANGED_EVENT, detail, target);
}

export function addSessionBlurSettingsChangedListener(
  listener: (detail: SessionBlurSettingsChangedDetail) => void,
  target?: ContentRuntimeEventTarget
): () => void {
  return addContentRuntimeDetailEventListener(
    SESSION_BLUR_SETTINGS_CHANGED_EVENT,
    listener,
    target
  );
}

export function dispatchSessionFocusSettingsChanged(
  detail: SessionFocusSettingsChangedDetail,
  target?: ContentRuntimeEventTarget
): void {
  dispatchContentRuntimeDetailEvent(SESSION_FOCUS_SETTINGS_CHANGED_EVENT, detail, target);
}

export function addSessionFocusSettingsChangedListener(
  listener: (detail: SessionFocusSettingsChangedDetail) => void,
  target?: ContentRuntimeEventTarget
): () => void {
  return addContentRuntimeDetailEventListener(
    SESSION_FOCUS_SETTINGS_CHANGED_EVENT,
    listener,
    target
  );
}

export function dispatchFocusOpacityChanged(
  detail: FocusOpacityChangedDetail,
  target?: ContentRuntimeEventTarget
): void {
  dispatchContentRuntimeDetailEvent(FOCUS_OPACITY_CHANGED_EVENT, detail, target);
}

export function addFocusOpacityChangedListener(
  listener: (detail: FocusOpacityChangedDetail) => void,
  target?: ContentRuntimeEventTarget
): () => void {
  return addContentRuntimeDetailEventListener(FOCUS_OPACITY_CHANGED_EVENT, listener, target);
}
