import { describe, expect, it } from 'vitest';

import { integrationTreeData } from '../../modal/shell/test-fixtures';
import {
  filterAIModalTreeData,
  filterAIModalTreeDataBySelection,
  getAIModalTreeNodeIds,
} from './filter';

describe('AI modal data filtering', () => {
  it('filters fields and table rows without mutating the source tree', () => {
    const filtered = filterAIModalTreeData(integrationTreeData, 'Alice Example');

    expect(filtered).not.toBe(integrationTreeData);
    expect(filtered.structure).toHaveLength(1);
    expect(getAIModalTreeNodeIds(filtered)).toContain('row-1');
    expect(getAIModalTreeNodeIds(integrationTreeData).length).toBeGreaterThan(
      getAIModalTreeNodeIds(filtered).length
    );
  });

  it('returns the original tree when the query is blank', () => {
    expect(filterAIModalTreeData(integrationTreeData, '   ')).toBe(integrationTreeData);
  });

  it('hides unselected leaves while retaining the hierarchy of selected rows', () => {
    const treeState = new Map([
      ['section-1', { selected: true }],
      ['field-1', { selected: false }],
      ['table-1', { selected: true }],
      ['row-1', { selected: false }],
      ['row-2', { selected: true }],
    ]);

    const filtered = filterAIModalTreeDataBySelection(integrationTreeData, treeState);

    expect(getAIModalTreeNodeIds(filtered)).toEqual(['section-1', 'table-1', 'row-2']);
    expect(getAIModalTreeNodeIds(integrationTreeData)).toContain('field-1');
  });
});
