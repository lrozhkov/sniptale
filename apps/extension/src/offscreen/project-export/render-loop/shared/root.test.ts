import { expect, it, vi } from 'vitest';

import {
  getFrameDrivenKeyframeInterval,
  getRenderLoopDuration,
  pauseRenderLoopMediaElements,
  shouldSendFrameDrivenProgress,
} from './index';

it('keeps the root facade wired to the render-loop role helpers', async () => {
  expect(getRenderLoopDuration(0)).toBe(0.1);
  expect(getFrameDrivenKeyframeInterval(1)).toBe(2);
  expect(shouldSendFrameDrivenProgress(5, 2, 6, 6)).toBe(true);

  const pause = vi.fn();
  await pauseRenderLoopMediaElements({
    clipMediaElements: new Map([['clip-1', { pause }]]),
  } as never);

  expect(pause).toHaveBeenCalledTimes(1);
});
