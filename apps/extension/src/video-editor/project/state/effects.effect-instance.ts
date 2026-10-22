import {
  resolveEffectSourceInterval,
  activateRetainedEffectHost,
} from '../../../features/video/project/effect-instance/placement';
import { readEffectPresentationDocument } from '../../../features/video/project/effect-bundle/presentation-document';
import { transformReviewAnnotationEffectAttachment } from '../../../features/video/review/annotation-effects/layout';
import { resolveVideoCompositionFrame } from '../../../features/video/composition/timeline/frame';
import { resolveEffectSourceProjection } from '../../../features/video/composition/motion/source-window';
import { motionCameraProjection } from '../../../features/video/composition/motion/spatial';
import { shouldLockVisualLayerToViewport } from '../../../features/video/composition/motion/layer-camera';
import {
  invertQuickEditProjection,
  multiplyQuickEditProjections,
  projectQuickEditPoint,
  type QuickEditHomography,
} from '../../../features/video/composition/motion/spatial-geometry';
import { resolveEffectSourceClip } from '../../../features/video/project/effect-instance/placement';
import type { VideoProject, VideoProjectEffectClip } from '../../../features/video/project/types';
import { isExportReadyVideoProject } from '../../../features/video/project/validation/root';
import { resolveEffectApplicationTarget } from './effects.junction';
import { resolveEffectOwner } from '../../../features/video/project/effect-instance/owner';
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
  | 'setEffectTargetBypassed'
  | 'setClipEffectsBypassed'
  | 'applyEffectDocument'
  | 'deleteEffectInstance'
  | 'duplicateEffectInstance'
  | 'moveEffectInstance'
  | 'restoreEffectSourceRange'
  | 'updateEffectAttachment'
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
              : target.kind === 'track'
                ? target.trackId
                : null,
        };
      }),
    setEffectTargetBypassed: (target, bypassed) =>
      set((state) =>
        applyProjectUpdate(state, (project) => {
          const owner = resolveEffectOwner(project, target);
          if (!owner || owner.locked) return project;
          if (target.kind === 'video-group') return { ...project, videoEffectsBypassed: bypassed };
          if (target.kind === 'track')
            return {
              ...project,
              tracks: project.tracks.map((track) =>
                track.id === target.trackId ? { ...track, effectsBypassed: bypassed } : track
              ),
            };
          if (target.kind === 'clip')
            return {
              ...project,
              clips: project.clips.map((clip) =>
                clip.id === target.clipId ? { ...clip, effectsBypassed: bypassed } : clip
              ),
            };
          return project;
        })
      ),
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
    restoreEffectSourceRange: (instanceId) => {
      let accepted = false;
      set((state) => {
        const project = state.project;
        if (!project) return {};
        const plan = planEffectSourceRangeRestore(project, instanceId);
        if (!plan) return {};
        accepted = true;
        return applyProjectUpdate(state, () =>
          applyVideoProjectMutationPatch(project, {
            clips: project.clips.map((clip) => (clip.id === plan.host.id ? plan.host : clip)),
            effectInstances: (project.effectInstances ?? []).map((instance) =>
              instance.id === instanceId ? plan.instance : instance
            ),
          })
        );
      });
      return accepted;
    },
    updateEffectAttachment: (instanceId, attachment) => {
      let accepted = false;
      set((state) => {
        const project = state.project;
        if (!project) return {};
        const plan = planEffectAttachmentChange(project, instanceId, attachment, state.currentTime);
        if (!plan) return {};
        accepted = true;
        return applyProjectUpdate(state, () =>
          applyVideoProjectMutationPatch(project, {
            clips: project.clips.map((clip) => (clip.id === plan.host.id ? plan.host : clip)),
            effectInstances: (project.effectInstances ?? []).map((instance) =>
              instance.id === instanceId
                ? { ...instance, ...(plan.anchors ? { sceneAnchors: plan.anchors } : {}) }
                : instance
            ),
          })
        );
      });
      return accepted;
    },
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
    const resolved = resolveEffectApplicationTarget(sourceProject, args.target);
    const nextProject = await applyEffectCatalogDocument({
      ...args,
      ...(trackId === undefined ? {} : { trackId }),
      instanceId,
      project: resolved.project,
      target: resolved.target,
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
        : resolved.target.kind === 'transition'
          ? {
              ...update,
              selection: {
                kind: VideoEditorSelectionKind.TRANSITION_JUNCTION,
                transitionId: resolved.target.transitionId,
              },
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
  if (left.target.kind === 'scene' || left.target.kind === 'video-group') return true;
  if (left.target.kind === 'track' && right.target.kind === 'track')
    return left.target.trackId === right.target.trackId;
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

/** Plans one attachment change using the renderer's current source and camera planes. */
export function planEffectAttachmentChange(
  project: VideoProject,
  instanceId: string,
  attachment: NonNullable<VideoProjectEffectClip['attachment']>,
  time: number
) {
  const instance = project.effectInstances?.find((entry) => entry.id === instanceId);
  const host = project.clips.find(
    (clip): clip is VideoProjectEffectClip =>
      clip.type === 'EFFECT' && clip.effectInstanceId === instanceId
  );
  if (
    !host?.attachment ||
    !instance ||
    instance.kind !== 'standalone' ||
    !isEffectInstanceEditable(project, instance)
  )
    return null;
  if (
    host.attachment.kind === attachment.kind &&
    (attachment.kind === 'viewport' ||
      (host.attachment.kind === 'source' &&
        host.attachment.assetId === attachment.assetId &&
        host.attachment.sourceInstanceId === attachment.sourceInstanceId))
  )
    return null;
  const canonical: NonNullable<VideoProjectEffectClip['attachment']> =
    attachment.kind === 'viewport'
      ? { kind: 'viewport' }
      : {
          kind: 'source',
          assetId: attachment.assetId,
          sourceInstanceId: attachment.sourceInstanceId,
        };
  const nextHost = { ...host, attachment: canonical };
  const from = effectAttachmentPlane(project, host, time);
  const to = effectAttachmentPlane(
    { ...project, clips: project.clips.map((clip) => (clip.id === host.id ? nextHost : clip)) },
    nextHost,
    time
  );
  const inverse = to && invertQuickEditProjection(to.matrix);
  if (!from || !to || !inverse) return null;
  const mapping = multiplyQuickEditProjections(inverse, from.matrix);
  const transform = transformReviewAnnotationEffectAttachment(
    {
      x: host.transform.x / from.width,
      y: host.transform.y / from.height,
      width: host.transform.width / from.width,
      height: host.transform.height / from.height,
      rotation: (host.transform.rotation * Math.PI) / 180,
    },
    from,
    to,
    mapping
  );
  if (!transform) return null;
  const anchors: Record<string, { x: number; y: number }> = {};
  for (const [id, point] of Object.entries(instance.sceneAnchors ?? {})) {
    const mapped = projectQuickEditPoint(mapping, point);
    if (!mapped) return null;
    anchors[id] = mapped;
  }
  const result = {
    host: {
      ...nextHost,
      transform: {
        ...host.transform,
        x: transform.x * to.width,
        y: transform.y * to.height,
        width: transform.width * to.width,
        height: transform.height * to.height,
        rotation: (transform.rotation * 180) / Math.PI,
      },
    },
    ...(instance.sceneAnchors ? { anchors } : {}),
  };
  const candidate = {
    ...project,
    clips: project.clips.map((clip) => (clip.id === host.id ? result.host : clip)),
    effectInstances: (project.effectInstances ?? []).map((entry) =>
      entry.id === instanceId
        ? { ...entry, ...(result.anchors ? { sceneAnchors: result.anchors } : {}) }
        : entry
    ),
  };
  return isExportReadyVideoProject(candidate) ? result : null;
}

function effectAttachmentPlane(project: VideoProject, host: VideoProjectEffectClip, time: number) {
  const frame = resolveVideoCompositionFrame(project, time);
  const layer = frame.visualLayers.find((entry) => entry.clipId === host.id);
  if (!layer || layer.kind !== 'effect') return null;
  const source =
    host.attachment?.kind === 'source' ? resolveEffectSourceClip(project, host, time) : undefined;
  const asset = source && project.assets.find((entry) => entry.id === source.assetId);
  if (
    host.attachment?.kind === 'source' &&
    (!source ||
      !asset ||
      project.tracks.some((track) => track.id === source.trackId && track.role === 'CAMERA'))
  )
    return null;
  const sourceMatrix =
    host.attachment?.kind === 'source'
      ? resolveEffectSourceProjection(project, host, frame.camera, time)
      : ([1, 0, 0, 0, 1, 0, 0, 0, 1] satisfies QuickEditHomography);
  if (!sourceMatrix) return null;
  const camera = frame.camera;
  const outer: QuickEditHomography | null = shouldLockVisualLayerToViewport(layer, camera)
    ? [1, 0, 0, 0, 1, 0, 0, 0, 1]
    : camera.spatial
      ? motionCameraProjection(camera)
      : [
          camera.scale,
          0,
          -camera.viewportX * camera.scale,
          0,
          camera.scale,
          -camera.viewportY * camera.scale,
          0,
          0,
          1,
        ];
  return outer
    ? {
        width: asset?.metadata.width ?? project.width,
        height: asset?.metadata.height ?? project.height,
        matrix: multiplyQuickEditProjections(outer, sourceMatrix),
      }
    : null;
}

/** Explicitly restores the ordinary Native interval from the retained source recipe. */
export function planEffectSourceRangeRestore(project: VideoProject, instanceId: string) {
  const host = project.clips.find(
    (clip): clip is VideoProjectEffectClip =>
      clip.type === 'EFFECT' && clip.effectInstanceId === instanceId
  );
  const instance = project.effectInstances?.find((entry) => entry.id === instanceId);
  if (
    !host?.sourceRange ||
    !instance ||
    instance.kind !== 'standalone' ||
    !isEffectInstanceEditable(project, instance)
  )
    return null;
  const interval = resolveEffectSourceInterval(project, host);
  const snapshot = project.effectSnapshots?.find((entry) => entry.id === instance.snapshotId);
  const document = snapshot && readEffectPresentationDocument(snapshot.source).document;
  if (!interval || !document) return null;
  const duration = interval.end - interval.start;
  const playbackRate = document.duration / duration;
  if (
    !host.sourceRange.dormant &&
    Math.abs(host.startTime - interval.start) <= 1e-7 &&
    Math.abs(host.duration - duration) <= 1e-7 &&
    Math.abs(instance.sourceStart ?? 0) <= 1e-7 &&
    Math.abs(instance.playbackRate - playbackRate) <= 1e-7
  )
    return null;
  const restored = { ...activateRetainedEffectHost(host), startTime: interval.start, duration };
  const timed = { ...instance, startTime: interval.start, duration, sourceStart: 0, playbackRate };
  return isExportReadyVideoProject({
    ...project,
    clips: project.clips.map((clip) => (clip.id === host.id ? restored : clip)),
    effectInstances: (project.effectInstances ?? []).map((entry) =>
      entry.id === instanceId ? timed : entry
    ),
  })
    ? { host: restored, instance: timed }
    : null;
}
