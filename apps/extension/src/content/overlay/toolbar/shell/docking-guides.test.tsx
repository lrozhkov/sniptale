// @vitest-environment jsdom

import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
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
