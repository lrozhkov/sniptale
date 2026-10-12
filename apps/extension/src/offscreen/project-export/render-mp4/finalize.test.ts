import { beforeEach, expect, it, vi } from 'vitest';

const getExportFormatDescriptorMock = vi.hoisted(() => vi.fn());
const sendProgressMock = vi.hoisted(() => vi.fn());

vi.mock('../persistence', () => ({
  getExportFormatDescriptor: getExportFormatDescriptorMock,
}));

vi.mock('../runtime', () => ({
  sendProgress: sendProgressMock,
}));

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
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

it('waits for asynchronous finalization before reading the completed buffer', async () => {
  const target: { buffer: ArrayBuffer | null } = { buffer: null };
  let finish: (() => void) | undefined;
  const finalized = new Promise<void>((resolve) => {
    finish = () => {
      target.buffer = new ArrayBuffer(13);
      resolve();
    };
  });
  const finalize = vi.fn(() => finalized);
  const result = finalizeMp4Muxing({
    jobId: 'async-output',
    pipeline: { muxer: { finalize }, target } as never,
    throwIfPipelineFailed: vi.fn(),
  });
  await vi.waitFor(() => expect(finalize).toHaveBeenCalledOnce());
  finish!();
  expect((await result).size).toBe(13);
});

it('rejects missing finalized output instead of publishing an empty container', async () => {
  await expect(
    finalizeMp4Muxing({
      jobId: 'missing-output',
      pipeline: {
        muxer: { finalize: vi.fn().mockResolvedValue(undefined) },
        target: { buffer: null },
      } as never,
      throwIfPipelineFailed: vi.fn(),
    })
  ).rejects.toThrow();
});

it('refuses output when cancellation arrives during asynchronous finalization', async () => {
  const abort = new AbortController();
  await expect(
    finalizeMp4Muxing({
      jobId: 'cancelled-output',
      pipeline: {
        muxer: {
          finalize: async () => {
            abort.abort();
          },
        },
        target: { buffer: new ArrayBuffer(8) },
      } as never,
      signal: abort.signal,
      throwIfPipelineFailed: vi.fn(),
    })
  ).rejects.toThrow('PROJECT_EXPORT_CANCELLED');
});
