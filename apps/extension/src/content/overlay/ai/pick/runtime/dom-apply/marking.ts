import type { ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';

function markSectionSelection(
  section: ParsedDOMTree['structure'][number],
  selectedIds: Set<string>
) {
  const hasSelectedChild = section.children.some((child) => {
    if (child.type === 'field') {
      return selectedIds.has(child.id);
    }

    if (child.type === 'table') {
      return child.rows.some((row) => selectedIds.has(row.id));
    }

    return false;
  });

  return {
    ...section,
    selected: selectedIds.has(section.id) || hasSelectedChild,
    children: section.children.map((child) => {
      if (child.type === 'field') {
        return { ...child, selected: selectedIds.has(child.id) };
      }

      if (child.type === 'table') {
        const hasSelectedRow = child.rows.some((row) => selectedIds.has(row.id));
        return {
          ...child,
          selected: hasSelectedRow,
          rows: child.rows.map((row) => ({
            ...row,
            selected: selectedIds.has(row.id),
          })),
        };
      }

      return child;
    }),
  };
}

export function markSelectedInTree(tree: ParsedDOMTree, selectedIds: Set<string>): ParsedDOMTree {
  const sections = tree.structure.map((section) => markSectionSelection(section, selectedIds));

  return {
    ...tree,
    sections,
    structure: sections,
  };
}
