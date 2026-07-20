import { beforeEach, expect, it, vi } from 'vitest';

const { handleCancelProjectExportMock, handleStartProjectExportMock } = vi.hoisted(() => ({
  handleCancelProjectExportMock: vi.fn(),
  handleStartProjectExportMock: vi.fn(),
}));

vi.mock('./project-export', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./project-export')>()),
  handleCancelProjectExport: handleCancelProjectExportMock,
  handleStartProjectExport: handleStartProjectExportMock,
}));
import {
  VideoExportFormat,
  VideoExportQualityPreset,
  type VideoProjectExportSettings,
} from '../../../../../../features/video/project/types';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import type { VideoRuntimeMessage } from '../../../../../../contracts/video/types/messages';
import { routeVideoRuntimeMessage } from '../../router';

function createSendResponse() {
  return vi.fn<(response?: unknown) => void>();
}

function asRuntimeMessage(message: VideoRuntimeMessage): VideoRuntimeMessage {
  return message;
}

function createInputReference() {
  return {
    contentSha256: `sha256:${'a'.repeat(64)}`,
    jobId: 'job-1',
    projectId: 'project-1',
    retainedByteLength: 3 * 1024 * 1024,
  };
}

function createExportSettings(): VideoProjectExportSettings {
  return {
    downloadAfterExport: true,
    format: VideoExportFormat.MP4,
    fps: 30,
    height: 720,
    quality: VideoExportQualityPreset.BALANCED,
    width: 1280,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

it('rejects project export start and cancel routes without boundary preauthorization', () => {
  const sendResponse = createSendResponse();

  expect(
    routeVideoRuntimeMessage(
      asRuntimeMessage({
        capabilityToken: 'start-token',
        jobId: 'job-1',
        input: createInputReference(),
        settings: createExportSettings(),
        type: VideoMessageType.START_PROJECT_EXPORT,
      }),
      sendResponse
    )
  ).toEqual({ handled: true, keepChannelOpen: false });
  expect(sendResponse).toHaveBeenCalledWith({
    error: 'Unauthorized project export capability',
    success: false,
  });

  sendResponse.mockClear();
  expect(
    routeVideoRuntimeMessage(
      asRuntimeMessage({
        capabilityToken: 'cancel-token',
        jobId: 'job-1',
        type: VideoMessageType.CANCEL_PROJECT_EXPORT,
      }),
      sendResponse
    )
  ).toEqual({ handled: true, keepChannelOpen: false });
  expect(sendResponse).toHaveBeenCalledWith({
    error: 'Unauthorized project export capability',
    success: false,
  });
  expect(handleStartProjectExportMock).not.toHaveBeenCalled();
  expect(handleCancelProjectExportMock).not.toHaveBeenCalled();
});
