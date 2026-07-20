import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ProductSelectMenuOption } from './select-menu-option';

describe('ProductSelectMenuOption', () => {
  it('renders the menu-specific label wrapper and selected check state', () => {
    const markup = renderToStaticMarkup(
      <ProductSelectMenuOption
        className="option"
        isSelected
        label="Very long preset name"
        icon={<span data-testid="preview">preview</span>}
        onSelect={() => undefined}
      />
    );

    expect(markup).toContain('sniptale-select-value-label sniptale-select-value-label-menu');
    expect(markup).toContain('aria-selected="true"');
    expect(markup).toContain('data-testid="preview"');
  });
});
