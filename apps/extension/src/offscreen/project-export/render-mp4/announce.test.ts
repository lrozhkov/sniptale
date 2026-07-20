import { beforeEach, expect, it, vi } from 'vitest';

const sendProgressMock = vi.hoisted(() => vi.fn());

vi.mock('../runtime', () => ({
  sendProgress: sendProgressMock,
}));

vi.mock('../../../platform/i18n', () => ({
  translate: (key: string) => key,
}));

import { announceMp4PipelineStart, formatMuxerInitMessage } from './announce';
import { VideoProjectExportPhase } from '../../../features/video/project/types';

beforeEach(() => {
  sendProgressMock.mockReset();
});

it('formats muxer init copy with and without fallback notes', () => {
  const expectedFallbackMessage =
    'offscreenExport.mp4MuxerInitializingWithFallbackPrefix' +
    'Opus fallback' +
    'offscreenExport.mp4MuxerInitializingWithFallbackSuffix';

  expect(formatMuxerInitMessage([])).toBe('offscreenExport.mp4MuxerInitializing');
  expect(formatMuxerInitMessage(['Opus fallback'])).toBe(expectedFallbackMessage);
});

it('sends the muxer initialization progress event', async () => {
  sendProgressMock.mockResolvedValue(undefined);

  await announceMp4PipelineStart('job-1', ['Opus fallback']);

  expect(sendProgressMock).toHaveBeenCalledWith(
    'job-1',
    VideoProjectExportPhase.TRANSCODING,
    0,
    expect.stringContaining('Opus fallback')
  );
});
