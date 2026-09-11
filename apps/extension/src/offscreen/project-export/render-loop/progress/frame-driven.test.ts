import { beforeEach, expect, it, vi } from 'vitest';

const sendProgressMock = vi.hoisted(() => vi.fn());

vi.mock('../../runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../runtime')>()),
  sendProgress: sendProgressMock,
}));

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

import { sendFrameDrivenProgress } from './frame-driven';

beforeEach(() => {
  sendProgressMock.mockReset();
  sendProgressMock.mockResolvedValue(undefined);
});

it('sends frame-driven progress with translated prefix', async () => {
  await sendFrameDrivenProgress('job-2', 5, 6);

  expect(sendProgressMock).toHaveBeenCalledWith(
    'job-2',
    expect.anything(),
    100,
    'offscreenExport.frameDrivenRenderPrefix 6 offscreenExport.progressFrameOf 6'
  );
});

it('keeps hybrid fallback details in frame-driven progress', async () => {
  await sendFrameDrivenProgress('job-2', 5, 6, 'Hybrid MP4: reason');

  expect(sendProgressMock).toHaveBeenCalledWith(
    'job-2',
    expect.anything(),
    100,
    'offscreenExport.frameDrivenRenderPrefix 6 offscreenExport.progressFrameOf 6 (Hybrid MP4: reason)'
  );
});

it('maps a span frame into its duration-weighted portion of the render', async () => {
  await sendFrameDrivenProgress('job', 4, 10, undefined, { start: 25, end: 75 });
  expect(sendProgressMock).toHaveBeenLastCalledWith(
    'job',
    expect.anything(),
    50,
    expect.any(String)
  );
});
