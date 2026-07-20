// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildContentToolbarSharedPreviews } from './design-system';

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

describe('buildContentToolbarSharedPreviews', () => {
  it('builds the canonical content toolbar previews', () => {
    const previews = buildContentToolbarSharedPreviews('en');

    act(() => {
      root?.render(previews[0]!.preview);
    });

    expect(previews).toHaveLength(8);
    expect(previews[0]).toEqual(
      expect.objectContaining({
        componentId: 'shared.ui.content-toolbar',
        variantId: 'shell',
        previewId: 'shared.ui.content-toolbar.shell',
      })
    );
    expect(container?.innerHTML).toContain('shared.ui.content-toolbar');
  });
});
