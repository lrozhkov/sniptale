// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SectionNode } from '@sniptale/runtime-contracts/dom-tree';
import type { TreeRenderProps } from '../tree/types';

const { fieldRowMock, getDefaultTreeNodeStateMock, tableSectionMock } = vi.hoisted(() => ({
  fieldRowMock: vi.fn((_props: unknown) => <div data-testid="field-row" />),
  getDefaultTreeNodeStateMock: vi.fn(),
  tableSectionMock: vi.fn((_props: unknown) => <div data-testid="table-section" />),
}));

vi.mock('../tree/helpers', () => ({
  getDefaultTreeNodeState: getDefaultTreeNodeStateMock,
}));

vi.mock('./field-row', () => ({
  FieldRow: (props: unknown) => {
    fieldRowMock(props);
    return <div data-testid="field-row" />;
  },
}));

vi.mock('./table', () => ({
  TableSection: (props: unknown) => {
    tableSectionMock(props);
    return <div data-testid="table-section" />;
  },
}));

import { TreeSectionChildren } from './section-children';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

const section = {
  children: [
    {
      id: 'field-1',
      label: 'Status',
      selected: true,
      type: 'field',
      value: 'Open',
      valueType: 'string',
    },
    {
      headers: ['Name'],
      id: 'table-1',
      rows: [],
      selected: true,
      type: 'table',
    },
  ],
  id: 'section-1',
  selected: true,
  title: 'Section',
  type: 'section',
} as unknown as SectionNode;

function createTreeRenderProps(): TreeRenderProps {
  return {
    excludedColumns: new Map(),
    toggleColumnExclusion: vi.fn(),
    toggleExpanded: vi.fn(),
    toggleSelected: vi.fn(),
    treeState: new Map(),
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
  fieldRowMock.mockClear();
  getDefaultTreeNodeStateMock.mockReset();
  tableSectionMock.mockClear();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
});

describe('TreeSectionChildren', () => {
  it('routes field and table children to canonical owners', async () => {
    const treeRenderProps = createTreeRenderProps();
    getDefaultTreeNodeStateMock.mockReturnValue({
      expanded: true,
      id: 'field-1',
      selected: true,
    });

    await renderNode(<TreeSectionChildren section={section} treeRenderProps={treeRenderProps} />);

    expect(getDefaultTreeNodeStateMock).toHaveBeenCalledWith('field-1', true, treeRenderProps);
    expect(fieldRowMock).toHaveBeenCalledWith({
      field: section.children[0],
      state: { expanded: true, id: 'field-1', selected: true },
      toggleSelected: treeRenderProps.toggleSelected,
    });
    expect(tableSectionMock).toHaveBeenCalledWith({
      table: section.children[1],
      treeRenderProps,
    });
  });
});
