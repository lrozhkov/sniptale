// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildProductConfirmDialogPreviews } from './design-system';

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

describe('buildProductConfirmDialogPreviews', () => {
  it('builds the canonical confirm dialog preview set', () => {
    const previews = buildProductConfirmDialogPreviews('en');

    act(() => {
      root?.render(previews[0]!.preview);
    });

    expect(previews).toHaveLength(2);
    expect(previews[0]).toEqual(
      expect.objectContaining({
        componentId: 'product.ui.confirm-dialog',
        variantId: 'default',
        previewId: 'product.ui.confirm-dialog.default',
      })
    );
    expect(container?.textContent).toContain('Delete');
  });
});
