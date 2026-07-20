// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildEditorChromeSharedPreviews } from './design-system';

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

describe('buildEditorChromeSharedPreviews', () => {
  it('builds the canonical editor chrome preview set', () => {
    const previews = buildEditorChromeSharedPreviews('en');

    act(() => {
      root?.render(previews[0]!.preview);
    });

    expect(previews).toHaveLength(3);
    expect(previews[0]).toEqual(
      expect.objectContaining({
        componentId: 'shared.ui.editor-chrome',
        variantId: 'icon-button',
        previewId: 'shared.ui.editor-chrome.icon-button',
      })
    );
    expect(container?.textContent).toContain('Back');
  });
});
