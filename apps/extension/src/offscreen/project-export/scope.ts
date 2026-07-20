import { isSubtitleClip } from '../../features/video/project/timeline/presentation';
import {
  VideoProjectClipType,
  VideoExportScope,
  type VideoProject,
  type VideoProjectEffectClip,
  type VideoProjectExportSettings,
} from '../../features/video/project/types';

export function resolveProjectRenderScope(
  project: VideoProject,
  settings: VideoProjectExportSettings
): VideoProject {
  const selectedClipIds =
    settings.scope === VideoExportScope.SELECTED_CLIP ? (settings.selectedClipIds ?? []) : [];
  if (settings.scope !== VideoExportScope.SELECTED_CLIP) {
    return project;
  }
  if (selectedClipIds.length === 0) {
    throw new Error('Invalid video project export settings');
  }

  if (selectedClipIds.some((clipId) => !project.clips.some((clip) => clip.id === clipId))) {
    throw new Error('Invalid video project export settings');
  }
  const scope = resolveSelectedClipClosure(project, settings, selectedClipIds);
  if (isCompleteRenderScope(project, scope)) return project;
  return {
    ...project,
    clips: scope.clips,
    ...(project.transitions ? { transitions: scope.transitions } : {}),
    ...(project.effectInstances ? { effectInstances: scope.effectInstances } : {}),
    ...(project.effectSnapshots ? { effectSnapshots: scope.effectSnapshots } : {}),
  };
}

interface SelectedRenderScope {
  clips: VideoProject['clips'];
  effectInstances: NonNullable<VideoProject['effectInstances']>;
  effectSnapshots: NonNullable<VideoProject['effectSnapshots']>;
  transitions: NonNullable<VideoProject['transitions']>;
}

function resolveSelectedClipClosure(
  project: VideoProject,
  settings: VideoProjectExportSettings,
  selectedClipIds: string[]
): SelectedRenderScope {
  const allowedClipIds = new Set(selectedClipIds);
  const clips = project.clips.filter(
    (clip) =>
      allowedClipIds.has(clip.id) || (settings.burnInSubtitles === true && isSubtitleClip(clip))
  );
  const clipIds = new Set(clips.map(({ id }) => id));
  const transitions = (project.transitions ?? []).filter(
    ({ leadingClipId, trailingClipId }) => clipIds.has(leadingClipId) && clipIds.has(trailingClipId)
  );
  const transitionIds = new Set(transitions.map(({ id }) => id));
  const standaloneInstanceIds = new Set(
    clips
      .filter((clip): clip is VideoProjectEffectClip => clip.type === VideoProjectClipType.EFFECT)
      .map((clip) => clip.effectInstanceId)
  );
  const effectInstances = (project.effectInstances ?? []).filter(({ id, target }) => {
    if (target.kind === 'scene') return standaloneInstanceIds.has(id);
    if (target.kind === 'clip') return clipIds.has(target.clipId);
    return transitionIds.has(target.transitionId);
  });
  const snapshotIds = new Set(effectInstances.map(({ snapshotId }) => snapshotId));
  const effectSnapshots = (project.effectSnapshots ?? []).filter(({ id }) => snapshotIds.has(id));
  return { clips, effectInstances, effectSnapshots, transitions };
}

function isCompleteRenderScope(project: VideoProject, scope: SelectedRenderScope): boolean {
  return (
    scope.clips.length === project.clips.length &&
    scope.transitions.length === (project.transitions ?? []).length &&
    scope.effectInstances.length === (project.effectInstances ?? []).length &&
    scope.effectSnapshots.length === (project.effectSnapshots ?? []).length
  );
}
