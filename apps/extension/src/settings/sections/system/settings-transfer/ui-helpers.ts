import type { SettingsTransferTreeNode } from '../../../../contracts/settings-transfer';
import { closeSettingsTransferSelection } from '../../../../workflows/settings-transfer';

export function flattenTransferTree(
  nodes: readonly SettingsTransferTreeNode[]
): SettingsTransferTreeNode[] {
  return nodes.flatMap((node) => [node, ...flattenTransferTree(node.children)]);
}

export function toggleTransferTreeSelection(
  current: ReadonlySet<string>,
  node: SettingsTransferTreeNode,
  checked: boolean,
  tree: readonly SettingsTransferTreeNode[]
): Set<string> {
  const next = new Set(current);
  const subtreeIds = [node, ...flattenTransferTree(node.children)].map((item) => item.id);
  if (checked) {
    for (const id of subtreeIds) next.add(id);
  } else {
    for (const id of subtreeIds) next.delete(id);
  }
  return new Set(closeSettingsTransferSelection([...next], tree));
}

export function downloadSettingsTransferText(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
