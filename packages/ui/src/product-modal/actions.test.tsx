import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ProductActionButton } from './actions';

describe('ProductActionButton', () => {
  it('renders primary buttons through the shared matte button family', () => {
    const markup = renderToStaticMarkup(<ProductActionButton compact>Save</ProductActionButton>);

    expect(markup).toContain('rounded-[12px]');
    expect(markup).toContain('h-10 min-h-10');
    expect(markup).toContain('border-none');
    expect(markup).toContain('var(--sniptale-color-accent-emphasis)');
    expect(markup).toContain('type="button"');
  });

  it('renders secondary, danger, and toggle buttons without dropping custom classes', () => {
    const markup = renderToStaticMarkup(
      <>
        <ProductActionButton tone="secondary">Cancel</ProductActionButton>
        <ProductActionButton tone="danger">Delete</ProductActionButton>
        <ProductActionButton tone="toggle" active className="custom-action">
          Grid
        </ProductActionButton>
      </>
    );

    expect(markup).toContain('var(--sniptale-color-surface-hover)_74%');
    expect(markup).toContain('var(--sniptale-color-danger-soft)_34%');
    expect(markup).toContain('h-10 min-h-10');
    expect(markup).toContain('bg-transparent');
    expect(markup).toContain('var(--sniptale-color-surface-hover)_82%');
    expect(markup).toContain('custom-action');
  });
});
