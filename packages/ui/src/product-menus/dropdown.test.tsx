import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  ProductDropdownDivider,
  ProductDropdownItem,
  ProductDropdownMenu,
  ProductTemplateMenuShell,
} from './dropdown/index';

describe('ProductDropdownMenu', () => {
  it('renders default, danger, and template shell states', () => {
    const markup = renderToStaticMarkup(
      <>
        <ProductDropdownMenu className="custom-menu">
          <ProductDropdownItem selected>Primary</ProductDropdownItem>
          <ProductDropdownDivider />
          <ProductDropdownItem danger disabled>
            Delete
          </ProductDropdownItem>
        </ProductDropdownMenu>
        <ProductTemplateMenuShell label="Template" menuLabel="Edit" open menuClassName="menu-layer">
          <ProductDropdownItem>Rename</ProductDropdownItem>
        </ProductTemplateMenuShell>
      </>
    );

    expect(markup).toContain('sniptale-dropdown-menu custom-menu');
    expect(markup).toContain('sniptale-dropdown-item sniptale-popover-item-selected');
    expect(markup).toContain('sniptale-dropdown-item danger');
    expect(markup).toContain('sniptale-dropdown-divider');
    expect(markup).toContain('sniptale-template-pill menu-open');
    expect(markup).toContain('sniptale-template-menu-btn menu-open');
    expect(markup).toContain('sniptale-template-dropdown menu-layer');
  });
});
