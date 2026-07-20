import type { FieldNode, ParsedDOMTree, TableNode } from '@sniptale/runtime-contracts/dom-tree';
import { formatDataForAIJSON } from '../../../../parser/dom-tree-parser/ai/format';
import type { TreeNodeState } from '../types';

function mapSelectedChild(props: {
  child: ParsedDOMTree['structure'][number]['children'][number];
  excludedColumns: Map<string, string[]>;
  treeState: Map<string, TreeNodeState>;
}) {
  const { child, excludedColumns, treeState } = props;

  if (child.type === 'field') {
    const field = child as FieldNode;
    const fieldState = treeState.get(field.id);
    return { ...field, selected: fieldState?.selected ?? false };
  }

  if (child.type === 'table') {
    const table = child as TableNode;
    const tableState = treeState.get(table.id);
    return {
      ...table,
      ...(excludedColumns.has(table.id)
        ? { excludedColumns: excludedColumns.get(table.id) ?? [] }
        : {}),
      rows: table.rows.map((row) => {
        const rowState = treeState.get(row.id);
        return { ...row, selected: rowState?.selected ?? false };
      }),
      selected: tableState?.selected ?? false,
    };
  }

  return child;
}

export function buildSelectedDataPayload(
  excludedColumns: Map<string, string[]>,
  treeData: ParsedDOMTree,
  treeState: Map<string, TreeNodeState>
) {
  const sections = treeData.structure.map((section) => {
    const sectionState = treeState.get(section.id);

    return {
      ...section,
      children: section.children.map((child) =>
        mapSelectedChild({ child, excludedColumns, treeState })
      ),
      selected: sectionState?.selected ?? false,
    };
  });

  return formatDataForAIJSON({
    ...treeData,
    sections,
    structure: sections,
  });
}
