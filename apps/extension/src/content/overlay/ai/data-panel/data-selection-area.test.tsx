// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';

const { previewMock } = vi.hoisted(() => ({
  previewMock: vi.fn((_props: unknown) => <div data-testid="selection-preview" />),
}));

vi.mock('./selection-preview', () => ({
  DataSelectionPreview: (props: unknown) => {
    previewMock(props);
    return <div data-testid="selection-preview" />;
  },
}));

import { DataSelectionArea } from './data-selection-area';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

const treeData = {
  context: 'Issue details',
  structure: [],
  title: 'AI picker',
} as unknown as ParsedDOMTree;

function createProps() {
  return {
    dataContainerRef: { current: null },
    getSummaryToneClass: () => 'tone-ok',
    handleDataResizeStart: vi.fn(),
    handleToggleSpoiler: vi.fn(),
    isAnyExpanded: false,
    isAnySelected: false,
    isDataResizing: false,
    isDataSpoilerOpen: true,
    isLoading: false,
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

describe('DataSelectionArea', () => {
  it('delegates the full data-selection contract to the canonical preview owner', async () => {
    const props = createProps();

    await renderNode(<DataSelectionArea {...props} />);

    expect(previewMock).toHaveBeenCalledWith(props);
  });
});
