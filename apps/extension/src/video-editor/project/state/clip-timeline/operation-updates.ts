import { applyVideoProjectMutationPatch } from '../../../../features/video/project/mutation';
import type {
  VideoProject,
  VideoProjectClip,
} from '../../../../features/video/project/types/index';

type ClipTimelineUpdater = (clip: VideoProjectClip) => VideoProjectClip;

interface ClipTimelineOperation {
  clipIdSet: ReadonlySet<string>;
}

export function updateOperationClips(
  project: VideoProject,
  operation: ClipTimelineOperation,
  updateClip: ClipTimelineUpdater
): VideoProject {
  return applyVideoProjectMutationPatch(project, {
    clips: project.clips.map((item) =>
      operation.clipIdSet.has(item.id) ? updateClip(item) : item
    ),
  });
}
