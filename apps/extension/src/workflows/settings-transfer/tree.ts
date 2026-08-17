import type {
  SettingsTransferDynamicItem,
  SettingsTransferTreeNode,
} from '../../contracts/settings-transfer';
import { SETTINGS_TRANSFER_REGISTRY } from './registry';

export class SettingsTransferMissingDependencyError extends Error {
  constructor(readonly dependencyId: string) {
    super(`Settings package is missing required dependency: ${dependencyId}`);
    this.name = 'SettingsTransferMissingDependencyError';
  }
}

export function buildSettingsTransferTree(
  dynamicItems: readonly SettingsTransferDynamicItem[] = [],
  dependencies: Readonly<Record<string, readonly string[]>> = {}
): SettingsTransferTreeNode[] {
  const visible = SETTINGS_TRANSFER_REGISTRY.filter(
    (entry) => entry.classification === 'transferable'
  );
  const requiredBy = new Map<string, string[]>();
  for (const node of visible) {
    for (const dependency of node.dependencies) {
      requiredBy.set(dependency, [...(requiredBy.get(dependency) ?? []), node.id]);
    }
  }
  for (const [nodeId, nodeDependencies] of Object.entries(dependencies)) {
    for (const dependency of nodeDependencies) {
      requiredBy.set(dependency, [...(requiredBy.get(dependency) ?? []), nodeId]);
    }
  }

  const byParent = new Map<string | null, SettingsTransferTreeNode[]>();
  for (const node of visible) {
    const treeNode: SettingsTransferTreeNode = {
      id: node.id,
      parentId: node.parentId,
      domainId: node.domainId,
      labelKey: node.labelKey,
      descriptionKey: node.descriptionKey,
      kind: node.kind,
      classification: node.classification,
      selectable: true,
      requiredBy: requiredBy.get(node.id) ?? [],
      children: [],
    };
    byParent.set(node.parentId, [...(byParent.get(node.parentId) ?? []), treeNode]);
  }

  for (const item of dynamicItems) {
    const collection = visible.find((entry) => entry.id === item.collectionNodeId);
    if (!collection) continue;
    const id = `${item.collectionNodeId}.${item.id}`;
    const treeNode: SettingsTransferTreeNode = {
      id,
      parentId: item.collectionNodeId,
      domainId: collection.domainId,
      labelKey: item.label,
      descriptionKey: item.label,
      kind: 'item',
      classification: 'transferable',
      selectable: true,
      requiredBy: [],
      children: [],
    };
    byParent.set(item.collectionNodeId, [...(byParent.get(item.collectionNodeId) ?? []), treeNode]);
    for (const dependency of item.dependencies ?? []) {
      requiredBy.set(dependency, [...(requiredBy.get(dependency) ?? []), id]);
    }
  }

  const availableIds = new Set([
    ...visible.map((node) => node.id),
    ...dynamicItems.map((item) => `${item.collectionNodeId}.${item.id}`),
  ]);
  for (const dependencyId of requiredBy.keys()) {
    if (!availableIds.has(dependencyId)) {
      throw new SettingsTransferMissingDependencyError(dependencyId);
    }
  }

  const attach = (node: SettingsTransferTreeNode): SettingsTransferTreeNode => ({
    ...node,
    requiredBy: requiredBy.get(node.id) ?? node.requiredBy,
    children: (byParent.get(node.id) ?? []).map(attach),
  });
  return (byParent.get(null) ?? []).map(attach);
}
