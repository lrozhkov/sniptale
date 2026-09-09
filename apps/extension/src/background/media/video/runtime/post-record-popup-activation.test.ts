import { beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ viewportPresetId: null as string | null }));
vi.mock('./session-state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./session-state')>()),
  getVideoRecordingRuntimeState: () => state,
}));
import {
  markPostRecordPopupActivationOwnedByPopup,
  consumePostRecordPopupActivationOwnedByPopup,
} from './post-record-popup-activation';
beforeEach(() => {
  state.viewportPresetId = null;
});
it('does not reuse a popup that window restoration will dismiss', () => {
  state.viewportPresetId = 'window-hd';
  markPostRecordPopupActivationOwnedByPopup('resized');
  expect(consumePostRecordPopupActivationOwnedByPopup('resized')).toBe(false);
});
it('reuses the popup without resizing and consumes ownership once', () => {
  markPostRecordPopupActivationOwnedByPopup('ordinary');
  expect(consumePostRecordPopupActivationOwnedByPopup('ordinary')).toBe(true);
  expect(consumePostRecordPopupActivationOwnedByPopup('ordinary')).toBe(false);
});
