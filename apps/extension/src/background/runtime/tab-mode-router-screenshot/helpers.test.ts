import { describe, expect, it } from 'vitest';

import { createViewportStateSnapshot, resolveDefaultScreenshotViewport } from './helpers';

describe('tab-mode-router-screenshot.helpers', () => {
  it('returns null for native or missing default viewport presets', () => {
    expect(
      resolveDefaultScreenshotViewport({
        defaultViewportId: 'native',
        viewportPresets: [{ id: 'wide', label: 'Wide', width: 1440, height: 900 }],
      })
    ).toBeNull();

    expect(
      resolveDefaultScreenshotViewport({
        defaultViewportId: 'missing',
        viewportPresets: [{ id: 'wide', label: 'Wide', width: 1440, height: 900 }],
      })
    ).toBeNull();
  });

  it('returns the resolved default viewport preset dimensions', () => {
    expect(
      resolveDefaultScreenshotViewport({
        defaultViewportId: 'wide',
        viewportPresets: [{ id: 'wide', label: 'Wide', width: 1440, height: 900 }],
      })
    ).toEqual({ width: 1440, height: 900 });
  });

  it('creates a viewport snapshot only when both dimensions are present', () => {
    expect(createViewportStateSnapshot(undefined, 900)).toBeNull();
    expect(createViewportStateSnapshot(1440, null)).toBeNull();
    expect(createViewportStateSnapshot(1440, 900)).toEqual({ width: 1440, height: 900 });
  });
});
