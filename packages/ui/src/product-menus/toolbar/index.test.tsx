import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  ProductToolbarMenu,
  ProductToolbarMenuBadge,
  ProductToolbarMenuDivider,
  ProductToolbarMenuDetail,
  ProductToolbarMenuGroupCopy,
  ProductToolbarMenuGroupLabel,
  ProductToolbarMenuItem,
  ProductToolbarMenuItemCopy,
  ProductToolbarMenuItemMeta,
} from './index';

describe('ProductToolbarMenu', () => {
  it('renders placement, compact, selected, and disabled menu states', () => {
    const markup = renderToStaticMarkup(
      <ProductToolbarMenu title="Viewport" variant="viewport" compact placement="up">
        <ProductToolbarMenuGroupLabel>
          <ProductToolbarMenuGroupCopy label="Page viewport" hint="Choose a size" />
        </ProductToolbarMenuGroupLabel>
        <ProductToolbarMenuItem selected>
          <ProductToolbarMenuItemCopy label="Desktop" hint="1280×720" showHintInCompact />
          <ProductToolbarMenuItemMeta>Current</ProductToolbarMenuItemMeta>
          <ProductToolbarMenuBadge>Active</ProductToolbarMenuBadge>
        </ProductToolbarMenuItem>
        <ProductToolbarMenuDetail id="viewport-detail">Viewport detail</ProductToolbarMenuDetail>
        <ProductToolbarMenuDivider />
        <ProductToolbarMenuItem ariaDisabled ariaDescribedBy="reason">
          Disabled row
        </ProductToolbarMenuItem>
      </ProductToolbarMenu>
    );

    expect(markup).toContain(
      [
        'sniptale-popover-menu sniptale-toolbar-menu sniptale-toolbar-menu--compact',
        'sniptale-popover-up sniptale-viewport-menu',
      ].join(' ')
    );
    expect(markup).toContain('sniptale-toolbar-menu-title');
    expect(markup).toContain('Page viewport');
    expect(markup).toContain('Choose a size');
    expect(markup).toContain('sniptale-toolbar-menu-item-meta');
    expect(markup).toContain('viewport-detail');
    expect(markup).toContain('sniptale-toolbar-menu-list');
    expect(markup).toContain(
      'sniptale-popover-item sniptale-toolbar-menu-item sniptale-popover-item-selected'
    );
    expect(markup).toContain('sniptale-toolbar-menu-item-badge');
    expect(markup).toContain('sniptale-toolbar-menu-item-hint--show-compact');
    expect(markup).toContain('sniptale-popover-divider');
    expect(markup).toContain('opacity-50 cursor-not-allowed');
    expect(markup).toContain('aria-disabled="true"');
    expect(markup).toContain('aria-describedby="reason"');
    expect(markup).not.toContain('disabled=""');
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

  it('renders a compact group label without an empty hint row', () => {
    const markup = renderToStaticMarkup(
      <ProductToolbarMenuGroupLabel>
        <ProductToolbarMenuGroupCopy label="Browser window" />
      </ProductToolbarMenuGroupLabel>
    );

    expect(markup).toContain('Browser window');
    expect(markup).not.toContain('sniptale-toolbar-menu-group-hint');
  });
});
