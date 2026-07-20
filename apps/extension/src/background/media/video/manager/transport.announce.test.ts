import { beforeEach, expect, it, vi } from 'vitest';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { FakeRuntimeMessagingTransport } from '../../../../platform/runtime-messaging/fake';
import { installBackgroundRuntimeMessagingMock } from '../../../routing-contracts/runtime-messaging/mock';
import { announceCaptureSource } from './transport.announce';

const { setVideoRecordingRuntimeState } = vi.hoisted(() => ({
  setVideoRecordingRuntimeState: vi.fn(),
}));

vi.mock('../runtime/session-state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../runtime/session-state')>()),
  setVideoRecordingRuntimeState,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

it('announces the capture source through the typed runtime transport seam', async () => {
  const transport = new FakeRuntimeMessagingTransport();
  transport.onRuntimeMessage(VideoMessageType.CAPTURE_SOURCE_OBTAINED, () => ({ success: true }));

  const captureSource = {
    mode: CaptureMode.TAB,
    streamId: 'stream-id',
  };

  await announceCaptureSource(captureSource, CaptureMode.TAB, undefined, transport);

  expect(transport.runtimeRequests).toContainEqual({
    type: VideoMessageType.CAPTURE_SOURCE_OBTAINED,
    captureSource,
  });
  expect(setVideoRecordingRuntimeState).toHaveBeenCalledWith({
    captureSource,
    captureMode: CaptureMode.TAB,
    viewportPreset: null,
  });
});

it('uses the background runtime messaging service by default', async () => {
  const sendRuntimeMessage = vi.fn().mockResolvedValue(undefined);
  installBackgroundRuntimeMessagingMock({ sendRuntimeMessage });
  const captureSource = {
    mode: CaptureMode.TAB,
    streamId: 'stream-id',
  };

  await announceCaptureSource(captureSource, CaptureMode.TAB);

  expect(sendRuntimeMessage).toHaveBeenCalledWith({
    type: VideoMessageType.CAPTURE_SOURCE_OBTAINED,
    captureSource,
  });
});
