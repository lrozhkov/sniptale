import { expect, it, vi } from 'vitest';

import { pauseRenderLoopMediaElements } from './media';

it('pauses all render-loop media elements before rendering', async () => {
  const pause = vi.fn();

  await pauseRenderLoopMediaElements({
    clipMediaElements: new Map([
      ['clip-1', { pause }],
      ['clip-2', { pause }],
    ]),
  } as never);

  expect(pause).toHaveBeenCalledTimes(2);
});
