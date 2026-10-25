import { parseVideoProjectEntry } from '../projects/read-guards';
import { parseVideoWorkspace } from '../review-workspaces/parser';
import { collectReviewAssetReferences } from '../review-workspaces/asset-refs';
import { videoSourceReferences } from './dependencies';

export const USAGE_REFERENCE_INDEX = 'usageReferenceKeys';
export const USAGE_INDEX_MARKER = 'indexed:v2';

/** Typed locators distinguish Library identities, private resources and recording origins. */
export function usageReferenceKey(kind: string, id: string): string {
  return JSON.stringify([kind, id]);
}

/** Derived keys are recomputed at the owning write, never accepted from an imported index. */
export function withVideoProjectUsage<T extends object>(
  value: T
): T & { usageReferenceKeys: string[] } {
  const entry = parseVideoProjectEntry(value);
  const keys = new Set([USAGE_INDEX_MARKER]);
  if (entry) {
    const project = entry.project;
    for (const asset of project.assets) {
      for (const ref of videoSourceReferences(asset.source))
        keys.add(usageReferenceKey(ref.kind, ref.id));
    }
    if (project.baseRecordingId) keys.add(usageReferenceKey('recording', project.baseRecordingId));
    if (project.source.kind === 'recording')
      keys.add(usageReferenceKey('recording', project.source.recordingId));
  }
  return { ...value, usageReferenceKeys: [...keys] };
}

/** Retained undo/redo and recovery references participate in the same advisory index. */
export function withReviewWorkspaceUsage<T extends object>(
  value: T
): T & { usageReferenceKeys: string[] } {
  const workspace = parseVideoWorkspace(value);
  const keys = new Set([USAGE_INDEX_MARKER]);
  if (workspace) {
    keys.add(usageReferenceKey('library-asset', workspace.sourceMediaId ?? workspace.aggregateId));
    for (const ref of collectReviewAssetReferences(workspace)) {
      if (ref.startsWith('project-asset:'))
        keys.add(usageReferenceKey('project-asset', ref.slice('project-asset:'.length)));
    }
  }
  return { ...value, usageReferenceKeys: [...keys] };
}
