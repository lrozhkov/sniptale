import type { SettingsTransferTreeNode } from '../../contracts/settings-transfer';

export function closeSettingsTransferSelection(
  selectedIds: readonly string[],
  tree: readonly SettingsTransferTreeNode[]
): string[] {
  const nodes = flattenSettingsTransferTree(tree);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const selected = new Set<string>();
  const pending = selectedIds.map((id) => ({ id, expandChildren: false }));
  while (pending.length > 0) {
    const request = pending.pop();
    if (!request) continue;
    const node = byId.get(request.id);
    if (!node || !node.selectable) continue;
    const wasSelected = selected.has(node.id);
    selected.add(node.id);
    if (node.parentId) pending.push({ id: node.parentId, expandChildren: false });
    if (request.expandChildren && !wasSelected) {
      for (const child of node.children) pending.push({ id: child.id, expandChildren: true });
    }
    for (const candidate of nodes) {
      if (candidate.requiredBy.includes(node.id)) {
        pending.push({ id: candidate.id, expandChildren: true });
      }
    }
  }
  return [...selected].sort();
}

export function flattenSettingsTransferTree(
  tree: readonly SettingsTransferTreeNode[]
): SettingsTransferTreeNode[] {
  return tree.flatMap((node) => [node, ...flattenSettingsTransferTree(node.children)]);
}
