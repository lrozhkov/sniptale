import {
  isEffectInstanceEditable,
  resizeClipEffectInterval,
} from '../../../features/video/project/effect-instance/editing';
import { applyEffectCatalogDocument } from '../../../features/video/project/effect-instance/apply';
import type { VideoProjectEffectInstance } from '../../../features/video/project/effect-instance/types';
import { applyVideoProjectMutationPatch } from '../../../features/video/project/mutation';
import type {
  VideoEditorProjectState,
  VideoEditorProjectSliceGet,
  VideoEditorProjectSliceSet,
} from './contracts';
import { applyProjectUpdate } from './helpers';
import { VideoEditorSelectionKind } from '../../contracts/selection';
import { duplicateStandaloneEffectHost } from './clip-timeline/effect-host';

type EffectInstanceActions = Pick<
  VideoEditorProjectState,
  | 'selectEffectInstance'
  | 'setClipEffectsBypassed'
  | 'applyEffectDocument'
  | 'deleteEffectInstance'
  | 'duplicateEffectInstance'
  | 'moveEffectInstance'
  | 'updateEffectInstance'
>;

export function createEffectInstanceActions(
  set: VideoEditorProjectSliceSet,
  get: VideoEditorProjectSliceGet
): EffectInstanceActions {
  return {
    selectEffectInstance: (instanceId) =>
      set((state) => {
        const instance = state.project?.effectInstances?.find((item) => item.id === instanceId);
        if (!instance) return {};
        const target = instance.target;
        return {
          selection: {
            kind: VideoEditorSelectionKind.EFFECT_INSTANCE,
            effectInstanceId: instanceId,
          },
          selectedTrackId:
            target.kind === 'clip'
              ? (state.project!.clips.find((clip) => clip.id === target.clipId)?.trackId ?? null)
              : null,
        };
      }),
    setClipEffectsBypassed: (clipId, bypassed) =>
      set((state) =>
        applyProjectUpdate(state, (project) => {
          const clip = project.clips.find((clip) => clip.id === clipId);
          if (!clip || project.tracks.find((track) => track.id === clip.trackId)?.locked)
            return project;
          return {
            ...project,
            clips: project.clips.map((item) =>
              item.id === clipId ? { ...item, effectsBypassed: bypassed } : item
            ),
          };
        })
      ),
    applyEffectDocument: createApplyEffectDocument(set, get),
    deleteEffectInstance: createDeleteEffectInstance(set),
    duplicateEffectInstance: createDuplicateEffectInstance(set),
    moveEffectInstance: createMoveEffectInstance(set),
    updateEffectInstance: createUpdateEffectInstance(set),
  };
}

function createApplyEffectDocument(
  set: VideoEditorProjectSliceSet,
  get: VideoEditorProjectSliceGet
): EffectInstanceActions['applyEffectDocument'] {
  return async (args) => {
    const sourceState = get();
    const sourceProject = sourceState.project;
    if (!sourceProject) return null;
    const selectedTrack = sourceProject.tracks.find(
      (track) =>
        track.id === sourceState.selectedTrackId &&
        track.kind === 'PRIMARY' &&
        track.role !== 'CAMERA'
    );
    const trackId = args.trackId ?? (args.target.kind === 'scene' ? selectedTrack?.id : undefined);
    const instanceId = crypto.randomUUID();
    const nextProject = await applyEffectCatalogDocument({
      ...args,
      ...(trackId === undefined ? {} : { trackId }),
      instanceId,
      project: sourceProject,
    });
    let committed = false;
    set((state) => {
      if (state.project !== sourceProject) return {};
      committed = true;
      const update = applyProjectUpdate(state, () => nextProject);
      const host = nextProject.clips.find(
        (clip) => 'effectInstanceId' in clip && clip.effectInstanceId === instanceId
      );
      return host
        ? {
            ...update,
            selectedTrackId: host.trackId,
            selection: { clipId: host.id, kind: VideoEditorSelectionKind.CLIP },
          }
        : {
            ...update,
            selection: {
              kind: VideoEditorSelectionKind.EFFECT_INSTANCE,
              effectInstanceId: instanceId,
            },
          };
    });
    return committed ? instanceId : null;
  };
}

function createDeleteEffectInstance(
  set: VideoEditorProjectSliceSet
): EffectInstanceActions['deleteEffectInstance'] {
  return (instanceId) =>
    set((state) =>
      applyProjectUpdate(state, (project) => {
        const found = project.effectInstances?.find((item) => item.id === instanceId);
        if (!found || !isEffectInstanceEditable(project, found)) return project;
        const instances = (project.effectInstances ?? []).filter(({ id }) => id !== instanceId);
        if (instances.length === (project.effectInstances ?? []).length) return project;
        const usedSnapshots = new Set(instances.map(({ snapshotId }) => snapshotId));
        return applyVideoProjectMutationPatch(project, {
          effectInstances: instances,
          effectSnapshots: (project.effectSnapshots ?? []).filter(({ id }) =>
            usedSnapshots.has(id)
          ),
        });
      })
    );
}

