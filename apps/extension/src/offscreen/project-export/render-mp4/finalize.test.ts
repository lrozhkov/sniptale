import { beforeEach, expect, it, vi } from 'vitest';

const getExportFormatDescriptorMock = vi.hoisted(() => vi.fn());
const sendProgressMock = vi.hoisted(() => vi.fn());

vi.mock('../persistence', () => ({
  getExportFormatDescriptor: getExportFormatDescriptorMock,
}));

vi.mock('../runtime', () => ({
  sendProgress: sendProgressMock,
}));

vi.mock('../../../platform/i18n', () => ({
  translate: (key: string) => key,
}));

import { finalizeMp4Muxing, flushMp4Encoders } from './finalize';
import { VideoProjectExportPhase } from '../../../features/video/project/types';

beforeEach(() => {
  getExportFormatDescriptorMock.mockReset();
  sendProgressMock.mockReset();
  getExportFormatDescriptorMock.mockReturnValue({ mimeType: 'video/mp4' });
});

it('flushes both encoders when present', async () => {
  const videoEncoder = { flush: vi.fn().mockResolvedValue(undefined) } as unknown as VideoEncoder;
  const audioEncoder = { flush: vi.fn().mockResolvedValue(undefined) } as unknown as AudioEncoder;

  await flushMp4Encoders(videoEncoder, audioEncoder);

  expect(videoEncoder.flush).toHaveBeenCalledOnce();
  expect(audioEncoder.flush).toHaveBeenCalledOnce();
});

it('flushes only the video encoder when no audio encoder exists', async () => {
  const videoEncoder = { flush: vi.fn().mockResolvedValue(undefined) } as unknown as VideoEncoder;

  await flushMp4Encoders(videoEncoder, null);

  expect(videoEncoder.flush).toHaveBeenCalledOnce();
});

it('finalizes the container and returns a blob', async () => {
  const finalizeMock = vi.fn();
  sendProgressMock.mockResolvedValue(undefined);

  const blob = await finalizeMp4Muxing({
    jobId: 'job-1',
    pipeline: {
      muxer: { finalize: finalizeMock },
      target: { buffer: new ArrayBuffer(8) },
    } as never,
    throwIfPipelineFailed: vi.fn(),
  });

  expect(sendProgressMock).toHaveBeenCalledWith(
    'job-1',
    VideoProjectExportPhase.TRANSCODING,
    98,
    'offscreenExport.mp4FinalizingContainer'
  );
  expect(finalizeMock).toHaveBeenCalledOnce();
  expect(blob.type).toBe('video/mp4');
});
