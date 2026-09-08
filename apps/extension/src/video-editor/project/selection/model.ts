import type { VideoProject } from '../../../features/video/project/types/index';
import { VideoEditorSelectionKind, type VideoEditorSelection } from '../../contracts/selection';
import { isVideoEditorPresentedClip } from '../operations/presented-tracks';

export function createSceneSelection(): VideoEditorSelection {
  return { kind: VideoEditorSelectionKind.SCENE };
}

export function resolveInitialVideoEditorSelection(project: VideoProject): VideoEditorSelection {
  const firstVisualClip = project.clips.find(
    (clip) => clip.type !== 'AUDIO' && isVideoEditorPresentedClip(project, clip)
  );
  if (firstVisualClip) {
    return {
      kind: VideoEditorSelectionKind.CLIP,
      clipId: firstVisualClip.id,
    };
  }

  return createSceneSelection();
}

export function selectVideoEditorClip(
  selection: VideoEditorSelection,
  clipId: string,
  orderedClipIds: readonly string[],
  intent: 'replace' | 'toggle' | 'range'
): VideoEditorSelection {
  if (!orderedClipIds.includes(clipId)) return selection;
  const selected =
    selection.kind === VideoEditorSelectionKind.CLIP
      ? [selection.clipId]
      : selection.kind === VideoEditorSelectionKind.CLIP_GROUP
        ? selection.clipIds
        : [];
  const existing = orderedClipIds.filter((id) => selected.includes(id));
  const previousAnchor =
    selection.kind === VideoEditorSelectionKind.CLIP_GROUP ? selection.anchorClipId : existing[0];
  const anchor =
    previousAnchor && existing.includes(previousAnchor) ? previousAnchor : (existing[0] ?? clipId);
  if (intent === 'replace') return { kind: VideoEditorSelectionKind.CLIP, clipId };
  const first = orderedClipIds.indexOf(anchor);
  const last = orderedClipIds.indexOf(clipId);
  const members =
    intent === 'range'
      ? orderedClipIds.slice(Math.min(first, last), Math.max(first, last) + 1)
      : orderedClipIds.filter((id) =>
          id === clipId ? !existing.includes(id) : existing.includes(id)
        );
  if (members.length === 0) return createSceneSelection();
  if (members.length === 1) return { kind: VideoEditorSelectionKind.CLIP, clipId: members[0]! };
  return {
    kind: VideoEditorSelectionKind.CLIP_GROUP,
    clipIds: members,
    anchorClipId: members.includes(anchor) ? anchor : members[0]!,
  };
}
