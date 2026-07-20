// @vitest-environment jsdom

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TableNode } from '@sniptale/runtime-contracts/dom-tree';
import type { TreeRenderProps } from '../tree/types';

const { controlsMock, getDefaultTreeNodeStateMock, rowsMock } = vi.hoisted(() => ({
  controlsMock: vi.fn((_props: unknown) => <div data-testid="controls" />),
  getDefaultTreeNodeStateMock: vi.fn(),
  rowsMock: vi.fn((_props: unknown) => <div data-testid="rows" />),
}));

vi.mock('../tree/helpers', () => ({
  getDefaultTreeNodeState: getDefaultTreeNodeStateMock,
}));

vi.mock('./table-controls', () => ({
  TableSectionControls: (props: unknown) => {
    controlsMock(props);
    return <div data-testid="controls" />;
  },
}));

vi.mock('./table-rows', () => ({
  TableSectionRows: (props: unknown) => {
    rowsMock(props);
    return <div data-testid="rows" />;
  },
}));

import { TableSection } from './table';
import {
  cleanupRenderedNode,
  enableReactActEnvironment,
  renderIntoTestContainer,
  type RenderedReactTestNode,
} from '../../test-support/react-root';

let rendered: RenderedReactTestNode | null = null;

const table = {
  headers: ['Name', 'Role'],
  id: 'table-1',
  rows: [],
  selected: true,
  type: 'table',
} as unknown as TableNode;

function createTreeRenderProps(): TreeRenderProps {
  return {
    excludedColumns: new Map([['table-1', ['Role']]]),
    toggleColumnExclusion: vi.fn(),
    toggleExpanded: vi.fn(),
    toggleSelected: vi.fn(),
    treeState: new Map(),
  };
}

async function renderNode(node: React.ReactNode) {
  rendered = await renderIntoTestContainer(node);
}

enableReactActEnvironment();

beforeEach(() => {
  controlsMock.mockClear();
  getDefaultTreeNodeStateMock.mockReset();
  rowsMock.mockClear();
});

afterEach(() => {
  cleanupRenderedNode(rendered);
  rendered = null;
});

describe('TableSection', () => {
  it('passes expanded/excluded state to controls and renders rows only when expanded', async () => {
    const treeRenderProps = createTreeRenderProps();
    getDefaultTreeNodeStateMock.mockReturnValue({
      expanded: true,
      id: 'table-1',
      selected: true,
    });

    await renderNode(<TableSection table={table} treeRenderProps={treeRenderProps} />);

    expect(getDefaultTreeNodeStateMock).toHaveBeenCalledWith('table-1', false, treeRenderProps);
    expect(controlsMock).toHaveBeenCalledWith({
      expanded: true,
      table,
      tableExcludedColumns: ['Role'],
      toggleColumnExclusion: treeRenderProps.toggleColumnExclusion,
      toggleExpanded: treeRenderProps.toggleExpanded,
    });
    expect(rowsMock).toHaveBeenCalledWith({
      headers: table.headers,
      rows: table.rows,
      tableExcludedColumns: ['Role'],
      toggleSelected: treeRenderProps.toggleSelected,
      treeRenderProps,
    });
  });

  it('skips row rendering when the table section is collapsed', async () => {
    getDefaultTreeNodeStateMock.mockReturnValue({
      expanded: false,
      id: 'table-1',
      selected: true,
    });

    await renderNode(<TableSection table={table} treeRenderProps={createTreeRenderProps()} />);

    expect(controlsMock).toHaveBeenCalledOnce();
    expect(rowsMock).not.toHaveBeenCalled();
  });
});
