// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ProductGlassColorField, ProductGlassColorPalette } from './color';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

describe('ProductGlassColor controls', () => {
  it('renders palette state classes and active swatches', () => {
    const markup = renderToStaticMarkup(
      <ProductGlassColorPalette colors={['#ff0000', '#00ff00']} value="#00FF00" disabled />
    );

    expect(markup).toContain('sniptale-glass-color-palette--disabled');
    expect(markup).toContain('title="#00ff00"');
  });

  it('renders the supplied shared picker trigger and forwards preset selection', () => {
    const onPresetSelect = vi.fn();

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root?.render(
        <ProductGlassColorField
          label="Accent"
          value="#111111"
          colors={['#111111', '#222222']}
          onPresetSelect={onPresetSelect}
          pickerTrigger={<button data-testid="picker-trigger">Picker</button>}
        />
      );
    });

    const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>('button'));

    act(() => {
      buttons.at(-1)?.click();
    });

    expect(container.querySelector('[data-testid="picker-trigger"]')).not.toBeNull();
    expect(container.querySelector('input[type="color"]')).toBeNull();
    expect(onPresetSelect).toHaveBeenCalledWith('#222222');
  });
});
