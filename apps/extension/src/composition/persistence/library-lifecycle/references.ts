import type { VideoProjectEntry } from '../projects/contracts';

export function collectVideoProjectReferences(project: VideoProjectEntry): {
  projectAssetIds: Set<string>;
  recordingIds: Set<string>;
  libraryMediaIds: Set<string>;
} {
  const recordingIds = new Set<string>();
  const projectAssetIds = new Set<string>();
  const libraryMediaIds = new Set<string>();
  if (project.project.baseRecordingId) recordingIds.add(project.project.baseRecordingId);
  if (project.project.source?.kind === 'recording')
    recordingIds.add(project.project.source.recordingId);
  for (const asset of project.project.assets) {
    if (asset.source.kind === 'recording') recordingIds.add(asset.source.recordingId);
    if (asset.source.kind === 'project-asset') {
      projectAssetIds.add(asset.source.projectAssetId);
      if (asset.source.originRecordingId) recordingIds.add(asset.source.originRecordingId);
    }
    if (asset.source.kind === 'library-asset') libraryMediaIds.add(asset.source.mediaId);
  }
  return { recordingIds, projectAssetIds, libraryMediaIds };
}
