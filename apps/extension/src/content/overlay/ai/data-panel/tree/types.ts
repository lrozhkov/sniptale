import type { TreeNodeState } from '../types';

export interface TreeRenderProps {
  excludedColumns: Map<string, string[]>;
  toggleColumnExclusion: (tableId: string, column: string) => void;
  toggleExpanded: (nodeId: string) => void;
  toggleSelected: (nodeId: string) => void;
  treeState: Map<string, TreeNodeState>;
}
