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
    const sourceProject = get().project;
    if (!sourceProject) return null;
    const instanceId = crypto.randomUUID();
    const nextProject = await applyEffectCatalogDocument({
      ...args,
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
            selectedClipId: host.id,
            selectedTrackId: host.trackId,
            selection: { clipId: host.id, kind: VideoEditorSelectionKind.CLIP },
          }
        : update;
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
        if (!source || source.kind === 'transition') return project;
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
          startTime: source.startTime + source.duration,
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
        if (!instance) return project;
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
            updateMatchingEffectInstance(instance, instanceId, patch)
          ),
        })
      )
    );
}

function updateMatchingEffectInstance(
  instance: VideoProjectEffectInstance,
  instanceId: string,
  patch: Parameters<EffectInstanceActions['updateEffectInstance']>[1]
): VideoProjectEffectInstance {
  if (instance.id !== instanceId) return instance;
  return {
    ...instance,
    ...(patch.controls ? { controls: mergeControls(instance.controls, patch.controls) } : {}),
    ...(patch.enabled === undefined ? {} : { enabled: patch.enabled }),
    ...(patch.startTime === undefined || instance.kind === 'transition'
      ? {}
      : { startTime: Math.max(0, patch.startTime) }),
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
