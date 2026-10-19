// @vitest-environment jsdom

import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { ToolbarDockingGuides } from './docking-guides';

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
