import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const selectStylesheet = readFileSync(new URL('./select.css', import.meta.url), 'utf8');

describe('product-form-controls.select contract', () => {
  it.each([
    '.sniptale-compact-workspace .sniptale-select {',
    '.sniptale-select-menu.sniptale-compact-workspace {',
  ])('keeps ordinary compact values and options regular in %s', (selector) => {
    const start = selectStylesheet.indexOf(selector);
    expect(start).toBeGreaterThanOrEqual(0);
    const rule = selectStylesheet.slice(start, selectStylesheet.indexOf('}', start) + 1);
    expect(rule).toContain('font: 400 13px / 18px var(--sniptale-font-interface);');
  });

  it('lets portaled menus use the viewport instead of imposing the inline scroll cap', () => {
    const portalRule = selectStylesheet.slice(
      selectStylesheet.indexOf('.sniptale-select-menu-portal {'),
      selectStylesheet.indexOf('}', selectStylesheet.indexOf('.sniptale-select-menu-portal {')) + 1
    );

    expect(portalRule).toContain('position: fixed;');
    expect(portalRule).toContain('max-height: calc(100dvh - 16px);');
    expect(portalRule).not.toContain('max-height: 16rem;');
  });
});
