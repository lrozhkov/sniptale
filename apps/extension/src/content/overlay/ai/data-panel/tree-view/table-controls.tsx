import { translate } from '../../../../../platform/i18n';
import type { TableNode } from '@sniptale/runtime-contracts/dom-tree';
import type { TreeRenderProps } from '../tree/types';
import { ExpandIcon } from './tree-icons';

type TableSectionControlsProps = {
  expanded: boolean;
  table: TableNode;
  tableExcludedColumns: string[];
  toggleColumnExclusion: TreeRenderProps['toggleColumnExclusion'];
  toggleExpanded: TreeRenderProps['toggleExpanded'];
};

export function TableSectionControls({
  expanded,
  table,
  tableExcludedColumns,
  toggleColumnExclusion,
  toggleExpanded,
}: TableSectionControlsProps) {
  return (
    <div
      className="sniptale-column-exclusion"
      style={{ display: 'flex', alignItems: 'center', marginBottom: '4px' }}
    >
      <button
        className="sniptale-ai-column-toggle"
        onClick={() => toggleExpanded(table.id)}
        title={
          expanded ? translate('aiModal.collapseRowsTitle') : translate('aiModal.expandRowsTitle')
        }
      >
        <ExpandIcon expanded={expanded} size={11} />
      </button>
      <span className="sniptale-column-exclusion-label">
        {translate('aiModal.excludeColumnsLabel')}
      </span>
      {table.headers.map((header) => {
        const isExcluded = tableExcludedColumns.includes(header);
        return (
          <label
            key={header}
            className={`sniptale-column-exclusion-item ${isExcluded ? 'excluded' : ''}`}
          >
            <input
              type="checkbox"
              className="sniptale-checkbox sniptale-checkbox-sm"
              checked={!isExcluded}
              onChange={() => toggleColumnExclusion(table.id, header)}
            />
            {header}
          </label>
        );
      })}
    </div>
  );
}
