import { expect, it, vi } from 'vitest';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import { createRecordingStagingCoordinatorTestDouble } from '../encoding/artifact-session.test-support';

const { createWebcamSidecarRecorderMock } = vi.hoisted(() => ({
  createWebcamSidecarRecorderMock: vi.fn(),
}));

vi.mock('../sidecar', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../sidecar')>()),
  createWebcamSidecarRecorder: createWebcamSidecarRecorderMock,
}));

import { createMultiSourceWebcamRecorder } from './webcam';

it('uses the aggregate multi-source coordinator for the webcam artifact', async () => {
  const coordinator = createRecordingStagingCoordinatorTestDouble();
  createWebcamSidecarRecorderMock.mockResolvedValue(null);

  await createMultiSourceWebcamRecorder({
    baseRecordingId: 'rec',
    coordinator,
    settings: DEFAULT_VIDEO_SETTINGS,
  });

  expect(createWebcamSidecarRecorderMock).toHaveBeenCalledWith({
    baseRecordingId: 'rec',
    coordinator,
    settings: DEFAULT_VIDEO_SETTINGS,
  });
});
