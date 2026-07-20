// @vitest-environment jsdom

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  ProductGlassPresetItem,
  ProductGlassPresetList,
  ProductGlassPresetMeta,
  ProductGlassPresetName,
  ProductGlassPresetPreview,
} from './presets';

describe('ProductGlass presets', () => {
  it('renders canonical preset classes through the preset owner seam', () => {
    const markup = renderToStaticMarkup(
      <ProductGlassPresetList>
        <ProductGlassPresetItem active>
          <ProductGlassPresetPreview />
          <ProductGlassPresetName>Preset</ProductGlassPresetName>
          <ProductGlassPresetMeta>Meta</ProductGlassPresetMeta>
        </ProductGlassPresetItem>
      </ProductGlassPresetList>
    );

    expect(markup).toContain('sniptale-glass-preset-list');
    expect(markup).toContain('sniptale-glass-preset-item--active');
    expect(markup).toContain('sniptale-glass-preset-preview');
    expect(markup).toContain('sniptale-glass-preset-name');
    expect(markup).toContain('sniptale-glass-preset-meta');
  });
});
