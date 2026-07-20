import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  ProductToolbarMenu,
  ProductToolbarMenuBadge,
  ProductToolbarMenuDivider,
  ProductToolbarMenuItem,
  ProductToolbarMenuItemCopy,
} from './index';

describe('ProductToolbarMenu', () => {
  it('renders placement, compact, selected, and disabled menu states', () => {
    const markup = renderToStaticMarkup(
      <ProductToolbarMenu title="Viewport" variant="viewport" compact placement="up">
        <ProductToolbarMenuItem selected>
          <ProductToolbarMenuItemCopy label="Desktop" hint="1280×720" />
          <ProductToolbarMenuBadge>Active</ProductToolbarMenuBadge>
        </ProductToolbarMenuItem>
        <ProductToolbarMenuDivider />
        <ProductToolbarMenuItem disabled>Disabled row</ProductToolbarMenuItem>
      </ProductToolbarMenu>
    );

    expect(markup).toContain(
      [
        'sniptale-popover-menu sniptale-toolbar-menu sniptale-toolbar-menu--compact',
        'sniptale-popover-up sniptale-viewport-menu',
      ].join(' ')
    );
    expect(markup).toContain('sniptale-toolbar-menu-title');
    expect(markup).toContain('sniptale-toolbar-menu-list');
    expect(markup).toContain(
      'sniptale-popover-item sniptale-toolbar-menu-item sniptale-popover-item-selected'
    );
    expect(markup).toContain('sniptale-toolbar-menu-item-badge');
    expect(markup).toContain('sniptale-popover-divider');
    expect(markup).toContain('opacity-50 cursor-not-allowed');
  });

  it('renders the side-placement class for vertical toolbar menus', () => {
    const markup = renderToStaticMarkup(
      <ProductToolbarMenu title="Capture" variant="capture" placement="side">
        <ProductToolbarMenuItem>Capture</ProductToolbarMenuItem>
      </ProductToolbarMenu>
    );

    expect(markup).toContain(
      'sniptale-popover-menu sniptale-toolbar-menu sniptale-popover-side sniptale-capture-menu'
    );
    expect(markup).not.toContain('sniptale-popover-up');
  });
});
