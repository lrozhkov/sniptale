import { describe, expect, it } from 'vitest';

import { hasBrowserFrameLayer } from './browser-frame';

describe('scene resize browser frame layer detection', () => {
  it('detects browser frame objects on the canvas', () => {
    const canvas = {
      getObjects: () => [{ sniptaleType: 'shape' }, { sniptaleType: 'browser-frame' }],
    };

    expect(hasBrowserFrameLayer(canvas as never)).toBe(true);
  });

  it('treats missing canvas objects as no browser frame layer', () => {
    expect(hasBrowserFrameLayer(null)).toBe(false);
    expect(hasBrowserFrameLayer({} as never)).toBe(false);
  });
});
