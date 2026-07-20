import type { ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';
import {
  createToggleColumnExclusionHandler,
  createToggleExpandedHandler,
  createToggleSelectedHandler,
} from '../interactions/tree-node';
import type { DataPanelActionBaseState } from './action-types';

export function createAIModalDataPanelTreeNodeActions(props: {
  base: DataPanelActionBaseState;
  treeData: ParsedDOMTree | null;
}) {
  return {
    toggleColumnExclusion: createToggleColumnExclusionHandler(props.base.setExcludedColumns),
    toggleExpanded: createToggleExpandedHandler(props.base.setTreeState),
    toggleSelected: createToggleSelectedHandler({
      setTreeState: props.base.setTreeState,
      treeData: props.treeData,
    }),
  };
}
