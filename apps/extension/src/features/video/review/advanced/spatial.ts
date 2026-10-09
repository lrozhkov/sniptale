import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { quickEditFocusType, resolveQuickEditFocusLink } from './focus-layout';
import type {
  QuickEditCameraTransform,
  QuickEditDepthOfField,
  QuickEditPerspective,
  QuickEditSpatialFrame,
  QuickEditZoomRegion,
  SpatialQuaternion,
} from './types';
export type {
  QuickEditDepthOfField,
  QuickEditPerspective,
  QuickEditSpatialFrame,
  SpatialQuaternion,
} from './types';

export const DEFAULT_QUICK_EDIT_PERSPECTIVE: QuickEditPerspective = {
  enabled: false,
  rotateX: 0,
  rotateY: 0,
  rotateZ: 0,
  strength: 0.5,
};
export const DEFAULT_QUICK_EDIT_DEPTH: QuickEditDepthOfField = {
  enabled: false,
  mode: 'depth',
  x: 0.5,
  y: 0.5,
  width: 0.2,
  softness: 0.3,
  strength: 0.5,
};
const identityRotation: SpatialQuaternion = [0, 0, 0, 1];

/** An enabled neutral pose has no spatial transform and must not change framing or GPU admission. */
export function hasQuickEditPerspective(
  value: QuickEditPerspective | undefined
): value is QuickEditPerspective {
  return !!value?.enabled && (value.rotateX !== 0 || value.rotateY !== 0 || value.rotateZ !== 0);
}
const bounded = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;

/** Optional settings are strict at workspace/history/import admission. */
export function parseQuickEditPerspective(value: unknown): QuickEditPerspective | null | undefined {
  if (value === undefined) return undefined;
  if (
    !isRecord(value) ||
    typeof value['enabled'] !== 'boolean' ||
    !bounded(value['rotateX'], -60, 60) ||
    !bounded(value['rotateY'], -60, 60) ||
    !bounded(value['rotateZ'], -180, 180) ||
    !bounded(value['strength'], 0, 1)
  )
    return null;
  return {
    enabled: value['enabled'],
    rotateX: value['rotateX'],
    rotateY: value['rotateY'],
    rotateZ: value['rotateZ'],
    strength: value['strength'],
  };
}

/** Area is window-normalized; depth uses the same point on the decorated plane. */
export function parseQuickEditDepth(value: unknown): QuickEditDepthOfField | null | undefined {
  if (value === undefined) return undefined;
  if (
    !isRecord(value) ||
    typeof value['enabled'] !== 'boolean' ||
    (value['mode'] !== 'area' && value['mode'] !== 'depth') ||
    !bounded(value['x'], 0, 1) ||
    !bounded(value['y'], 0, 1) ||
    !bounded(value['width'], 0, 1) ||
    !bounded(value['softness'], 0.01, 1) ||
    !bounded(value['strength'], 0, 1)
  )
    return null;
  return {
    enabled: value['enabled'],
    mode: value['mode'],
    x: value['x'],
    y: value['y'],
    width: value['width'],
    softness: value['softness'],
    strength: value['strength'],
  };
}

function rotation(value: QuickEditPerspective | undefined): SpatialQuaternion {
  if (!value?.enabled) return identityRotation;
  const [x, y, z] = [value.rotateX, value.rotateY, value.rotateZ].map((v) => (v * Math.PI) / 360);
  const sx = Math.sin(x!),
    cx = Math.cos(x!);
  const sy = Math.sin(y!),
    cy = Math.cos(y!);
  const sz = Math.sin(z!),
    cz = Math.cos(z!);
  // Rz * Ry * Rx, represented as a unit quaternion.
  return [
    sx * cy * cz - cx * sy * sz,
    cx * sy * cz + sx * cy * sz,
    cx * cy * sz - sx * sy * cz,
    cx * cy * cz + sx * sy * sz,
  ];
}

