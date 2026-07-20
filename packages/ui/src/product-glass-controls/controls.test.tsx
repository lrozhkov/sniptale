// @vitest-environment jsdom

import { act } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ProductGlassChip,
  ProductGlassColorField,
  ProductGlassColorPalette,
  ProductGlassDimMarker,
  ProductGlassIconButton,
  ProductGlassOptionGrid,
  ProductGlassRange,
  ProductGlassRangeMeta,
  ProductGlassRow,
  ProductGlassSwitch,
  ProductGlassToggleRow,
} from './controls';

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
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('ProductGlassControls', () => {
  it('renders primitive state classes and layout contracts through the shared facade', () => {
    const markup = renderToStaticMarkup(
      <>
        <ProductGlassRow spread>
          <ProductGlassChip active stacked>
            Active
          </ProductGlassChip>
          <ProductGlassIconButton active aria-label="icon" />
          <ProductGlassSwitch on aria-label="switch" />
          <ProductGlassRange defaultValue={50} />
          <ProductGlassRangeMeta>
            <span>Low</span>
            <span>High</span>
          </ProductGlassRangeMeta>
        </ProductGlassRow>
        <ProductGlassOptionGrid>
          <ProductGlassDimMarker>A</ProductGlassDimMarker>
        </ProductGlassOptionGrid>
      </>
    );

    expect(markup).toContain('sniptale-glass-row--spread');
    expect(markup).toContain('sniptale-glass-chip--stacked');
    expect(markup).toContain('sniptale-glass-chip--active');
    expect(markup).toContain('sniptale-glass-icon-button--active');
    expect(markup).toContain('sniptale-glass-switch--on');
    expect(markup).toContain('sniptale-glass-range');
    expect(markup).toContain('sniptale-glass-range-meta');
    expect(markup).toContain('sniptale-glass-option-grid');
    expect(markup).toContain('sniptale-glass-dim');
  });

  it('wires color field changes, palette selection, and toggle-row copy', verifyColorFieldBehavior);
});

function renderInteractiveHarness() {
  const onValueChange = vi.fn();
  const onPresetSelect = vi.fn();
  const onPaletteSelect = vi.fn();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root?.render(
      <>
        <ProductGlassColorField
          label="Accent"
          value="#0080ff"
          colors={['#0080ff', '#22c55e']}
          onValueChange={onValueChange}
          onPresetSelect={onPresetSelect}
          inputProps={{ 'aria-label': 'Accent picker' }}
        />
        <ProductGlassColorPalette
          colors={['#0080ff', '#22c55e']}
          value="#0080ff"
          onSelect={onPaletteSelect}
        />
        <ProductGlassToggleRow
          title="Auto mode"
          hint="Enabled by default"
          control={<button type="button">Toggle</button>}
        />
      </>
    );
  });

  return { onPaletteSelect, onPresetSelect, onValueChange };
}

function triggerColorInteractions() {
  const colorInput = container?.querySelector<HTMLInputElement>('input[type="color"]');
  const paletteButtons = container?.querySelectorAll<HTMLButtonElement>(
    '.sniptale-glass-color-option'
  );

  if (!colorInput || !paletteButtons) {
    throw new Error('Expected glass color controls');
  }

  act(() => {
    setNativeInputValue(colorInput, '#22c55e');
    colorInput.dispatchEvent(new Event('input', { bubbles: true }));
    colorInput.dispatchEvent(new Event('change', { bubbles: true }));
    paletteButtons[1]?.click();
    paletteButtons[3]?.click();
  });
}

function setNativeInputValue(input: HTMLInputElement, value: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;

  if (!valueSetter) {
    throw new Error('Expected HTMLInputElement value setter');
  }

  valueSetter.call(input, value);
}

function verifyColorFieldBehavior() {
  const { onPaletteSelect, onPresetSelect, onValueChange } = renderInteractiveHarness();

  triggerColorInteractions();

  expect(onValueChange).toHaveBeenCalledWith('#22c55e');
  expect(onPresetSelect).toHaveBeenCalledWith('#22c55e');
  expect(onPaletteSelect).toHaveBeenCalledWith('#22c55e');
  expect(container?.textContent).toContain('Auto mode');
  expect(container?.textContent).toContain('Enabled by default');
}
