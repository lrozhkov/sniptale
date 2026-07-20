import { beforeEach, expect, it, vi } from 'vitest';

const sendFrameDrivenProgressMock = vi.hoisted(() => vi.fn());
const shouldSendFrameDrivenProgressMock = vi.hoisted(() => vi.fn());

vi.mock('../progress/frame-driven', () => ({
  sendFrameDrivenProgress: sendFrameDrivenProgressMock,
}));

vi.mock('../shared/progress', () => ({
  shouldSendFrameDrivenProgress: shouldSendFrameDrivenProgressMock,
}));

import { maybeSendFrameDrivenProgress } from './progress';

beforeEach(() => {
  sendFrameDrivenProgressMock.mockReset();
  shouldSendFrameDrivenProgressMock.mockReset();
});

it('returns the previous progress frame when cadence says to skip', async () => {
  shouldSendFrameDrivenProgressMock.mockReturnValue(false);

  await expect(
    maybeSendFrameDrivenProgress({
      fps: 30,
      frameIndex: 1,
      job: { jobId: 'job-1' } as never,
      lastProgressFrame: 0,
      totalFrames: 10,
    })
  ).resolves.toBe(0);
  expect(sendFrameDrivenProgressMock).not.toHaveBeenCalled();
});

it('sends progress when cadence allows it', async () => {
  shouldSendFrameDrivenProgressMock.mockReturnValue(true);
  sendFrameDrivenProgressMock.mockResolvedValue(undefined);

  await expect(
    maybeSendFrameDrivenProgress({
      fps: 30,
      frameIndex: 3,
      job: { jobId: 'job-1' } as never,
      lastProgressFrame: 0,
      totalFrames: 10,
    })
  ).resolves.toBe(3);
  expect(sendFrameDrivenProgressMock).toHaveBeenCalledWith('job-1', 3, 10, undefined);
});

it('passes persistent message detail to frame-driven progress', async () => {
  shouldSendFrameDrivenProgressMock.mockReturnValue(true);
  sendFrameDrivenProgressMock.mockResolvedValue(undefined);

  await expect(
    maybeSendFrameDrivenProgress({
      fps: 30,
      frameIndex: 3,
      job: { jobId: 'job-1' } as never,
      lastProgressFrame: 0,
      messageDetail: 'Hybrid MP4: reason',
      totalFrames: 10,
    })
  ).resolves.toBe(3);
  expect(sendFrameDrivenProgressMock).toHaveBeenCalledWith('job-1', 3, 10, 'Hybrid MP4: reason');
});
