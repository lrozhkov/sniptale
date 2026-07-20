// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildProductFormControlsPreviews } from './design-system';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
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

describe('buildProductFormControlsPreviews', () => {
  it('builds the canonical product form controls preview set', () => {
    const previews = buildProductFormControlsPreviews('en');

    act(() => {
      root?.render(previews[0]!.preview);
    });

    const input = container?.querySelector<HTMLInputElement>('input');

    expect(previews).toHaveLength(7);
    expect(previews[0]).toEqual(
      expect.objectContaining({
        componentId: 'product.ui.form-controls',
        variantId: 'input',
        previewId: 'product.ui.form-controls.input',
      })
    );
    expect(input?.value).toBeTruthy();
  });
});
