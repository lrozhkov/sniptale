// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TableRow } from '@sniptale/runtime-contracts/dom-tree';
import type { TreeRenderProps } from '../tree/types';

import { TableSectionRows } from './table-rows';
import {
  cleanupRenderedNode,
  enableReactActEnvironment,
  renderIntoTestContainer,
  type RenderedReactTestNode,
} from '../../test-support/react-root';

let rendered: RenderedReactTestNode | null = null;

const rows = [
  {
    data: {
      Name: 'Alice',
      Role: 'Owner',
    },
    id: 'row-1',
    selected: false,
    selector: '[data-row="1"]',
  },
] as TableRow[];

async function renderNode(node: React.ReactNode) {
  rendered = await renderIntoTestContainer(node);
}

enableReactActEnvironment();

afterEach(() => {
  cleanupRenderedNode(rendered);
  rendered = null;
});

function createTreeRenderProps(): TreeRenderProps {
  return {
    excludedColumns: new Map(),
    toggleColumnExclusion: vi.fn(),
    toggleExpanded: vi.fn(),
    toggleSelected: vi.fn(),
    treeState: new Map([
      [
        'row-1',
        {
          expanded: true,
          id: 'row-1',
          selected: true,
        },
      ],
    ]),
  };
}

describe('TableSectionRows', () => {
  it('renders selected row content, omits excluded columns, and delegates row toggle', async () => {
    const treeRenderProps = createTreeRenderProps();

    await renderNode(
      <div>
        <TableSectionRows
          headers={['Name', 'Role']}
          rows={rows}
          tableExcludedColumns={['Role']}
          toggleSelected={treeRenderProps.toggleSelected}
          treeRenderProps={treeRenderProps}
        />
      </div>
    );

    const row = rendered?.container.querySelector('.sniptale-tree-row');
    const checkbox = rendered?.container.querySelector('input');

    act(() => {
      checkbox?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(row?.className).toContain('sniptale-tree-row-field-selected');
    expect(rendered?.container.textContent).toContain('Name: Alice');
    expect(rendered?.container.textContent).not.toContain('Role: Owner');
    expect(treeRenderProps.toggleSelected).toHaveBeenCalledWith('row-1');
  });
});
