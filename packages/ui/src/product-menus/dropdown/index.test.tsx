import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  ProductDropdownItem,
  ProductDropdownMenu,
  ProductDropdownSectionLabel,
  ProductTemplateMenuShell,
} from './index';

describe('ProductDropdown menu ownership', () => {
  it('renders open menu shells with trigger metadata and menu styling', () => {
    const markup = renderToStaticMarkup(
      <ProductTemplateMenuShell
        label="Template"
        menuLabel="Open menu"
        open
        menuClassName="w-[12rem]"
        menuStyle={{ maxHeight: '10rem' }}
      >
        <ProductDropdownSectionLabel className="section">Actions</ProductDropdownSectionLabel>
        <ProductDropdownItem danger selected title="Delete item">
          Delete
        </ProductDropdownItem>
      </ProductTemplateMenuShell>
    );

    expect(markup).toContain('data-menu-btn="true"');
    expect(markup).toContain('aria-label="Open menu"');
    expect(markup).toContain('sniptale-template-dropdown');
    expect(markup).toContain('w-[12rem]');
    expect(markup).toContain('Delete item');
    expect(markup).toContain('sniptale-popover-item-selected');
  });
});

describe('ProductDropdown passive containers', () => {
  it('renders passive menu containers and closed template shells', () => {
    const markup = renderToStaticMarkup(
      <ProductDropdownMenu className="menu-shell">
        <ProductDropdownItem disabled>Disabled</ProductDropdownItem>
      </ProductDropdownMenu>
    );

    const closedShellMarkup = renderToStaticMarkup(
      <ProductTemplateMenuShell label={<span>Node label</span>} open={false}>
        <div>Hidden</div>
      </ProductTemplateMenuShell>
    );

    expect(markup).toContain('menu-shell');
    expect(markup).toContain('disabled=""');
    expect(closedShellMarkup).not.toContain('Hidden');
  });
});

describe('ProductDropdown contextual attributes', () => {
  it('forwards menu container attributes for contextual editor surfaces', () => {
    const markup = renderToStaticMarkup(
      <ProductDropdownMenu data-ui="layout-menu" role="menu" style={{ width: '18rem' }}>
        <ProductDropdownItem type="submit">Apply</ProductDropdownItem>
      </ProductDropdownMenu>
    );

    expect(markup).toContain('data-ui="layout-menu"');
    expect(markup).toContain('role="menu"');
    expect(markup).toContain('width:18rem');
    expect(markup).toContain('type="submit"');
  });
});
