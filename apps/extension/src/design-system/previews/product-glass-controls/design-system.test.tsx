// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildProductGlassControlsPreviews } from './design-system';

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

describe('buildProductGlassControlsPreviews', () => {
  it('builds the canonical glass controls preview set', () => {
    const previews = buildProductGlassControlsPreviews('en');

    act(() => {
      root?.render(previews[0]!.preview);
    });

    expect(previews).toHaveLength(14);
    expect(previews[0]).toEqual(
      expect.objectContaining({
        componentId: 'product.ui.glass-controls',
        variantId: 'chip',
        previewId: 'product.ui.glass-controls.chip',
      })
    );
    expect(container?.textContent).toContain('Active');
  });
});
