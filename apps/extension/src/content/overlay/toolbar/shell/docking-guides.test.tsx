// @vitest-environment jsdom

import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { resolveToolbarDockEdge, resolveToolbarDockViewport } from './docking';
import { ToolbarDockingGuides } from './docking-guides';

it('shows only horizontal corner targets for a collapsed-panel dock', () => {
  const root = document.createElement('div');
  root.innerHTML = renderToStaticMarkup(
    <ToolbarDockingGuides activeEdge="bottom-left" uiScale={1} cornersOnly />
  );
  expect(root.querySelectorAll('[data-active]')).toHaveLength(4);
  const layer = root.querySelector<HTMLElement>('[data-ui="content.toolbar.dock-guides"]')!;
  expect(layer.dataset['floatingUiCaptureTransient']).toBe('true');
  expect(layer.style.scale).toBe('1');
  expect(
    root
      .querySelector('[data-ui="content.toolbar.dock-zone.bottom-left"]')
      ?.getAttribute('data-active')
  ).toBe('true');
  expect(root.querySelector('[data-ui="content.toolbar.dock-zone.left"]')).toBeNull();
});

it.each([null, 'left'] as const)(
  'keeps neutral guides pointer-transparent with active edge %s',
  (activeEdge) => {
    const root = document.createElement('div');
    root.innerHTML = renderToStaticMarkup(
      <ToolbarDockingGuides activeEdge={activeEdge} uiScale={1.25} />
    );
    const guides = root.querySelectorAll<HTMLElement>('[data-active]');
    expect(guides).toHaveLength(8);
    for (const guide of guides) {
      expect(Number(guide.style.opacity || '1')).toBe(1);
      expect(guide.style.pointerEvents).toBe('none');
      const style = guide.getAttribute('style') ?? '';
      expect(style).not.toContain('--sniptale-color-accent');
      expect(guide.style.outline).toContain('color-mix');
      expect(style).toContain(
        guide.dataset['active'] === 'true' ? 'border:2px solid' : 'border:1px dashed'
      );
    }
    expect(
      root.querySelector<HTMLElement>('[data-ui="content.toolbar.dock-zone.left"]')?.style.left
    ).toBe('10px');
  }
);

it.each([0.5, 1, 1.5])(
  'activates both visible side guide boundaries with a scrollbar at scale %s',
  (scale) => {
    vi.stubGlobal('innerWidth', 1280);
    vi.stubGlobal('innerHeight', 560);
    vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(1263);
    vi.spyOn(document.documentElement, 'clientHeight', 'get').mockReturnValue(560);
    try {
      const root = document.createElement('div');
      root.innerHTML = renderToStaticMarkup(
        <ToolbarDockingGuides activeEdge={null} uiScale={scale} />
      );
      const viewport = resolveToolbarDockViewport(scale);
      for (const side of ['left', 'right'] as const) {
        const guide = root.querySelector<HTMLElement>(
          `[data-ui="content.toolbar.dock-zone.${side}"]`
        )!;
        const boundary =
          side === 'left'
            ? parseFloat(guide.style.left) + parseFloat(guide.style.width)
            : 1263 - parseFloat(guide.style.right) - parseFloat(guide.style.width);
        const inward = side === 'left' ? -0.5 : 0.5;
        expect(
          resolveToolbarDockEdge({ x: (boundary + inward) / scale, y: 280 / scale }, viewport)
        ).toBe(side);
        expect(
          resolveToolbarDockEdge({ x: (boundary - inward) / scale, y: 280 / scale }, viewport)
        ).toBeNull();
      }
    } finally {
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    }
  }
);
