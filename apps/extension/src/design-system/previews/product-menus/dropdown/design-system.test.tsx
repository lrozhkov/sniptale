// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildProductDropdownMenuPreviews } from './design-system';

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

describe('buildProductDropdownMenuPreviews', () => {
  it('builds the canonical dropdown menu preview set', () => {
    const previews = buildProductDropdownMenuPreviews('en');

    act(() => {
      root?.render(previews[0]!.preview);
    });

    expect(previews).toHaveLength(3);
    expect(previews[0]).toEqual(
      expect.objectContaining({
        componentId: 'product.ui.dropdown-menu',
        variantId: 'default',
        previewId: 'product.ui.dropdown-menu.default',
      })
    );
    expect(container?.textContent).toContain('Generate');
  });
});
