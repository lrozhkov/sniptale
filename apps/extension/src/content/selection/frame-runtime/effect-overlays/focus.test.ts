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

function createFrame(showBorder: boolean): FrameData {
  return createFrameDataFixture('frame-1', {
    effectMode: 'focus',
    focusSettings: createFocusSettingsFixture({ showBorder }),
    borderSettings: createBorderSettingsFixture({ width: 4 }),
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

describe('frame-effect-overlays focus immediate updates', () => {
  it('matches the raw frame geometry when the focus border is hidden', () => {
    const rect = createFocusRect();
    const cleanup = registerImmediateFocusOverlayUpdates(
      { current: [createFrame(false)] },
      createOverlayRefs(rect)
    );

    window.sniptaleUpdateFocusMaskImmediate?.('frame-1', 11, 22, 33, 44);

    expect(rect.getAttribute('x')).toBe('15');
    expect(rect.getAttribute('y')).toBe('26');
    expect(rect.getAttribute('width')).toBe('33');
    expect(rect.getAttribute('height')).toBe('44');

    cleanup();
    expect(window.sniptaleUpdateFocusMaskImmediate).toBeUndefined();
    expect(window.sniptaleGetFocusSvgRef).toBeUndefined();
  });

  it('keeps the expanded focus geometry when the focus border stays visible', () => {
    const rect = createFocusRect();
    const cleanup = registerImmediateFocusOverlayUpdates(
      { current: [createFrame(true)] },
      createOverlayRefs(rect)
    );

    window.sniptaleUpdateFocusMaskImmediate?.('frame-1', 11, 22, 33, 44);

    expect(rect.getAttribute('x')).toBe('11');
    expect(rect.getAttribute('y')).toBe('22');
    expect(rect.getAttribute('width')).toBe('41');
    expect(rect.getAttribute('height')).toBe('52');

    cleanup();
  });

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
