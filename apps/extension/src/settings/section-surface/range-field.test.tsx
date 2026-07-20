// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { productRangePropsSpy } = vi.hoisted(() => ({
  productRangePropsSpy: vi.fn(),
}));

vi.mock('@sniptale/ui/product-form-controls', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-form-controls')>()),
  ProductRange: (props: React.InputHTMLAttributes<HTMLInputElement>) => {
    productRangePropsSpy(props);
    return <input type="range" data-testid="product-range" {...props} />;
  },
}));

import { SettingsRangeField } from './range-field';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderElement(element: React.ReactElement) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(element);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  productRangePropsSpy.mockReset();
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

describe('SettingsRangeField', () => {
  it('renders label, value, optional aside/hint, and forwards range props', () => {
    renderElement(
      <SettingsRangeField
        min="1"
        max="100"
        value={72}
        onChange={() => undefined}
        label="Quality"
        displayValue={72}
        displaySuffix="%"
        aside={<span>Auto</span>}
        hint="Balanced output"
      />
    );

    expect(container?.textContent).toContain('Quality');
    expect(container?.textContent).toContain('72');
    expect(container?.textContent).toContain('%');
    expect(container?.textContent).toContain('Auto');
    expect(container?.textContent).toContain('Balanced output');
    expect(productRangePropsSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        min: '1',
        max: '100',
        value: 72,
      })
    );
  });
});
