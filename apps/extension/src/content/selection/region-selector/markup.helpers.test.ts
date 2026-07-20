// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';

vi.mock('../../../platform/i18n', () => ({
  translate: vi.fn((key: string) => key),
}));

import { buildRegionSelectorMarkup, updateOverlayMask } from './markup.helpers';

beforeEach(() => {
  document.body.innerHTML = '';
});

it('builds region selector markup with masks, handles, and instruction badge', () => {
  const fragment = buildRegionSelectorMarkup({
    currentRegion: { height: 40, width: 30, x: 10, y: 20 },
  });
  const root = fragment.firstChild as HTMLElement;

  expect(root.id).toBe('sniptale-overlay');
  expect(root.querySelectorAll('[data-ui="content.region-mask"]')).toHaveLength(4);
  expect(root.querySelector('#sniptale-region')).not.toBeNull();
  expect(root.querySelectorAll('.sniptale-resize').length).toBeGreaterThan(0);
  expect(root.textContent).toContain('content.overlayControls.regionInstruction');
});

it('updates overlay mask positions for the current region', () => {
  const root = buildRegionSelectorMarkup({
    currentRegion: { height: 20, width: 20, x: 5, y: 5 },
  }).firstChild as HTMLElement;

  updateOverlayMask(root, { height: 50, width: 60, x: 15, y: 25 });

  const children = Array.from(root.children) as HTMLElement[];
  const [topMask, bottomMask, leftMask, rightMask] = children;
  if (!topMask || !bottomMask || !leftMask || !rightMask) {
    throw new Error('Expected four region masks');
  }
  expect(topMask.style.height).toBe('25px');
  expect(bottomMask.style.top).toBe('75px');
  expect(leftMask.style.width).toBe('15px');
  expect(rightMask.style.left).toBe('75px');
});
