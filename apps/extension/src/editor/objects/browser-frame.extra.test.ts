import { describe, expect, it } from 'vitest';

import { createBrowserFrameObjects } from './browser-frame';

describe('object-factory browser-frame seam', () => {
  it('does not create scene background decorations', async () => {
    await expect(
      createBrowserFrameObjects({
        canvasHeight: 200,
        canvasWidth: 300,
        frame: {
          backgroundColor: '#ffffff',
          backgroundMode: 'color',
        },
      } as never)
    ).resolves.toEqual([]);
  });
});
