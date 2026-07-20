// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildProductToastPreviews } from './design-system';

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

describe('buildProductToastPreviews', () => {
  it('builds the canonical toast preview set', () => {
    const previews = buildProductToastPreviews('en');

    act(() => {
      root?.render(previews[0]!.preview);
    });

    expect(previews).toHaveLength(3);
    expect(previews[0]).toEqual(
      expect.objectContaining({
        componentId: 'product.ui.toast',
        variantId: 'success',
        previewId: 'product.ui.toast.success',
      })
    );
    expect(container?.textContent).toContain('Done');
  });
});
