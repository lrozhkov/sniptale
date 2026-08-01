import { beforeEach, expect, it, vi } from 'vitest';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';

const { sendRuntimeMessageMock } = vi.hoisted(() => ({
  sendRuntimeMessageMock: vi.fn(),
}));

vi.mock('../../../runtime-services', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../runtime-services')>()),
  getPopupRuntimeServices: () => ({
    messaging: { sendRuntimeMessage: sendRuntimeMessageMock },
  }),
}));

import {
  acknowledgeVideoPostRecordResult,
  loadPendingVideoPostRecordResult,
} from './result-runtime';

const RESULT = {
  primaryRecordingId: 'rec-1-window-1',
  projectId: 'project-1',
  recordingId: 'rec-1',
};

beforeEach(() => {
  vi.clearAllMocks();
});

it('keeps durable decision authority even when media availability changed', async () => {
  sendRuntimeMessageMock.mockResolvedValue({ success: true, postRecordResult: RESULT });

  await expect(loadPendingVideoPostRecordResult()).resolves.toEqual(RESULT);
  expect(sendRuntimeMessageMock).toHaveBeenCalledWith({
    type: VideoMessageType.GET_RECORDING_STATE,
  });
  sendRuntimeMessageMock.mockResolvedValueOnce({ success: true });
  await expect(loadPendingVideoPostRecordResult()).resolves.toBeNull();

  sendRuntimeMessageMock.mockResolvedValueOnce({ success: false, error: 'storage unavailable' });
  await expect(loadPendingVideoPostRecordResult()).rejects.toThrow('storage unavailable');
});

it('acknowledges the exact recording group and surfaces rejected writes', async () => {
  sendRuntimeMessageMock.mockResolvedValueOnce({ success: true, result: 'acknowledged' });
  await expect(acknowledgeVideoPostRecordResult('rec-1')).resolves.toBe('acknowledged');
  expect(sendRuntimeMessageMock).toHaveBeenCalledWith({
    type: VideoMessageType.ACKNOWLEDGE_POST_RECORD_RESULT,
    recordingId: 'rec-1',
  });

  sendRuntimeMessageMock.mockResolvedValueOnce({ success: false, error: 'storage failed' });
  await expect(acknowledgeVideoPostRecordResult('rec-1')).rejects.toThrow('storage failed');

  sendRuntimeMessageMock.mockResolvedValueOnce({ success: true, result: 'stale' });
  await expect(acknowledgeVideoPostRecordResult('rec-1')).resolves.toBe('stale');

  sendRuntimeMessageMock.mockResolvedValueOnce({ success: true });
  await expect(acknowledgeVideoPostRecordResult('rec-1')).rejects.toThrow(
    'Invalid post-record acknowledgement response'
  );
});
