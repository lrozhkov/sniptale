// @vitest-environment jsdom

import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { ToolbarDockingGuides } from './docking-guides';

it.each([null, 'left'] as const)(
  'keeps guide outlines opaque and pointer-transparent with active edge %s',
  (activeEdge) => {
    const root = document.createElement('div');
    root.innerHTML = renderToStaticMarkup(
      <ToolbarDockingGuides activeEdge={activeEdge} uiScale={1.25} />
    );
    const guides = root.querySelectorAll<HTMLElement>('[data-active]');
    expect(guides).toHaveLength(4);
    for (const guide of guides) {
      expect(Number(guide.style.opacity || '1')).toBe(1);
      expect(guide.style.pointerEvents).toBe('none');
      expect(guide.style.outline).toContain('var(--sniptale-color-text-inverse)');
      expect(guide.getAttribute('style')).toContain('border:2px');
    }
    expect(
      root.querySelector<HTMLElement>('[data-ui="content.toolbar.dock-zone.left"]')?.style.left
    ).toBe('10px');
  }
);
