import type { StoredImageWorkspaceEntry } from './contracts';
import { imageHistoryAssetBindings } from './history-contracts';

/** One resource closure for native publication, recovery, transfer, usage and physical retention. */
export function imageWorkspaceAssetBindings(
  workspace: Pick<StoredImageWorkspaceEntry, 'document' | 'history'>
): { assetId: string; role: string }[] {
  const bindings = [...workspace.document.assets, ...imageHistoryAssetBindings(workspace.history)];
  const roles = new Set<string>();
  for (const binding of bindings) {
    if (roles.has(binding.role)) throw new Error('Image workspace asset roles conflict.');
    roles.add(binding.role);
  }
  return bindings;
}
