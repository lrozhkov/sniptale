// @vitest-environment jsdom

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  ProductGlassChipIcon,
  ProductGlassColorOption,
  ProductGlassColorTrigger,
} from './primitives';

describe('ProductGlass primitives', () => {
  it('renders canonical class and state contracts for chip and color primitives', () => {
    const markup = renderToStaticMarkup(
      <>
        <ProductGlassChipIcon>Icon</ProductGlassChipIcon>
        <ProductGlassColorTrigger active disabled>
          Trigger
        </ProductGlassColorTrigger>
        <ProductGlassColorOption active aria-label="Accent swatch" />
      </>
    );

    expect(markup).toContain('sniptale-glass-chip-icon');
    expect(markup).toContain('sniptale-glass-color-trigger--active');
    expect(markup).toContain('sniptale-glass-color-trigger--disabled');
    expect(markup).toContain('aria-disabled="true"');
    expect(markup).toContain('sniptale-glass-color-option--active');
  });
});
