import { beforeEach, expect, it, vi } from 'vitest';

const {
  getActiveMultiSourceRecordingIdMock,
  hasActiveMultiSourceRecordingMock,
  pauseMultiSourceRecordingMock,
  resumeMultiSourceRecordingMock,
  sendRuntimeMessageMock,
  stopMultiSourceRecordingMock,
} = vi.hoisted(() => ({
  getActiveMultiSourceRecordingIdMock: vi.fn(),
  hasActiveMultiSourceRecordingMock: vi.fn(),
  pauseMultiSourceRecordingMock: vi.fn(),
  resumeMultiSourceRecordingMock: vi.fn(),
  sendRuntimeMessageMock: vi.fn(),
  stopMultiSourceRecordingMock: vi.fn(),
}));

vi.mock('./multi-source', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./multi-source')>();
  return {
    ...actual,
    getActiveMultiSourceRecordingId: getActiveMultiSourceRecordingIdMock,
    hasActiveMultiSourceRecording: hasActiveMultiSourceRecordingMock,
    pauseMultiSourceRecording: pauseMultiSourceRecordingMock,
    resumeMultiSourceRecording: resumeMultiSourceRecordingMock,
    stopMultiSourceRecording: stopMultiSourceRecordingMock,
  };
});

vi.mock('../../platform/runtime-messaging/index', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../platform/runtime-messaging/index')>();
  return {
    ...actual,
    sendRuntimeMessage: sendRuntimeMessageMock,
  };
});

import { pauseRecording, resumeRecording, stopRecording } from './controller';

beforeEach(() => {
  vi.clearAllMocks();
  getActiveMultiSourceRecordingIdMock.mockReturnValue('multi-1');
  hasActiveMultiSourceRecordingMock.mockReturnValue(true);
  sendRuntimeMessageMock.mockResolvedValue(undefined);
  stopMultiSourceRecordingMock.mockResolvedValue(undefined);
});

it('rejects an unbound stop even when a multi-source session is active', async () => {
  await expect(
    stopRecording(
      { generation: 1, recordingId: 'multi-1', streamInstanceId: 'unknown-stream' },
      true
    )
  ).rejects.toThrow('Recording source binding is unavailable');

  expect(stopMultiSourceRecordingMock).not.toHaveBeenCalled();
});

it('rejects pause and resume controls without the active multi-source identity', () => {
  const stale = { generation: 1, recordingId: 'multi-1', streamInstanceId: 'stale-stream' };
  expect(() => pauseRecording(stale)).toThrow('Recording source binding is unavailable');
  expect(() => resumeRecording(stale)).toThrow('Recording source binding is unavailable');

  expect(pauseMultiSourceRecordingMock).not.toHaveBeenCalled();
  expect(resumeMultiSourceRecordingMock).not.toHaveBeenCalled();
  expect(sendRuntimeMessageMock).not.toHaveBeenCalled();
});
