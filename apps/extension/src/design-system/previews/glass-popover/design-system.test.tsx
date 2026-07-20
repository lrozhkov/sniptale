// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildGlassPopoverSharedPreviews } from './design-system';

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

describe('buildGlassPopoverSharedPreviews', () => {
  it('builds the canonical glass popover preview set', () => {
    const previews = buildGlassPopoverSharedPreviews('en');

    act(() => {
      root?.render(previews[0]!.preview);
    });

    expect(previews).toHaveLength(4);
    expect(previews[0]).toEqual(
      expect.objectContaining({
        componentId: 'shared.ui.glass-popover',
        variantId: 'default',
        previewId: 'shared.ui.glass-popover.default',
      })
    );
    expect(container?.textContent).toContain('Quick settings');
  });
});
