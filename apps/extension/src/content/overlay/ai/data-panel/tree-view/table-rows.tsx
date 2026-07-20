import type { TableNode, TableRow } from '@sniptale/runtime-contracts/dom-tree';
import { getDefaultTreeNodeState } from '../tree/helpers';
import type { TreeRenderProps } from '../tree/types';
import type { TreeNodeState } from '../types';

type TableSectionRowsProps = {
  headers: string[];
  rows: TableNode['rows'];
  tableExcludedColumns: string[];
  toggleSelected: TreeRenderProps['toggleSelected'];
  treeRenderProps: TreeRenderProps;
};

type TableRowItemProps = {
  excluded: string[];
  headers: string[];
  row: TableRow;
  state: TreeNodeState;
  toggleSelected: (nodeId: string) => void;
};

function TableRowItem({ excluded, headers, row, state, toggleSelected }: TableRowItemProps) {
  return (
    <div
      className={['sniptale-tree-row', state.selected && 'sniptale-tree-row-field-selected']
        .filter(Boolean)
        .join(' ')}
      style={{ padding: '4px 10px', marginBottom: '2px' }}
    >
      <input
        type="checkbox"
        className="sniptale-checkbox"
        style={{ marginTop: '2px' }}
        checked={state.selected}
        onChange={() => toggleSelected(row.id)}
      />
      <div className="sniptale-ai-table-row-content">
        {headers
          .filter((header) => !excluded.includes(header))
          .map((header, index, filtered) => (
            <span key={header}>
              <span className="sniptale-ai-table-row-label">{header}:</span>{' '}
              <span className="sniptale-ai-table-row-value">{row.data[header] || '—'}</span>
              {index < filtered.length - 1 && (
                <span className="sniptale-ai-table-row-separator">·</span>
              )}
            </span>
          ))}
      </div>
    </div>
  );
}

export function TableSectionRows({
  headers,
  rows,
  tableExcludedColumns,
  toggleSelected,
  treeRenderProps,
}: TableSectionRowsProps) {
  return rows.map((row) => (
    <TableRowItem
      key={row.id}
      excluded={tableExcludedColumns}
      headers={headers}
      row={row}
      state={getDefaultTreeNodeState(row.id, false, treeRenderProps)}
      toggleSelected={toggleSelected}
    />
  ));
}
