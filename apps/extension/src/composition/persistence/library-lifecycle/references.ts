import { videoSourceReferences } from '../media-library/dependencies';
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
    for (const ref of videoSourceReferences(asset.source)) {
      if (ref.kind === 'recording') recordingIds.add(ref.id);
      if (ref.kind === 'project-asset') projectAssetIds.add(ref.id);
      if (ref.kind === 'library-asset') libraryMediaIds.add(ref.id);
    }
  }
  return { recordingIds, projectAssetIds, libraryMediaIds };
}
