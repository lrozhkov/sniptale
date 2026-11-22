import { collectVideoProjectWorkspaceSources } from '../projects/history-contracts';
import type { VideoProjectEntry } from '../projects/contracts';

export function collectVideoProjectReferences(project: VideoProjectEntry): {
  projectAssetIds: Set<string>;
  recordingIds: Set<string>;
  libraryMediaIds: Set<string>;
} {
  const recordingIds = new Set<string>();
  const projectAssetIds = new Set<string>();
  const libraryMediaIds = new Set<string>();
  for (const ref of collectVideoProjectWorkspaceSources(project)) {
    if (ref.kind === 'recording') recordingIds.add(ref.id);
    if (ref.kind === 'project-asset') projectAssetIds.add(ref.id);
    if (ref.kind === 'library-asset') libraryMediaIds.add(ref.id);
  }
  return { recordingIds, projectAssetIds, libraryMediaIds };
}
