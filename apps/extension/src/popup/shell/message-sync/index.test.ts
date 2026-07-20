import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  parsePopupRuntimeMessageMock: vi.fn(),
  subscribeToMessagesMock: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/runtime')>()),
  browserRuntime: {
    subscribeToMessages: mocks.subscribeToMessagesMock,
  },
}));

vi.mock('../../../contracts/messaging/parsers/boundary', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../contracts/messaging/parsers/boundary')>()),
  parsePopupRuntimeMessage: mocks.parsePopupRuntimeMessageMock,
}));

import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import {
  type VideoRecordingRuntimeState,
  VideoRecordingStatus,
} from '@sniptale/runtime-contracts/video/types/types';
import { subscribeToRecordingMessages } from './index';

function createRecordingState(): VideoRecordingRuntimeState {
  return {
    status: VideoRecordingStatus.RECORDING,
    duration: 5,
    countdownEndsAt: null,
    captureMode: null,
    captureSource: null,
    viewportPreset: null,
    error: null,
  };
}

function invokeListener(listener: ((message: unknown) => void) | null, message: unknown): void {
  if (!listener) {
    throw new Error('Expected recording-message listener to be registered');
  }

  listener(message);
}

function resetPopupMessageSyncMocks() {
  mocks.parsePopupRuntimeMessageMock.mockReset();
  mocks.subscribeToMessagesMock.mockReset();
}

function verifiesStateSyncRouting() {
  const onRecordingState = vi.fn();
  const onRecordingStartFailed = vi.fn();
  const unsubscribe = vi.fn();
  let listener: ((message: unknown) => void) | null = null;

  mocks.subscribeToMessagesMock.mockImplementation((nextListener) => {
    listener = nextListener;
    return unsubscribe;
  });
  mocks.parsePopupRuntimeMessageMock.mockReturnValue({
    type: VideoMessageType.RECORDING_STATE_SYNC,
    state: createRecordingState(),
  });

  const dispose = subscribeToRecordingMessages({
    onRecordingState,
    onRecordingStartFailed,
  });

  invokeListener(listener, { type: 'ignored' });

  expect(onRecordingState).toHaveBeenCalledWith(createRecordingState());
  expect(onRecordingStartFailed).not.toHaveBeenCalled();
  expect(dispose).toBe(unsubscribe);
}

function verifiesStartFailureRouting() {
  const onRecordingState = vi.fn();
  const onRecordingStartFailed = vi.fn();
  let listener: ((message: unknown) => void) | null = null;

  mocks.subscribeToMessagesMock.mockImplementation((nextListener) => {
    listener = nextListener;
    return vi.fn();
  });
  mocks.parsePopupRuntimeMessageMock
    .mockImplementationOnce(() => {
      throw new Error('bad payload');
    })
    .mockReturnValueOnce({
      type: VideoMessageType.RECORDING_START_FAILED,
      error: 'Start failed',
    });

  subscribeToRecordingMessages({
    onRecordingState,
    onRecordingStartFailed,
  });

  invokeListener(listener, { type: 'bad' });
  invokeListener(listener, { type: 'failed' });

  expect(onRecordingState).not.toHaveBeenCalled();
  expect(onRecordingStartFailed).toHaveBeenCalledWith('Start failed');
}

function runPopupMessageSyncSuite() {
  beforeEach(resetPopupMessageSyncMocks);

  it('routes state-sync messages to the recording-state handler', verifiesStateSyncRouting);
  it('routes start-failed messages and ignores invalid payloads', verifiesStartFailureRouting);
}

describe('subscribeToRecordingMessages', runPopupMessageSyncSuite);
