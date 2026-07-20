import type { TableNode } from '@sniptale/runtime-contracts/dom-tree';
import { getDefaultTreeNodeState } from '../tree/helpers';
import type { TreeRenderProps } from '../tree/types';
import { TableSectionControls } from './table-controls';
import { TableSectionRows } from './table-rows';

export function TableSection({
  table,
  treeRenderProps,
}: {
  table: TableNode;
  treeRenderProps: TreeRenderProps;
}) {
  const state = getDefaultTreeNodeState(table.id, false, treeRenderProps);
  const tableExcludedColumns = treeRenderProps.excludedColumns.get(table.id) || [];

  return (
    <div style={{ marginBottom: '8px' }}>
      <TableSectionControls
        expanded={state.expanded}
        table={table}
        tableExcludedColumns={tableExcludedColumns}
        toggleColumnExclusion={treeRenderProps.toggleColumnExclusion}
        toggleExpanded={treeRenderProps.toggleExpanded}
      />
      {state.expanded ? (
        <TableSectionRows
          headers={table.headers}
          rows={table.rows}
          tableExcludedColumns={tableExcludedColumns}
          toggleSelected={treeRenderProps.toggleSelected}
          treeRenderProps={treeRenderProps}
        />
      ) : null}
    </div>
  );
}
