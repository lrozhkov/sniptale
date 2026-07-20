import type { ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';
import { createAIModalDataPanelTreeBulkActions } from './tree-bulk-actions';
import { createAIModalDataPanelTreeNodeActions } from './tree-node-actions';
import type { DataPanelActionBaseState, DataPanelActionDerivedState } from './action-types';

export function createAIModalDataPanelTreeActions(props: {
  base: DataPanelActionBaseState;
  derived: DataPanelActionDerivedState;
  treeData: ParsedDOMTree | null;
}) {
  return {
    ...createAIModalDataPanelTreeNodeActions({
      base: props.base,
      treeData: props.treeData,
    }),
    ...createAIModalDataPanelTreeBulkActions({
      base: props.base,
      derived: props.derived,
      treeData: props.treeData,
    }),
  };
}
