// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { renderHighlightedJSONMock } = vi.hoisted(() => ({
  renderHighlightedJSONMock: vi.fn((value: string) => [`rendered:${value}`]),
}));

vi.mock('../json/render', () => ({
  renderHighlightedJSON: renderHighlightedJSONMock,
}));

import { JsonPreviewBody } from './body';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

async function renderNode(node: React.ReactNode) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  await act(async () => {
    root?.render(node);
  });
}

beforeAll(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  renderHighlightedJSONMock.mockClear();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
});

describe('JsonPreviewBody', () => {
  it('renders highlighted json and delegates resize start', async () => {
    const handleJsonResizeStart = vi.fn();
    const jsonPreviewRef = { current: null };

    await renderNode(
      <JsonPreviewBody
        formattedJSON={'{"ok":true}'}
        handleJsonResizeStart={handleJsonResizeStart}
        isJsonResizing={true}
        jsonPreviewRef={jsonPreviewRef}
      />
    );

    const resizer = container?.querySelector('.sniptale-resizer');

    act(() => {
      resizer?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });

    expect(renderHighlightedJSONMock).toHaveBeenCalledWith('{"ok":true}');
    expect(container?.querySelector('.sniptale-json-preview')?.textContent).toContain(
      'rendered:{"ok":true}'
    );
    expect(resizer?.className).toContain('active');
    expect(handleJsonResizeStart).toHaveBeenCalled();
  });
});
