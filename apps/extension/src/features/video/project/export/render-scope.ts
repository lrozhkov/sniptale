import { VIDEO_PROJECT_ATTACHMENT_GEOMETRY } from '../types/export';
import { isSubtitleClip } from '../timeline/presentation';
import {
  VideoProjectClipType,
  VideoExportScope,
  type VideoProject,
  type VideoProjectEffectClip,
  type VideoProjectExportSettings,
} from '../types';

/** Disposable geometry context is never a saved project or a source of painted/audio clips. */
export interface VideoProjectRenderScope extends VideoProject {
  readonly [VIDEO_PROJECT_ATTACHMENT_GEOMETRY]?: VideoProject;
}

export function resolveProjectRenderScope(
  project: VideoProjectRenderScope,
  settings: VideoProjectExportSettings
): VideoProjectRenderScope {
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
  const { [VIDEO_PROJECT_ATTACHMENT_GEOMETRY]: attachmentGeometryProject, ...renderProject } =
    project;
  const geometryProject = attachmentGeometryProject ?? project;
  const selected = new Set(scope.clips.map((clip) => clip.id));
  const needsSourceGeometry = scope.clips.some((host) => {
    if (host.type !== 'EFFECT' || host.attachment?.kind !== 'source') return false;
    const binding = host.attachment;
    return geometryProject.clips.some(
      (source) =>
        source.type === 'VIDEO' &&
        source.assetId === binding.assetId &&
        (source.sourceInstanceId ?? source.id) === binding.sourceInstanceId &&
        !selected.has(source.id)
    );
  });
  return {
    ...renderProject,
    ...(needsSourceGeometry ? { [VIDEO_PROJECT_ATTACHMENT_GEOMETRY]: geometryProject } : {}),
    clips: scope.clips,
    ...(project.compositionJoins ? { compositionJoins: [] } : {}),
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
    if (target.kind === 'video-group') return true;
    if (target.kind === 'track') return clips.some((clip) => clip.trackId === target.trackId);
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
