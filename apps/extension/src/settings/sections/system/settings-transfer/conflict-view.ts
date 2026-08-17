import type {
  SettingsTransferConflict,
  SettingsTransferTreeNode,
} from '../../../../contracts/settings-transfer';
import { flattenTransferTreeNodes, getTransferNodeDisplayName } from './tree-model';

export function buildVisibleSettingsTransferConflicts(args: {
  conflicts: readonly SettingsTransferConflict[];
  selected: ReadonlySet<string>;
  tree: readonly SettingsTransferTreeNode[];
}) {
  const nodes = flattenTransferTreeNodes(args.tree);
  return args.conflicts.flatMap((conflict) => {
    const node = nodes.find((candidate) => candidate.id === conflict.nodeId);
    return node && args.selected.has(node.id)
      ? [{ conflict, label: getTransferNodeDisplayName(node), transferNodeId: node.id }]
      : [];
  });
}
