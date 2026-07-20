import type { TreeNodeState } from '../types';
import type { TreeRenderProps } from './types';

export function getDefaultTreeNodeState(
  nodeId: string,
  selected: boolean,
  treeRenderProps: TreeRenderProps
): TreeNodeState {
  return (
    treeRenderProps.treeState.get(nodeId) || {
      id: nodeId,
      expanded: true,
      selected,
    }
  );
}
