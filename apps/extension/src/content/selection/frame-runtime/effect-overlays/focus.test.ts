// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FrameData } from '../../../../features/highlighter/contracts';
import {
  createBorderSettingsFixture,
  createFocusSettingsFixture,
  createFrameDataFixture,
} from '../react/test-support';

const appendToContentOverlayRoot = vi.hoisted(() =>
  vi.fn((overlay: HTMLElement) => document.body.append(overlay))
);

vi.mock('../../../platform/dom-host', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/dom-host')>()),
  appendToContentOverlayRoot,
}));

vi.mock('../../../platform/dom-host/isolated', () => ({
  applyIsolatedContentRootStyle: vi.fn(),
}));

import { registerImmediateFocusOverlayUpdates, updateFocusOverlayMask } from './focus';
import type { OverlayRefs } from './types';

type FrameGeometry = Pick<FrameData, 'x' | 'y' | 'width' | 'height'>;

function createOverlayRefs(rect: SVGRectElement): OverlayRefs {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.appendChild(rect);

  return {
    focusOverlayRef: { current: null },
    focusSvgRef: { current: svg },
    focusMaskIdRef: { current: 'mask-id' },
    blurOverlaysRef: { current: new Map() },
    blurFiltersSvgRef: { current: null },
    blurFiltersIdRef: { current: 'filters-id' },
  };
}

function createFrame(showBorder: boolean, geometry?: FrameGeometry): FrameData {
  return createFrameDataFixture('frame-1', {
    ...geometry,
    effectMode: 'focus',
    focusSettings: createFocusSettingsFixture({ showBorder }),
    borderSettings: createBorderSettingsFixture({ radius: 18, width: 4 }),
  });
}

function createFocusRect() {
  const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  rect.dataset['frameId'] = 'frame-1';
  return rect;
}

beforeEach(() => {
  vi.clearAllMocks();
  document.body.replaceChildren();
});

function expectRectGeometry(rect: SVGRectElement, geometry: FrameGeometry) {
  expect(rect.getAttribute('x')).toBe(String(geometry.x));
  expect(rect.getAttribute('y')).toBe(String(geometry.y));
  expect(rect.getAttribute('width')).toBe(String(geometry.width));
  expect(rect.getAttribute('height')).toBe(String(geometry.height));
}

describe('frame-effect-overlays focus geometry', () => {
  it.each([false, true])(
    'keeps static and immediate rendering on one canonical geometry when showBorder=%s',
    (showBorder) => {
      const geometry = { x: 11, y: 22, width: 33, height: 44 };
      const frame = createFrame(showBorder, geometry);
      const refs = createOverlayRefs(createFocusRect());

      updateFocusOverlayMask([frame], refs);
      const rect = refs.focusSvgRef.current?.querySelector<SVGRectElement>(
        'rect[data-frame-id="frame-1"]'
      );
      expect(rect).not.toBeNull();
      expectRectGeometry(rect!, geometry);
      expect(rect?.getAttribute('rx')).toBe('16.5');

      rect?.setAttribute('x', '0');
      rect?.setAttribute('y', '0');
      rect?.setAttribute('width', '1');
      rect?.setAttribute('height', '1');
      const cleanup = registerImmediateFocusOverlayUpdates({ current: [frame] }, refs);

      window.sniptaleUpdateFocusMaskImmediate?.('frame-1', geometry);

      expectRectGeometry(rect!, geometry);
      expect(rect?.getAttribute('rx')).toBe('16.5');

      cleanup();
      expect(window.sniptaleUpdateFocusMaskImmediate).toBeUndefined();
      expect(window.sniptaleGetFocusSvgRef).toBeUndefined();
    }
  );

  it('recreates a focus overlay removed by clear-all before a frame is restored', () => {
    const refs = createOverlayRefs(createFocusRect());
    refs.focusSvgRef.current = null;
    const focusFrames = [createFrame(false)];

    updateFocusOverlayMask(focusFrames, refs);
    const removedOverlay = refs.focusOverlayRef.current;
    expect(removedOverlay?.isConnected).toBe(true);

    removedOverlay?.remove();
    updateFocusOverlayMask([], refs);
    updateFocusOverlayMask(focusFrames, refs);

    expect(appendToContentOverlayRoot).toHaveBeenCalledTimes(2);
    expect(refs.focusOverlayRef.current).not.toBe(removedOverlay);
    expect(refs.focusOverlayRef.current?.isConnected).toBe(true);
    expect(refs.focusOverlayRef.current?.contains(refs.focusSvgRef.current)).toBe(true);
  });
});
