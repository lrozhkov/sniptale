// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildContentSizeTooltipSharedPreviews } from './design-system';

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

describe('buildContentSizeTooltipSharedPreviews', () => {
  it('builds the canonical floating preview with tooltip copy and dark portal theme', () => {
    const previews = buildContentSizeTooltipSharedPreviews('en');

    act(() => {
      root?.render(previews[0]!.preview);
    });

    expect(previews).toHaveLength(1);
    expect(previews[0]).toEqual(
      expect.objectContaining({
        componentId: 'shared.ui.content-size-tooltip',
        previewId: 'shared.ui.content-size-tooltip.floating',
        variantId: 'floating',
      })
    );
    expect(container?.querySelector('[data-ui="design-system.preview-frame"]')).not.toBeNull();
    expect(
      container?.querySelector('.sniptale-content-size-tooltip')?.getAttribute('data-theme')
    ).toBe('dark');
    expect(container?.textContent).toContain('Apply');
  });
});