/** Bounded tilt axes keep the whole path front-facing; roll crosses ±180 by the short arc. */
function interpolateRotation(
  from: QuickEditPerspective | undefined,
  to: QuickEditPerspective | undefined,
  t: number
): SpatialQuaternion {
  const a = from?.enabled ? from : DEFAULT_QUICK_EDIT_PERSPECTIVE;
  const b = to?.enabled ? to : DEFAULT_QUICK_EDIT_PERSPECTIVE;
  const rollDelta = ((b.rotateZ - a.rotateZ + 540) % 360) - 180;
  return rotation({
    enabled: true,
    rotateX: a.rotateX + (b.rotateX - a.rotateX) * t,
    rotateY: a.rotateY + (b.rotateY - a.rotateY) * t,
    rotateZ: a.rotateZ + rollDelta * t,
    strength: 0,
  });
}

/** Absolute targets blend once; a disabled endpoint contributes identity and zero blur. */
export function interpolateQuickEditSpatial(
  from: QuickEditZoomRegion | null,
  to: QuickEditZoomRegion,
  progress: number
): QuickEditSpatialFrame {
  const a = hasQuickEditPerspective(from?.perspective) ? from.perspective : undefined,
    b = hasQuickEditPerspective(to.perspective) ? to.perspective : undefined;
  const t = Math.max(0, Math.min(1, progress));
  const start = a?.enabled ? a.strength : 0;
  const end = b?.enabled ? b.strength : 0;
  const focus: { settings: QuickEditDepthOfField; weight: number }[] = [];
  if (from?.depthOfField?.enabled && t < 1)
    focus.push({ settings: from.depthOfField, weight: 1 - t });
  if (to.depthOfField?.enabled && t > 0) focus.push({ settings: to.depthOfField, weight: t });
  if (
    from?.depthOfField?.enabled &&
    to.depthOfField?.enabled &&
    from.depthOfField.mode === to.depthOfField.mode
  ) {
    const left = from.depthOfField,
      right = to.depthOfField;
    const mix = (x: number, y: number) => x + (y - x) * t;
    focus.splice(0, focus.length, {
      weight: 1,
      settings: {
        ...right,
        x: mix(left.x, right.x),
        y: mix(left.y, right.y),
        width: mix(left.width, right.width),
        softness: mix(left.softness, right.softness),
        strength: mix(left.strength, right.strength),
      },
    });
  }
  return {
    rotation: interpolateRotation(a, b, t),
    perspective: start + (end - start) * t,
    windowMotion: (a?.enabled ? 1 - t : 0) + (b?.enabled ? t : 0),
    lockBackground: !!(a?.enabled || b?.enabled),
    focus,
  };
}

/** Fixed-background spans use the complete projected topology, including ordinary linked zooms. */
export function quickEditSpatialSpan(
  regions: readonly QuickEditZoomRegion[],
  time: number
): boolean {
  const active = regions
    .filter((r) => !r.dormant && quickEditFocusType(r) === 'zoom')
    .toSorted((a, b) => a.start - b.start);
  let start = 0;
  while (start < active.length) {
    let end = start;
    while (end + 1 < active.length) {
      const current = active[end]!,
        next = active[end + 1]!;
      const linked = resolveQuickEditFocusLink(regions, current.id)?.target.id === next.id;
      if (!linked && current.end !== next.start) break;
      end++;
    }
    if (
      time >= active[start]!.start &&
      time < active[end]!.end &&
      active.slice(start, end + 1).some((r) => hasQuickEditPerspective(r.perspective))
    )
      return true;
    start = end + 1;
  }
  return false;
}

/** Target authoring deliberately bypasses enter/exit without altering saved timing. */
export function quickEditSpatialTargetCamera(
  region: QuickEditZoomRegion
): QuickEditCameraTransform {
  if (
    quickEditFocusType(region) !== 'zoom' ||
    (!hasQuickEditPerspective(region.perspective) && !region.depthOfField?.enabled)
  )
    return region.transform;
  return { ...region.transform, spatial: interpolateQuickEditSpatial(null, region, 1) };
}
