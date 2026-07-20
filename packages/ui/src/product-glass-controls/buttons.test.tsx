// @vitest-environment jsdom

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  ProductGlassBoldButton,
  ProductGlassChip,
  ProductGlassDestructiveButton,
  ProductGlassIconButton,
  ProductGlassInput,
  ProductGlassMiniButton,
  ProductGlassRange,
  ProductGlassRangeMeta,
  ProductGlassSwitch,
} from './buttons';

describe('ProductGlass buttons', () => {
  it('renders canonical state classes for the shared button primitives', () => {
    const markup = renderToStaticMarkup(
      <>
        <ProductGlassIconButton active aria-label="icon" />
        <ProductGlassChip active stacked>
          Chip
        </ProductGlassChip>
        <ProductGlassMiniButton active>Mini</ProductGlassMiniButton>
        <ProductGlassSwitch on aria-label="switch" />
        <ProductGlassRange defaultValue={12} />
        <ProductGlassRangeMeta>Meta</ProductGlassRangeMeta>
        <ProductGlassInput value="value" readOnly />
        <ProductGlassBoldButton active>Bold</ProductGlassBoldButton>
        <ProductGlassDestructiveButton>Delete</ProductGlassDestructiveButton>
      </>
    );

    expect(markup).toContain('sniptale-glass-icon-button--active');
    expect(markup).toContain('sniptale-glass-chip--stacked');
    expect(markup).toContain('sniptale-glass-chip--active');
    expect(markup).toContain('sniptale-glass-mini-button--active');
    expect(markup).toContain('sniptale-glass-switch--on');
    expect(markup).toContain('sniptale-glass-range');
    expect(markup).toContain('sniptale-glass-range-meta');
    expect(markup).toContain('sniptale-glass-input');
    expect(markup).toContain('sniptale-glass-bold-button--active');
    expect(markup).toContain('sniptale-glass-destructive');
  });

  it('renders glass range fill ratio from min, max, and value', () => {
    const markup = renderToStaticMarkup(
      <ProductGlassRange min={1} max={25} value={20} readOnly style={{ width: '90%' }} />
    );

    expect(markup).toContain('--sniptale-range-fill-ratio:79.2%');
    expect(markup).toContain('width:90%');
  });
});
