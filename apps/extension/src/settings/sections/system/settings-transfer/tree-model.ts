import type { SettingsTransferTreeNode } from '../../../../contracts/settings-transfer';
import type { TranslationKey } from '../../../../platform/i18n';
import { translate } from '../../../../platform/i18n';

export function getTransferNodeDisplayName(node: SettingsTransferTreeNode): string {
  return node.kind === 'item' ? node.labelKey : translate(node.labelKey as TranslationKey);
}

export function filterTransferTree(
  nodes: readonly SettingsTransferTreeNode[],
  query: string
): { nodes: SettingsTransferTreeNode[]; matchedIds: Set<string> } {
  if (!query) {
    return {
      nodes: [...nodes],
      matchedIds: new Set(flattenTransferTreeNodes(nodes).map((node) => node.id)),
    };
  }
  const matchedIds = new Set<string>();
  const visit = (node: SettingsTransferTreeNode): SettingsTransferTreeNode | null => {
    if (transferNodeMatches(node, query)) {
      matchedIds.add(node.id);
      return node;
    }
    const children = node.children.flatMap((child) => {
      const filtered = visit(child);
      return filtered ? [filtered] : [];
    });
    return children.length > 0 ? { ...node, children } : null;
  };
  return {
    nodes: nodes.flatMap((node) => {
      const filtered = visit(node);
      return filtered ? [filtered] : [];
    }),
    matchedIds,
  };
}

export function flattenTransferTreeNodes(
  nodes: readonly SettingsTransferTreeNode[]
): SettingsTransferTreeNode[] {
  return nodes.flatMap((node) => [node, ...flattenTransferTreeNodes(node.children)]);
}

export function flattenVisibleTransferTreeNodes(
  nodes: readonly SettingsTransferTreeNode[],
  expandedIds: ReadonlySet<string>
): SettingsTransferTreeNode[] {
  return nodes.flatMap((node) => [
    node,
    ...(expandedIds.has(node.id)
      ? flattenVisibleTransferTreeNodes(node.children, expandedIds)
      : []),
  ]);
}

function transferNodeMatches(node: SettingsTransferTreeNode, query: string): boolean {
  const displayName = getTransferNodeDisplayName(node).toLocaleLowerCase();
  return displayName.includes(query) || node.id.toLocaleLowerCase().includes(query);
}
