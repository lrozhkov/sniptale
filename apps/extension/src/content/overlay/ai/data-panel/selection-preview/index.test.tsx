// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';

const { bodyMock, headerMock } = vi.hoisted(() => ({
  bodyMock: vi.fn((_props: unknown) => <div data-testid="body" />),
  headerMock: vi.fn((_props: unknown) => <div data-testid="header" />),
}));

vi.mock('./header', () => ({
  DataSelectionPreviewHeader: (props: unknown) => {
    headerMock(props);
    return <div data-testid="header" />;
  },
}));

vi.mock('./body', () => ({
  DataSelectionPreviewBody: (props: unknown) => {
    bodyMock(props);
    return <div data-testid="body" />;
  },
}));

import { DataSelectionPreview } from '.';

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
  bodyMock.mockClear();
  headerMock.mockClear();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
});

describe('DataSelectionPreview', () => {
  it('passes preview props to the header and open-state body owners', async () => {
    const props = createProps();

    await renderNode(<DataSelectionPreview {...props} />);

    expect(container?.querySelector('.sniptale-soft-divider')).toBeTruthy();
    expect(headerMock).toHaveBeenCalledWith({
      getSummaryToneClass: props.getSummaryToneClass,
      handleToggleSpoiler: props.handleToggleSpoiler,
      isAnyExpanded: props.isAnyExpanded,
      isAnySelected: props.isAnySelected,
      isDataSpoilerOpen: props.isDataSpoilerOpen,
      isLoading: props.isLoading,
      spoilerSummary: props.spoilerSummary,
      toggleExpandAll: props.toggleExpandAll,
      toggleSelectAll: props.toggleSelectAll,
    });
    expect(bodyMock).toHaveBeenCalledWith({
      dataContainerRef: props.dataContainerRef,
      handleDataResizeStart: props.handleDataResizeStart,
      isDataResizing: props.isDataResizing,
      treeData: props.treeData,
      treeRenderProps: props.treeRenderProps,
    });
  });

  it('skips body rendering when the spoiler is closed', async () => {
    const props = createProps();
    props.isDataSpoilerOpen = false;

    await renderNode(<DataSelectionPreview {...props} />);

    expect(headerMock).toHaveBeenCalledOnce();
    expect(bodyMock).not.toHaveBeenCalled();
    expect(container?.querySelector('.closed')).toBeTruthy();
  });
});
