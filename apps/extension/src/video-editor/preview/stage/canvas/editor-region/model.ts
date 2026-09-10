import {
  resolveEffectV1EditorRegion,
  updateEffectV1EditorRegion,
  type EffectV1RegionRect,
} from '@sniptale/runtime-contracts/effect-v1';
import { readEffectPresentationDocument } from '../../../../../features/video/project/effect-bundle/presentation-document';
import { resolveEffectOwner } from '../../../../../features/video/project/effect-instance/owner';
import { resolveEffectRuntimeFramePlans } from '../../../../../features/video/composition/effect-runtime/frame/plan';
import type { VideoProject } from '../../../../../features/video/project/types';

/** Use the renderer's input stage: clip-local fitted pixels or the already camera-composited group. */
export function resolveEditorRegionModel(project: VideoProject, instanceId: string, time: number) {
  const instance = project.effectInstances?.find((item) => item.id === instanceId);
  if (!instance || instance.kind !== 'targetEffect') return null;
  const owner = resolveEffectOwner(project, instance.target);
  if (!owner || owner.locked || !owner.visible || owner.bypassed) return null;
  const snapshot = project.effectSnapshots?.find((item) => item.id === instance.snapshotId);
  const document = snapshot && readEffectPresentationDocument(snapshot.source).document;
  if (!document?.editorRegion) return null;
  const plan = resolveEffectRuntimeFramePlans(project, time).find(
    (item) => item.effectInstanceId === instanceId
  );
  if (!plan) return null;
  const rect = resolveEffectV1EditorRegion(document, instance.controls, plan.dimensions);
  if (!rect) return null;
  const targetClipId = plan.target.kind === 'clip' ? plan.target.clipId : null;
  const clip = targetClipId ? project.clips.find((item) => item.id === targetClipId) : null;
  const placement =
    plan.target.kind === 'clip'
      ? plan.target.placement
      : {
          x: 0,
          y: 0,
          width: project.width,
          height: project.height,
          rotation: 0,
        };
  return {
    instance,
    document,
    rect,
    size: plan.dimensions,
    placement,
    clip,
    offset: {
      x: (plan.bitmapBounds?.x ?? 0) * placement.width,
      y: (plan.bitmapBounds?.y ?? 0) * placement.height,
    },
  };
}
export type EditorRegionModel = NonNullable<ReturnType<typeof resolveEditorRegionModel>>;

export function mapRegionPoint(
  model: EditorRegionModel,
  point: { x: number; y: number },
  inverse = false
) {
  const p = model.placement;
  const angle = ((p.rotation * Math.PI) / 180) * (inverse ? -1 : 1);
  const x = inverse ? point.x - p.x - p.width / 2 : point.x + model.offset.x - p.width / 2;
  const y = inverse ? point.y - p.y - p.height / 2 : point.y + model.offset.y - p.height / 2;
  const rotated = {
    x: x * Math.cos(angle) - y * Math.sin(angle),
    y: x * Math.sin(angle) + y * Math.cos(angle),
  };
  return inverse
    ? { x: rotated.x + p.width / 2 - model.offset.x, y: rotated.y + p.height / 2 - model.offset.y }
    : { x: rotated.x + p.x + p.width / 2, y: rotated.y + p.y + p.height / 2 };
}

/** Clamp dimensions first so a west/north resize keeps the opposite edge fixed at size limits. */
export function resizeEditorRegion(model: EditorRegionModel, mode: string, dx: number, dy: number) {
  const start = model.rect;
  const proposed: EffectV1RegionRect =
    mode === 'move'
      ? { ...start, x: start.x + dx, y: start.y + dy }
      : {
          ...start,
          width: Math.max(0.001, start.width + (mode.includes('w') ? -dx : dx)),
          height: Math.max(0.001, start.height + (mode.includes('n') ? -dy : dy)),
        };
  if (mode !== 'move') {
    const pad = model.document.editorRegion!.inset * Math.min(model.size.width, model.size.height);
    proposed.width = Math.min(
      proposed.width,
      mode.includes('w') ? start.x + start.width - pad : model.size.width - pad - start.x
    );
    proposed.height = Math.min(
      proposed.height,
      mode.includes('n') ? start.y + start.height - pad : model.size.height - pad - start.y
    );
    const bounded = resolveEffectV1EditorRegion(
      model.document,
      updateEffectV1EditorRegion(model.document, model.instance.controls, proposed, model.size),
      model.size
    )!;
    proposed.width = bounded.width;
    proposed.height = bounded.height;
    if (mode.includes('w')) proposed.x = start.x + start.width - proposed.width;
    if (mode.includes('n')) proposed.y = start.y + start.height - proposed.height;
  }
  return updateEffectV1EditorRegion(model.document, model.instance.controls, proposed, model.size);
}
