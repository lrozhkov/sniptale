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

export type HighlighterSettingsChangedDetail = {
  defaultBorderPresetId?: string;
};

const HIGHLIGHTER_SETTINGS_CHANGED_EVENT = 'sniptale-highlighter-settings-changed';
const SESSION_BLUR_SETTINGS_CHANGED_EVENT = 'sniptale-session-blur-settings-changed';
const SESSION_FOCUS_SETTINGS_CHANGED_EVENT = 'sniptale-session-focus-settings-changed';
const FOCUS_OPACITY_CHANGED_EVENT = 'sniptale-focus-opacity-changed';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseHighlighterSettingsChangedDetail(
  detail: unknown
): HighlighterSettingsChangedDetail | null {
  if (!isRecord(detail)) {
    return null;
  }

  if (Object.keys(detail).some((key) => key !== 'defaultBorderPresetId')) {
    return null;
  }

  if ('defaultBorderPresetId' in detail && typeof detail['defaultBorderPresetId'] !== 'string') {
    return null;
  }

  return {
    ...(typeof detail['defaultBorderPresetId'] === 'string'
      ? { defaultBorderPresetId: detail['defaultBorderPresetId'] }
      : {}),
  };
}

export function dispatchHighlighterSettingsChanged(
  detail: HighlighterSettingsChangedDetail = {},
  target?: ContentRuntimeEventTarget
): void {
  dispatchContentRuntimeDetailEvent(HIGHLIGHTER_SETTINGS_CHANGED_EVENT, detail, target);
}

export function addHighlighterSettingsChangedListener(
  listener: (detail: HighlighterSettingsChangedDetail) => void,
  target?: ContentRuntimeEventTarget
): () => void {
  return addContentRuntimeDetailEventListener(
    HIGHLIGHTER_SETTINGS_CHANGED_EVENT,
    listener,
    target,
    {
      parseDetail: parseHighlighterSettingsChangedDetail,
    }
  );
}

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
