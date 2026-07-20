import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  ProductGlassToolbar,
  ProductGlassToolbarButton,
  ProductGlassToolbarDivider,
} from '@sniptale/ui/product-glass-toolbar';

describe('ProductGlassToolbar', () => {
  it('renders active and danger toolbar button states', () => {
    const markup = renderToStaticMarkup(
      <ProductGlassToolbar className="custom-toolbar">
        <ProductGlassToolbarButton active menuIndicator title="Bold">
          B
        </ProductGlassToolbarButton>
        <ProductGlassToolbarDivider />
        <ProductGlassToolbarButton danger title="Delete">
          X
        </ProductGlassToolbarButton>
      </ProductGlassToolbar>
    );

    expect(markup).toContain('sniptale-glass-toolbar custom-toolbar');
    expect(markup).toContain('sniptale-glass-toolbar-button sniptale-glass-toolbar-button--active');
    expect(markup).toContain('data-menu-indicator="true"');
    expect(markup).toContain('sniptale-glass-toolbar-button sniptale-glass-toolbar-button--danger');
    expect(markup).toContain('sniptale-glass-toolbar-divider');
  });
});
