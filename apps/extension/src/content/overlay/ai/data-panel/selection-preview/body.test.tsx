// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';

const { treeSectionMock } = vi.hoisted(() => ({
  treeSectionMock: vi.fn((_props: unknown) => <div data-testid="tree-section" />),
}));

vi.mock('../tree-view', () => ({
  TreeSection: (props: unknown) => {
    treeSectionMock(props);
    return <div data-testid="tree-section" />;
  },
}));

import { DataSelectionPreviewBody } from './body';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

const treeData = {
  context: 'Issue details',
  structure: [
    {
      children: [],
      id: 'section-1',
      selected: true,
      title: 'Section',
      type: 'section',
    },
  ],
  title: 'AI picker',
} as unknown as ParsedDOMTree;

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
  treeSectionMock.mockClear();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
});

describe('DataSelectionPreviewBody', () => {
  it('renders tree sections and delegates resize start', async () => {
    const handleDataResizeStart = vi.fn();
    const dataContainerRef = { current: null };
    const treeRenderProps = {
      excludedColumns: new Map(),
      toggleColumnExclusion: vi.fn(),
      toggleExpanded: vi.fn(),
      toggleSelected: vi.fn(),
      treeState: new Map(),
    };

    await renderNode(
      <DataSelectionPreviewBody
        dataContainerRef={dataContainerRef}
        handleDataResizeStart={handleDataResizeStart}
        isDataResizing={true}
        treeData={treeData}
        treeRenderProps={treeRenderProps}
      />
    );

    const resizer = container?.querySelector('.sniptale-resizer');

    act(() => {
      resizer?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });

    expect(container?.querySelector('.sniptale-data-container')).toBeTruthy();
    expect(resizer?.className).toContain('active');
    expect(treeSectionMock).toHaveBeenCalledWith({
      section: treeData.structure[0],
      treeRenderProps,
    });
    expect(handleDataResizeStart).toHaveBeenCalled();
  });
});
