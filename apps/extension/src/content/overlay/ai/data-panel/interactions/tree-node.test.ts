import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';

const { toggleSelectedNodesMock } = vi.hoisted(() => ({
  toggleSelectedNodesMock: vi.fn(),
}));

vi.mock('../tree/mutation', async () => {
  const actual = await vi.importActual<typeof import('../tree/mutation')>('../tree/mutation');

  return {
    ...actual,
    toggleSelectedNodes: toggleSelectedNodesMock,
  };
});

import {
  createToggleColumnExclusionHandler,
  createToggleExpandedHandler,
  createToggleSelectedHandler,
} from './tree-node';

beforeEach(() => {
  toggleSelectedNodesMock.mockReset();
});

function createTreeData() {
  return {
    structure: [
      {
        children: [{ id: 'field-1', type: 'field' }],
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

describe('node-scoped tree actions', () => {
  it('toggles the expanded flag for the requested node', () => {
    const setTreeState = vi.fn();

    createToggleExpandedHandler(setTreeState)('node-1');

    const next = applyUpdater(
      setTreeState,
      new Map([['node-1', { expanded: true, id: 'node-1', selected: false }]])
    );

    expect(next.get('node-1')?.expanded).toBe(false);
  });

  it('toggles selection and delegates subtree propagation to the helper', () => {
    const setTreeState = vi.fn();
    const treeData = createTreeData();

    createToggleSelectedHandler({ setTreeState, treeData })('field-1');

    const prev = new Map([['field-1', { expanded: true, id: 'field-1', selected: false }]]);
    const next = applyUpdater(setTreeState, prev);

    expect(next.get('field-1')?.selected).toBe(true);
    expect(toggleSelectedNodesMock).toHaveBeenCalledWith(next, treeData, 'field-1', true);
  });

  it('returns previous state when the node or tree data is missing', () => {
    const setTreeState = vi.fn();

    createToggleSelectedHandler({ setTreeState, treeData: null })('field-1');

    const prev = new Map([['field-1', { expanded: true, id: 'field-1', selected: false }]]);
    expect(applyUpdater(setTreeState, prev)).toBe(prev);
  });

  it('toggles excluded columns per table', () => {
    const setExcludedColumns = vi.fn();

    createToggleColumnExclusionHandler(setExcludedColumns)('table-1', 'Role');

    const excluded = applyUpdater(setExcludedColumns, new Map<string, string[]>());

    expect(excluded.get('table-1')).toEqual(['Role']);
  });
});
