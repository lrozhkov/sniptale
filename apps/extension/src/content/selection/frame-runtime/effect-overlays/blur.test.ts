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

import { registerImmediateBlurOverlayUpdates, updateBlurOverlayNodes } from './blur';
import type { OverlayRefs } from './types';

type FrameGeometry = Pick<FrameData, 'x' | 'y' | 'width' | 'height'>;

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

function createFrame(showBorder: boolean, geometry: FrameGeometry): FrameData {
  return createFrameDataFixture('frame-1', {
    ...geometry,
    effectMode: 'blur',
    blurSettings: createBlurSettingsFixture({ showBorder }),
    borderSettings: createBorderSettingsFixture({ width: 4 }),
  });
}

function expectOverlayGeometry(overlay: HTMLDivElement, geometry: FrameGeometry) {
  expect(overlay.style.left).toBe(`${geometry.x}px`);
  expect(overlay.style.top).toBe(`${geometry.y}px`);
  expect(overlay.style.width).toBe(`${geometry.width}px`);
  expect(overlay.style.height).toBe(`${geometry.height}px`);
}

describe('frame-effect-overlays blur geometry', () => {
  it.each([false, true])(
    'keeps static and immediate rendering on one canonical geometry when showBorder=%s',
    (showBorder) => {
      const geometry = { x: 11, y: 22, width: 33, height: 44 };
      const frame = createFrame(showBorder, geometry);
      const overlay = document.createElement('div');
      const refs = createOverlayRefs(overlay);

      updateBlurOverlayNodes([frame], refs, vi.fn(), vi.fn());

      expectOverlayGeometry(overlay, geometry);
      expect(overlay.style.borderRadius).toBe('6px');

      overlay.style.left = '0px';
      overlay.style.top = '0px';
      overlay.style.width = '1px';
      overlay.style.height = '1px';
      const cleanup = registerImmediateBlurOverlayUpdates({ current: [frame] }, refs);

      window.sniptaleUpdateBlurOverlayImmediate?.('frame-1', geometry);

      expectOverlayGeometry(overlay, geometry);
      expect(overlay.style.borderRadius).toBe('6px');

      cleanup();
      expect(window.sniptaleUpdateBlurOverlayImmediate).toBeUndefined();
    }
  );
});
