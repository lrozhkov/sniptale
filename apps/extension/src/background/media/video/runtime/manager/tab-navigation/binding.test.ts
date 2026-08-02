import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  captureMode: 'TAB_CROP',
  recordingId: 'recording-1' as string | null,
  session: {
    generation: 1,
    sourceReady: false,
    streamInstanceId: 'stream-1' as string | null,
    tabId: 7,
  },
  tabId: 7 as number | null,
}));

vi.mock('../../../capture-surface', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../capture-surface')>()),
  getVideoSurfaceSession: () => mocks.session,
}));
vi.mock('../../../session-state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../session-state')>()),
  getVideoRecordingCaptureMode: () => mocks.captureMode,
  getVideoRecordingId: () => mocks.recordingId,
  getVideoRecordingTabId: () => mocks.tabId,
}));

import { isCurrentNavigationBinding, resolveNavigationBinding } from './binding';

beforeEach(() => {
  mocks.captureMode = 'TAB_CROP';
  mocks.recordingId = 'recording-1';
  mocks.session.generation = 1;
  mocks.session.sourceReady = false;
  mocks.session.streamInstanceId = 'stream-1';
  mocks.session.tabId = 7;
  mocks.tabId = 7;
});

it('does not expose a startup binding before source-ready admission completes', () => {
  expect(resolveNavigationBinding(7)).toBeNull();

  mocks.session.sourceReady = true;
  expect(resolveNavigationBinding(7)).toEqual({
    captureMode: 'TAB_CROP',
    generation: 1,
    recordingId: 'recording-1',
    streamInstanceId: 'stream-1',
    tabId: 7,
  });
});

it('retires a previously resolved binding when source readiness is cleared', () => {
  mocks.session.sourceReady = true;
  const binding = resolveNavigationBinding(7);
  expect(binding).not.toBeNull();
  if (!binding) throw new Error('Expected an active navigation binding');

  mocks.session.sourceReady = false;
  expect(isCurrentNavigationBinding(binding)).toBe(false);
});
