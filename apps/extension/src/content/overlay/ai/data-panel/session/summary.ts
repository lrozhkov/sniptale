import { translate } from '../../../../../platform/i18n';
import type { ParsedDOMTree, TableNode } from '@sniptale/runtime-contracts/dom-tree';
import type { TreeNodeState } from '../types';

function countSelectedRows(treeState: Map<string, TreeNodeState>, table: TableNode) {
  let total = 0;
  let selected = 0;

  table.rows.forEach((row) => {
    total += 1;

    if (treeState.get(row.id)?.selected) {
      selected += 1;
    }
  });

  return { selected, total };
}

export function getDataSpoilerSummary(
  treeData: ParsedDOMTree | null,
  treeState: Map<string, TreeNodeState>
) {
  if (!treeData) {
    return '';
  }

  let total = 0;
  let selected = 0;

  treeData.structure.forEach((section) => {
    section.children.forEach((child) => {
      if (child.type === 'field') {
        total += 1;

        if (treeState.get(child.id)?.selected) {
          selected += 1;
        }

        return;
      }

      if (child.type === 'table') {
        const counts = countSelectedRows(treeState, child as TableNode);
        total += counts.total;
        selected += counts.selected;
      }
    });
  });

  if (total === 0) {
    return '';
  }

  if (selected === 0) {
    return translate('aiModal.dataSummaryNone');
  }

  if (selected === total) {
    return `${translate('aiModal.dataSummaryAllPrefix')}${total}${translate('aiModal.dataSummaryAllSuffix')}`;
  }

  return (
    `${translate('aiModal.dataSummarySomePrefix')}${selected}` +
    `${translate('aiModal.dataSummarySomeMiddle')}${total}` +
    translate('aiModal.dataSummarySomeSuffix')
  );
}
