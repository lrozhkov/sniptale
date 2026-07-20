import type React from 'react';
import type { ParsedDOMTree, TableNode } from '@sniptale/runtime-contracts/dom-tree';
import type { TreeNodeState } from '../types';

function setNodeSelected(next: Map<string, TreeNodeState>, id: string, selected: boolean): void {
  const node = next.get(id);
  if (node) {
    next.set(id, { ...node, selected });
  }
}

function setTableSelected(
  next: Map<string, TreeNodeState>,
  table: TableNode,
  selected: boolean
): void {
  setNodeSelected(next, table.id, selected);
  table.rows.forEach((row) => {
    setNodeSelected(next, row.id, selected);
  });
}

function setTreeDataSelected(
  treeData: ParsedDOMTree,
  next: Map<string, TreeNodeState>,
  selected: boolean
): void {
  treeData.structure.forEach((section) => {
    setNodeSelected(next, section.id, selected);

    section.children.forEach((child) => {
      if (child.type === 'field') {
        setNodeSelected(next, child.id, selected);
        return;
      }

      if (child.type === 'table') {
        setTableSelected(next, child as TableNode, selected);
      }
    });
  });
}

export function createToggleSelectAllHandler(props: {
  isAnySelected: boolean;
  setExcludedColumns: React.Dispatch<React.SetStateAction<Map<string, string[]>>>;
  setTreeState: React.Dispatch<React.SetStateAction<Map<string, TreeNodeState>>>;
  treeData: ParsedDOMTree | null;
}) {
  return () => {
    const { treeData } = props;
    if (!treeData) {
      return;
    }

    const newValue = !props.isAnySelected;

    props.setTreeState((prev) => {
      const next = new Map(prev);
      setTreeDataSelected(treeData, next, newValue);
      return next;
    });

    if (newValue) {
      props.setExcludedColumns(new Map());
    }
  };
}

export function createToggleExpandAllHandler(props: {
  isAnyExpanded: boolean;
  setTreeState: React.Dispatch<React.SetStateAction<Map<string, TreeNodeState>>>;
}) {
  return () => {
    const newValue = !props.isAnyExpanded;

    props.setTreeState((prev) => {
      const next = new Map(prev);

      for (const [id, node] of next.entries()) {
        next.set(id, { ...node, expanded: newValue });
      }

      return next;
    });
  };
}
