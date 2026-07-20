// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import type { FrameData } from '../../../../features/highlighter/contracts';
import {
  createBlurSettingsFixture,
  createBorderSettingsFixture,
  createFrameDataFixture,
} from '../react/test-support';

vi.mock('../../../platform/dom-host', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/dom-host')>()),
  appendToContentOverlayRoot: vi.fn(),
}));

vi.mock('../../../platform/dom-host/isolated', () => ({
  applyIsolatedContentRootStyle: vi.fn(),
}));

import { registerImmediateBlurOverlayUpdates } from './blur';
import type { OverlayRefs } from './types';

function createOverlayRefs(overlay: HTMLDivElement): OverlayRefs {
  return {
    focusOverlayRef: { current: null },
    focusSvgRef: { current: null },
    focusMaskIdRef: { current: 'mask-id' },
    blurOverlaysRef: { current: new Map([['frame-1', overlay]]) },
    blurFiltersSvgRef: { current: null },
    blurFiltersIdRef: { current: 'filters-id' },
  };
}

function createFrame(showBorder: boolean): FrameData {
  return createFrameDataFixture('frame-1', {
    effectMode: 'blur',
    blurSettings: createBlurSettingsFixture({ showBorder }),
    borderSettings: createBorderSettingsFixture({ width: 4 }),
  });
}

describe('frame-effect-overlays blur immediate updates', () => {
  it('matches the raw frame geometry when the blur border is hidden', () => {
    const overlay = document.createElement('div');
    const cleanup = registerImmediateBlurOverlayUpdates(
      { current: [createFrame(false)] },
      createOverlayRefs(overlay)
    );

    window.sniptaleUpdateBlurOverlayImmediate?.('frame-1', 11, 22, 33, 44);

    expect(overlay.style.left).toBe('15px');
    expect(overlay.style.top).toBe('26px');
    expect(overlay.style.width).toBe('33px');
    expect(overlay.style.height).toBe('44px');

    cleanup();
    expect(window.sniptaleUpdateBlurOverlayImmediate).toBeUndefined();
  });

  it('keeps the inset blur geometry when the blur border stays visible', () => {
    const overlay = document.createElement('div');
    const cleanup = registerImmediateBlurOverlayUpdates(
      { current: [createFrame(true)] },
      createOverlayRefs(overlay)
    );

    window.sniptaleUpdateBlurOverlayImmediate?.('frame-1', 11, 22, 33, 44);

    expect(overlay.style.left).toBe('15px');
    expect(overlay.style.top).toBe('26px');
    expect(overlay.style.width).toBe('33px');
    expect(overlay.style.height).toBe('44px');

    cleanup();
  });
});
