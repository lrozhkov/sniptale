// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: vi.fn((key: string) => key),
}));

import { buildRegionSelectorMarkup, updateOverlayMask } from './markup';

beforeEach(() => {
  document.body.innerHTML = '';
});

it('builds the complete styled region selector surface', () => {
  const fragment = buildRegionSelectorMarkup({
    currentRegion: { height: 40, width: 30, x: 10, y: 20 },
  });
  const root = fragment.firstChild as HTMLElement;
  const masks = root.querySelectorAll<HTMLElement>('[data-ui="content.region-mask"]');
  const region = root.querySelector<HTMLElement>('#sniptale-region');
  const firstHandle = root.querySelector<HTMLElement>('.sniptale-resize');
  const instruction = root.lastElementChild as HTMLElement;

  expect(root.id).toBe('sniptale-overlay');
  expect(getComputedStyle(root).backgroundColor).toBe('rgba(0, 0, 0, 0)');
  expect(masks).toHaveLength(4);
  for (const mask of masks) {
    expect(mask.style.background).toContain(
      'color-mix(in srgb, var(--sniptale-color-overlay) 72%, transparent)'
    );
  }
  expect(region?.style.border).toContain(
    'color-mix(in srgb, var(--sniptale-color-accent) 56%, var(--sniptale-color-border-soft) 44%)'
  );
  expect(firstHandle?.style.background).toContain(
    'color-mix(in srgb, var(--sniptale-color-accent-soft) 18%, var(--sniptale-color-surface-panel) 82%)'
  );
  expect(firstHandle?.style.boxShadow).toContain('0 8px 18px');
  expect(instruction.style.background).toContain(
    'color-mix(in srgb, var(--sniptale-color-surface-panel) 92%, var(--sniptale-color-surface-canvas) 8%)'
  );
  expect(instruction.style.borderRadius).toBe('12px');
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
