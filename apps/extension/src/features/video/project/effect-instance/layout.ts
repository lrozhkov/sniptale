import {
  parseEffectV1Source,
  mapEffectV1ObjectPoint,
  mapEffectV1ScenePoint,
  type EffectV1Document,
} from '@sniptale/runtime-contracts/effect-v1';
import type { VideoProject, VideoProjectClip, VideoProjectTransform } from '../types';

/** Reads immutable authored body geometry; instance controls never own these dimensions. */
export function getEffectClipObjectLayout(project: VideoProject, clip: VideoProjectClip) {
  if (clip.type !== 'EFFECT') return undefined;
  const instance = project.effectInstances?.find(({ id }) => id === clip.effectInstanceId);
  const snapshot = project.effectSnapshots?.find(({ id }) => id === instance?.snapshotId);
  return snapshot ? parseEffectV1Source(snapshot.source).document?.objectLayout : undefined;
}

/** Numeric edits and canvas commits obey the same authored aspect policy. */
export function resolveEffectClipTransformPatch(
  project: VideoProject,
  clip: VideoProjectClip,
  patch: Partial<VideoProjectTransform>,
  limits: { min: number; max: number }
): Partial<VideoProjectTransform> {
  const layout = getEffectClipObjectLayout(project, clip);
  if (layout?.resize !== 'scale') return patch;
  if (patch.width === undefined && patch.height === undefined) return patch;
  const requested =
    patch.width !== undefined ? patch.width / layout.width : patch.height! / layout.height;
  const maximum = limits.max / Math.max(layout.width, layout.height);
  const minimum = Math.min(maximum, limits.min / Math.min(layout.width, layout.height));
  const scale = Math.max(minimum, Math.min(maximum, requested));
  return { ...patch, width: layout.width * scale, height: layout.height * scale };
}

export function initializeEffectSceneAnchors(
  document: EffectV1Document,
  transform: VideoProjectTransform,
  scene: { width: number; height: number }
): Record<string, { x: number; y: number }> | undefined {
  const layout = document.objectLayout;
  if (!layout?.handles?.length) return undefined;
  const defaults = Object.fromEntries(
    document.controls.map((control) => [control.id, control.defaultValue])
  );
  return Object.fromEntries(
    layout.handles.map((handle) => {
      const x = defaults[handle.xControl];
      const y = defaults[handle.yControl];
      if (typeof x !== 'number' || typeof y !== 'number')
        throw new Error('Invalid effect handle default');
      const point = mapEffectV1ObjectPoint(
        layout,
        { ...transform, rotation: (transform.rotation * Math.PI) / 180 },
        { x, y }
      );
      return [
        handle.id,
        {
          x: Math.max(0, Math.min(scene.width, point.x)),
          y: Math.max(0, Math.min(scene.height, point.y)),
        },
      ];
    })
  );
}

export function resolveEffectObjectControls(
  document: EffectV1Document,
  instance: NonNullable<VideoProject['effectInstances']>[number],
  transform: VideoProjectTransform
): Record<string, number | string> {
  const controls = {
    ...Object.fromEntries(document.controls.map((control) => [control.id, control.defaultValue])),
    ...instance.controls,
  };
  const layout = document.objectLayout;
  if (!layout?.handles) return controls;
  for (const handle of layout.handles) {
    const point = instance.sceneAnchors?.[handle.id];
    if (!point) throw new Error('Missing effect scene anchor');
    const local = mapEffectV1ScenePoint(
      layout,
      { ...transform, rotation: (transform.rotation * Math.PI) / 180 },
      point
    );
    controls[handle.xControl] = local.x;
    controls[handle.yControl] = local.y;
  }
  return controls;
}
