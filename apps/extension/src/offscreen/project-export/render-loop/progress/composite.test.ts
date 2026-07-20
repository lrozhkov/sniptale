import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const sendProgressMock = vi.hoisted(() => vi.fn());

vi.mock('../../runtime', () => ({
  sendProgress: sendProgressMock,
}));

vi.mock('../../../../platform/i18n', () => ({
  translate: (key: string) => key,
}));
import { VideoExportFormat } from '../../../../features/video/project/types';
import { sendCompositeRenderProgress } from './composite';

beforeEach(() => {
  sendProgressMock.mockReset();
  sendProgressMock.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

it('throttles composite render progress by timestamp', async () => {
  vi.spyOn(performance, 'now').mockReturnValueOnce(1_000).mockReturnValueOnce(1_100);

  const result = await sendCompositeRenderProgress({
    currentFrame: 2,
    totalFrames: 6,
    format: VideoExportFormat.WEBM,
    jobId: 'job-1',
    lastProgressSent: 900,
  });

  expect(result).toBeNull();
  expect(sendProgressMock).not.toHaveBeenCalled();
});

it('sends composite progress with the encoding label for mp4', async () => {
  vi.spyOn(performance, 'now').mockReturnValueOnce(2_000);

  const result = await sendCompositeRenderProgress({
    currentFrame: 3,
    totalFrames: 6,
    format: VideoExportFormat.MP4,
    jobId: 'job-2',
    lastProgressSent: 0,
  });

  expect(result).toBe(2_000);
  expect(sendProgressMock).toHaveBeenCalledWith(
    'job-2',
    expect.anything(),
    50,
    'offscreenExport.renderEncodingAction 3 offscreenExport.progressFrameOf 6'
  );
});
