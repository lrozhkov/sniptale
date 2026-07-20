import type { ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';

export interface AIModalDataPanelProps {
  treeData: ParsedDOMTree | null;
  isLoading: boolean;
  onSelectedDataChange: (selectedData: string) => void;
  selectedData: string;
}

export interface TreeNodeState {
  id: string;
  expanded: boolean;
  selected: boolean;
}
