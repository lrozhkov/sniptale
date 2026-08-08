import { describe, expect, it, vi } from 'vitest';
import type { ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';

import { createToggleExpandAllHandler, createToggleSelectAllHandler } from './tree-bulk';

function createTreeData() {
  return {
    structure: [
      {
        children: [
          { id: 'field-1', type: 'field' },
          {
            id: 'table-1',
            rows: [{ id: 'row-1' }],
            type: 'table',
          },
        ],
        id: 'section-1',
      },
    ],
  } as unknown as ParsedDOMTree;
}

function applyUpdater<T>(mock: ReturnType<typeof vi.fn>, prev: T) {
  const updater = mock.mock.calls[0]?.[0] as ((value: T) => T) | undefined;

  if (!updater) {
    throw new Error('Expected updater callback');
  }

  return updater(prev);
}

describe('bulk tree selection actions', () => {
  it('toggles all node selection and clears exclusions only when selecting all', () => {
    const setTreeState = vi.fn();
    const setExcludedColumns = vi.fn();

    createToggleSelectAllHandler({
      isAnySelected: false,
      setExcludedColumns,
      setTreeState,
      treeData: createTreeData(),
    })();

    const next = applyUpdater(
      setTreeState,
      new Map([
        ['section-1', { expanded: true, id: 'section-1', selected: false }],
        ['field-1', { expanded: true, id: 'field-1', selected: false }],
        ['table-1', { expanded: true, id: 'table-1', selected: false }],
        ['row-1', { expanded: true, id: 'row-1', selected: false }],
      ])
    );

    expect([...next.values()].every((node) => node.selected)).toBe(true);
    expect(setExcludedColumns).toHaveBeenCalledWith(new Map());
  });

  it('returns early when tree data is missing', () => {
    const setExcludedColumns = vi.fn();
    const setTreeState = vi.fn();

    createToggleSelectAllHandler({
      isAnySelected: false,
      setExcludedColumns,
      setTreeState,
      treeData: null,
    })();

    expect(setTreeState).not.toHaveBeenCalled();
    expect(setExcludedColumns).not.toHaveBeenCalled();
  });

  it('selects only the filtered scope and preserves hidden node selection', () => {
    const setTreeState = vi.fn();
    const handler = createToggleSelectAllHandler({
      isAnySelected: true,
      setExcludedColumns: vi.fn(),
      setTreeState,
      treeData: createTreeData(),
    });
    const originalTree = createTreeData();
    const originalSection = originalTree.structure[0];
    if (!originalSection) throw new Error('Expected fixture section');
    const filteredScope: ParsedDOMTree = {
      ...originalTree,
      structure: [{ ...originalSection, children: originalSection.children.slice(0, 1) }],
    };

    handler(filteredScope);
    const next = applyUpdater(
      setTreeState,
      new Map([
        ['section-1', { expanded: true, id: 'section-1', selected: false }],
        ['field-1', { expanded: true, id: 'field-1', selected: false }],
        ['row-1', { expanded: true, id: 'row-1', selected: true }],
      ])
    );

    expect(next.get('section-1')?.selected).toBe(true);
    expect(next.get('field-1')?.selected).toBe(true);
    expect(next.get('row-1')?.selected).toBe(true);
  });
});

describe('bulk tree expansion actions', () => {
  it('toggles all node expansion', () => {
    const setTreeState = vi.fn();

    createToggleExpandAllHandler({
      isAnyExpanded: true,
      setTreeState,
    })();

    const expanded = applyUpdater(
      setTreeState,
      new Map([
        ['node-1', { expanded: true, id: 'node-1', selected: false }],
        ['node-2', { expanded: false, id: 'node-2', selected: false }],
      ])
    );

    expect([...expanded.values()].every((node) => node.expanded === false)).toBe(true);
  });
});
