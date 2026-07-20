import type { TreeNodeState } from '../types';

function hasAnyNodeMatching(
  treeState: Map<string, TreeNodeState>,
  predicate: (node: TreeNodeState) => boolean
) {
  for (const node of treeState.values()) {
    if (predicate(node)) {
      return true;
    }
  }

  return false;
}

export function getSelectionFlags(treeState: Map<string, TreeNodeState>) {
  return {
    isAnyExpanded: hasAnyNodeMatching(treeState, (node) => node.expanded),
    isAnySelected: hasAnyNodeMatching(treeState, (node) => node.selected),
  };
}
