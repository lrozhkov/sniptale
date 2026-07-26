// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import {
  createProductToolbarMenuDom,
  createProductToolbarMenuItemCopyDom,
  createProductToolbarMenuItemDom,
} from './dom';

describe('product toolbar menu DOM adapter', () => {
  it('creates the canonical capture surface and item contracts for non-React owners', () => {
    const { root, list } = createProductToolbarMenuDom({
      compact: true,
      title: 'After capture',
      variant: 'capture',
    });
    const item = createProductToolbarMenuItemDom({ dataUi: 'capture.copy', selected: true });
    item.appendChild(createProductToolbarMenuItemCopyDom('Copy', 'Copy image'));
    list.appendChild(item);

    expect(root.className).toContain('sniptale-toolbar-menu--compact');
    expect(root.className).toContain('sniptale-capture-menu');
    expect(root.querySelector('.sniptale-toolbar-menu-title')?.textContent).toBe('After capture');
    expect(item.className).toContain('sniptale-popover-item-selected');
    expect(item.dataset['ui']).toBe('capture.copy');
    expect(item.querySelector('.sniptale-toolbar-menu-item-label')?.textContent).toBe('Copy');
    expect(item.querySelector('.sniptale-toolbar-menu-item-hint')?.textContent).toBe('Copy image');
  });

  it('omits optional title, hint, selection, and data attributes for a default menu', () => {
    const { root, list } = createProductToolbarMenuDom({});
    const item = createProductToolbarMenuItemDom();
    item.appendChild(createProductToolbarMenuItemCopyDom('Download'));
    list.appendChild(item);

    expect(root.querySelector('.sniptale-toolbar-menu-title')).toBeNull();
    expect(root.className).not.toContain('sniptale-toolbar-menu--compact');
    expect(root.className).not.toContain('sniptale-capture-menu');
    expect(item.className).not.toContain('sniptale-popover-item-selected');
    expect(item.dataset['ui']).toBeUndefined();
    expect(item.querySelector('.sniptale-toolbar-menu-item-hint')).toBeNull();
  });
});
