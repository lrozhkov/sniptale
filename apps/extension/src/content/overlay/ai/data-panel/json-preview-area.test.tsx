// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { previewMock } = vi.hoisted(() => ({
  previewMock: vi.fn((_props: unknown) => <div data-testid="json-preview" />),
}));

vi.mock('./json-preview', () => ({
  JsonPreview: (props: unknown) => {
    previewMock(props);
    return <div data-testid="json-preview" />;
  },
}));

import { JsonPreviewArea } from './json-preview-area';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createProps() {
  return {
    copied: false,
    copyFormattedJson: vi.fn(),
    formattedJSON: '{"ok":true}',
    handleJsonResizeStart: vi.fn(),
    isJsonResizing: false,
    isLoading: false,
    jsonPreviewRef: { current: null },
    setShowDataPreview: vi.fn(),
    showDataPreview: true,
  };
}

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
  previewMock.mockClear();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
});

describe('JsonPreviewArea', () => {
  it('delegates the full json-preview contract to the canonical preview owner', async () => {
    const props = createProps();

    await renderNode(<JsonPreviewArea {...props} />);

    expect(previewMock).toHaveBeenCalledWith(props);
  });
});
