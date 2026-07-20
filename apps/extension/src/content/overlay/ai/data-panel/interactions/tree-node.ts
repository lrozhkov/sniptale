import type React from 'react';
import type { ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';
import { toggleSelectedNodes } from '../tree/mutation';
import type { TreeNodeState } from '../types';

export function createToggleExpandedHandler(
  setTreeState: React.Dispatch<React.SetStateAction<Map<string, TreeNodeState>>>
) {
  return (nodeId: string) => {
    setTreeState((prev) => {
      const next = new Map(prev);
      const node = next.get(nodeId);

      if (node) {
        next.set(nodeId, { ...node, expanded: !node.expanded });
      }

      return next;
    });
  };
}

export function createToggleSelectedHandler(props: {
  setTreeState: React.Dispatch<React.SetStateAction<Map<string, TreeNodeState>>>;
  treeData: ParsedDOMTree | null;
}) {
  return (nodeId: string) => {
    props.setTreeState((prev) => {
      const next = new Map(prev);
      const node = next.get(nodeId);

      if (!node || !props.treeData) {
        return prev;
      }

      const newValue = !node.selected;
      next.set(nodeId, { ...node, selected: newValue });
      toggleSelectedNodes(next, props.treeData, nodeId, newValue);

      return next;
    });
  };
}

export function createToggleColumnExclusionHandler(
  setExcludedColumns: React.Dispatch<React.SetStateAction<Map<string, string[]>>>
) {
  return (tableId: string, column: string) => {
    setExcludedColumns((prev) => {
      const next = new Map(prev);
      const current = next.get(tableId) || [];

      next.set(
        tableId,
        current.includes(column) ? current.filter((item) => item !== column) : [...current, column]
      );

      return next;
    });
  };
}