function createDuplicateEffectInstance(
  set: VideoEditorProjectSliceSet
): EffectInstanceActions['duplicateEffectInstance'] {
  return (instanceId) => {
    let duplicateId: string | null = null;
    set((state) =>
      applyProjectUpdate(state, (project) => {
        const instances = project.effectInstances ?? [];
        const index = instances.findIndex(({ id }) => id === instanceId);
        const source = instances[index];
        if (!source || source.kind === 'transition' || !isEffectInstanceEditable(project, source))
          return project;
        if (source.kind === 'standalone') {
          const host = project.clips.find(
            (clip) => 'effectInstanceId' in clip && clip.effectInstanceId === source.id
          );
          if (!host) return project;
          const duplicated = duplicateStandaloneEffectHost(project, host.id);
          duplicateId = duplicated?.effectInstanceId ?? null;
          return duplicated?.project ?? project;
        }
        const duplicate: VideoProjectEffectInstance = {
          ...source,
          controls: { ...source.controls },
          id: crypto.randomUUID(),
          startTime: source.startTime,
        };
        duplicateId = duplicate.id;
        return applyVideoProjectMutationPatch(project, {
          effectInstances: [
            ...instances.slice(0, index + 1),
            duplicate,
            ...instances.slice(index + 1),
          ],
        });
      })
    );
    return duplicateId;
  };
}

function createMoveEffectInstance(
  set: VideoEditorProjectSliceSet
): EffectInstanceActions['moveEffectInstance'] {
  return (instanceId, direction) =>
    set((state) =>
      applyProjectUpdate(state, (project) => {
        const instances = [...(project.effectInstances ?? [])];
        const index = instances.findIndex(({ id }) => id === instanceId);
        const instance = instances[index];
        if (!instance || !isEffectInstanceEditable(project, instance)) return project;
        const step = direction === 'up' ? -1 : 1;
        let swapIndex = index + step;
        while (instances[swapIndex] && !sameTarget(instance, instances[swapIndex]!))
          swapIndex += step;
        if (!instances[swapIndex]) return project;
        [instances[index], instances[swapIndex]] = [instances[swapIndex]!, instance];
        return applyVideoProjectMutationPatch(project, { effectInstances: instances });
      })
    );
}

function createUpdateEffectInstance(
  set: VideoEditorProjectSliceSet
): EffectInstanceActions['updateEffectInstance'] {
  return (instanceId, patch) =>
    set((state) =>
      applyProjectUpdate(state, (project) =>
        applyVideoProjectMutationPatch(project, {
          effectInstances: (project.effectInstances ?? []).map((instance) =>
            updateMatchingEffectInstance(project, instance, instanceId, patch)
          ),
        })
      )
    );
}

function updateMatchingEffectInstance(
  project: import('../../../features/video/project/types').VideoProject,
  instance: VideoProjectEffectInstance,
  instanceId: string,
  patch: Parameters<EffectInstanceActions['updateEffectInstance']>[1]
): VideoProjectEffectInstance {
  if (instance.id !== instanceId || !isEffectInstanceEditable(project, instance)) return instance;
  const timed =
    patch.startTime !== undefined || patch.duration !== undefined || patch.rangeMode !== undefined
      ? resizeClipEffectInterval(project, instance, patch)
      : instance;
  return {
    ...timed,
    ...(patch.sceneAnchors ? { sceneAnchors: structuredClone(patch.sceneAnchors) } : {}),
    ...(patch.controls ? { controls: mergeControls(instance.controls, patch.controls) } : {}),
    ...(patch.enabled === undefined ? {} : { enabled: patch.enabled }),
  };
}

function sameTarget(left: VideoProjectEffectInstance, right: VideoProjectEffectInstance): boolean {
  if (left.target.kind !== right.target.kind) return false;
  if (left.target.kind === 'scene') return true;
  if (left.target.kind === 'clip' && right.target.kind === 'clip') {
    return left.target.clipId === right.target.clipId;
  }
  return (
    left.target.kind === 'transition' &&
    right.target.kind === 'transition' &&
    left.target.transitionId === right.target.transitionId
  );
}

function mergeControls(
  current: Record<string, number | string>,
  patch: Partial<Record<string, number | string>>
): Record<string, number | string> {
  const next = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) next[key] = value;
  }
  return next;
}
