import type {
  FieldNode,
  ParsedDOMTree,
  SectionNode,
  TableNode,
} from '@sniptale/runtime-contracts/dom-tree';

function includesQuery(value: string, query: string): boolean {
  return value.toLocaleLowerCase().includes(query);
}

function filterTable(table: TableNode, query: string): TableNode | null {
  if (table.headers.some((header) => includesQuery(header, query))) return table;
  const rows = table.rows.filter((row) =>
    Object.values(row.data).some((value) => includesQuery(value, query))
  );
  return rows.length > 0 ? { ...table, rows } : null;
}

function filterSection(section: SectionNode, query: string): SectionNode | null {
  if (includesQuery(section.title, query)) return section;
  const children: Array<FieldNode | TableNode> = [];
  section.children.forEach((child) => {
    if (child.type === 'field') {
      const field = child as FieldNode;
      if (includesQuery(field.label, query) || includesQuery(field.value, query)) {
        children.push(field);
      }
      return;
    }
    const table = filterTable(child as TableNode, query);
    if (table) children.push(table);
  });
  return children.length > 0 ? { ...section, children } : null;
}

export function filterAIModalTreeData(treeData: ParsedDOMTree, rawQuery: string): ParsedDOMTree {
  const query = rawQuery.trim().toLocaleLowerCase();
  if (!query) return treeData;
  return {
    ...treeData,
    structure: treeData.structure.flatMap((section) => {
      const filtered = filterSection(section, query);
      return filtered ? [filtered] : [];
    }),
  };
}

function isSelected(
  treeState: ReadonlyMap<string, { selected: boolean }>,
  id: string,
  fallback: boolean
): boolean {
  return treeState.get(id)?.selected ?? fallback;
}

/** Keeps selected leaves and the ancestors required to render their hierarchy. */
export function filterAIModalTreeDataBySelection(
  treeData: ParsedDOMTree,
  treeState: ReadonlyMap<string, { selected: boolean }>
): ParsedDOMTree {
  return {
    ...treeData,
    structure: treeData.structure.flatMap((section) => {
      const children = section.children.flatMap<FieldNode | TableNode>((child) => {
        if (child.type === 'field') {
          return isSelected(treeState, child.id, child.selected ?? false) ? [child] : [];
        }

        const table = child as TableNode;
        const rows = table.rows.filter((row) =>
          isSelected(treeState, row.id, row.selected ?? false)
        );
        if (rows.length === 0 && !isSelected(treeState, table.id, table.selected ?? false)) {
          return [];
        }
        return [{ ...table, rows }];
      });
      return children.length > 0 ? [{ ...section, children }] : [];
    }),
  };
}

export function getAIModalTreeNodeIds(treeData: ParsedDOMTree): string[] {
  return treeData.structure.flatMap((section) => [
    section.id,
    ...section.children.flatMap((child) =>
      child.type === 'table' ? [child.id, ...child.rows.map((row) => row.id)] : [child.id]
    ),
  ]);
}
