import type { ParsedDOMTree, TableNode } from '@sniptale/runtime-contracts/dom-tree';
import type { TreeNodeState } from '../types';

function setNodeSelected(next: Map<string, TreeNodeState>, id: string, newValue: boolean) {
  const node = next.get(id);
  if (node) {
    next.set(id, { ...node, selected: newValue });
  }
}

function isNodeSelected(next: Map<string, TreeNodeState>, id: string, fallback = false) {
  return next.get(id)?.selected ?? fallback;
}

function syncAncestorSelection(next: Map<string, TreeNodeState>, treeData: ParsedDOMTree) {
  treeData.structure.forEach((section) => {
    const sectionSelected = section.children.some((child) => {
      if (child.type === 'field') {
        return isNodeSelected(next, child.id, child.selected);
      }

      if (child.type === 'table') {
        const table = child as TableNode;
        const tableSelected = table.rows.some((row) => isNodeSelected(next, row.id, row.selected));
        setNodeSelected(next, table.id, tableSelected);
        return tableSelected;
      }

      return false;
    });

    setNodeSelected(next, section.id, sectionSelected);
  });
}

export function toggleSelectedNodes(
  next: Map<string, TreeNodeState>,
  treeData: ParsedDOMTree,
  nodeId: string,
  newValue: boolean
) {
  const section = treeData.structure.find((item) => item.id === nodeId);
  if (section) {
    section.children.forEach((child) => {
      if (child.type === 'field') {
        setNodeSelected(next, child.id, newValue);
        return;
      }

      if (child.type === 'table') {
        const table = child as TableNode;
        setNodeSelected(next, table.id, newValue);
        table.rows.forEach((row) => {
          setNodeSelected(next, row.id, newValue);
        });
      }
    });
    return;
  }

  treeData.structure.forEach((sectionItem) => {
    const table = sectionItem.children.find(
      (child) => child.type === 'table' && child.id === nodeId
    ) as TableNode | undefined;

    if (!table) {
      return;
    }

    table.rows.forEach((row) => {
      setNodeSelected(next, row.id, newValue);
    });
  });

  syncAncestorSelection(next, treeData);
}
