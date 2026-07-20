import type { ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';
import {
  createToggleExpandAllHandler,
  createToggleSelectAllHandler,
} from '../interactions/tree-bulk';
import type { DataPanelActionBaseState, DataPanelActionDerivedState } from './action-types';

export function createAIModalDataPanelTreeBulkActions(props: {
  base: DataPanelActionBaseState;
  derived: DataPanelActionDerivedState;
  treeData: ParsedDOMTree | null;
}) {
  return {
    toggleExpandAll: createToggleExpandAllHandler({
      isAnyExpanded: props.derived.isAnyExpanded,
      setTreeState: props.base.setTreeState,
    }),
    toggleSelectAll: createToggleSelectAllHandler({
      isAnySelected: props.derived.isAnySelected,
      setExcludedColumns: props.base.setExcludedColumns,
      setTreeState: props.base.setTreeState,
      treeData: props.treeData,
    }),
  };
}
