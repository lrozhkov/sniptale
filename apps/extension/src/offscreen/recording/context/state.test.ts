import { expect, it, vi } from 'vitest';

import {
  activateRecorder,
  beginRecordingSession,
  beginStopRequest,
  clearStopRequest,
  createOffscreenRecordingContextState,
  hasActiveRecordingSession,
  resetRecordingSession,
} from './state';

it('tracks discard-aware stop requests and clears their handlers explicitly', () => {
  const state = createOffscreenRecordingContextState();
  const resolve = vi.fn();
  const reject = vi.fn();

  beginRecordingSession(state, 'recording-1');
  activateRecorder(state, { state: 'recording' } as MediaRecorder);
  beginStopRequest(state, {
    discard: true,
    resolve,
    reject,
  });

  expect(state.discardOnStop).toBe(true);
  expect(clearStopRequest(state)).toEqual({ resolve, reject });
  expect(state.stopRecordingResolve).toBeNull();
  expect(state.stopRecordingReject).toBeNull();
});

it('treats lifecycle state and active media resources as recording-session ownership signals', () => {
  const state = createOffscreenRecordingContextState();

  expect(hasActiveRecordingSession(state)).toBe(false);

  state.sourceStream = {} as MediaStream;
  expect(hasActiveRecordingSession(state)).toBe(true);

  state.sourceStream = null;
  beginRecordingSession(state, 'recording-2');
  expect(hasActiveRecordingSession(state)).toBe(true);

  resetRecordingSession(state);
  expect(hasActiveRecordingSession(state)).toBe(false);
});
