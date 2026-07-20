import type { VideoProject } from '../../../features/video/project/types/index';
import { VideoEditorSelectionKind, type VideoEditorSelection } from '../../contracts/selection';

export function createSceneSelection(): VideoEditorSelection {
  return { kind: VideoEditorSelectionKind.SCENE };
}

export function resolveInitialVideoEditorSelection(project: VideoProject): VideoEditorSelection {
  const firstVisualClip = project.clips.find((clip) => clip.type !== 'AUDIO');
  if (firstVisualClip) {
    return {
      kind: VideoEditorSelectionKind.CLIP,
      clipId: firstVisualClip.id,
    };
  }

  return createSceneSelection();
}
