// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';

const { dataAreaMock, jsonAreaMock } = vi.hoisted(() => ({
  dataAreaMock: vi.fn((_props: unknown) => <div data-testid="data-area" />),
  jsonAreaMock: vi.fn((_props: unknown) => <div data-testid="json-area" />),
}));

vi.mock('./data-selection-area', () => ({
  DataSelectionArea: (props: unknown) => {
    dataAreaMock(props);
    return <div data-testid="data-area" />;
  },
}));

vi.mock('./json-preview-area', () => ({
  JsonPreviewArea: (props: unknown) => {
    jsonAreaMock(props);
    return <div data-testid="json-area" />;
  },
}));

import { AIModalDataPanelContent } from './content';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

const treeData = {
  context: 'Issue details',
  structure: [],
  title: 'AI picker',
} as unknown as ParsedDOMTree;

function createProps() {
  return {
    copied: false,
    copyFormattedJson: vi.fn(),
    dataContainerRef: { current: null },
    formattedJSON: '{"ok":true}',
    getSummaryToneClass: () => 'tone-ok',
    handleDataResizeStart: vi.fn(),
    handleJsonResizeStart: vi.fn(),
    handleToggleSpoiler: vi.fn(),
    isAnyExpanded: false,
    isAnySelected: false,
    isDataResizing: false,
    isDataSpoilerOpen: true,
    isJsonResizing: false,
    isLoading: false,
    jsonPreviewRef: { current: null },
    setShowDataPreview: vi.fn(),
    showDataPreview: true,
    spoilerSummary: 'summary',
    toggleExpandAll: vi.fn(),
    toggleSelectAll: vi.fn(),
    treeData,
    treeRenderProps: {
      excludedColumns: new Map(),
      toggleColumnExclusion: vi.fn(),
      toggleExpanded: vi.fn(),
      toggleSelected: vi.fn(),
      treeState: new Map(),
    },
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
  dataAreaMock.mockClear();
  jsonAreaMock.mockClear();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
});

describe('AIModalDataPanelContent', () => {
  it('passes the full content contract to both area owners', async () => {
    const props = createProps();

    await renderNode(<AIModalDataPanelContent {...props} />);

    expect(dataAreaMock).toHaveBeenCalledWith(props);
    expect(jsonAreaMock).toHaveBeenCalledWith(props);
  });
});
