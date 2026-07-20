import type { ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';
import { createAIModalDataPanelPanelActions } from './panel-actions';
import { createAIModalDataPanelTreeActions } from './tree-actions';
import type { DataPanelActionBaseState, DataPanelActionDerivedState } from './action-types';

export function createAIModalDataPanelActions(props: {
  base: DataPanelActionBaseState;
  derived: DataPanelActionDerivedState;
  treeData: ParsedDOMTree | null;
}) {
  return {
    ...createAIModalDataPanelPanelActions({
      base: props.base,
      derived: props.derived,
    }),
    ...createAIModalDataPanelTreeActions({
      base: props.base,
      derived: props.derived,
      treeData: props.treeData,
    }),
  };
}
