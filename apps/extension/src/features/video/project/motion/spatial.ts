import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';

export type CameraBackgroundZoomBehavior = 'fixed' | 'follow-video' | 'window' | 'content';

/** Admit only the authored camera modes supported by both renderers. */
export function parseCameraBackgroundZoomBehavior(
  value: unknown
): CameraBackgroundZoomBehavior | null {
  return value === 'window' || value === 'content' || value === 'fixed' || value === 'follow-video'
    ? value
    : null;
}

/** Shared window policy; each editor resolves its own topology and effective background state. */
export function resolveCameraWindowWeight(
  behavior: CameraBackgroundZoomBehavior | undefined,
  follows: boolean,
  spatial: boolean
): 'window' | 'content' | 'spatial' {
  if (behavior === 'window' || follows) return 'window';
  return behavior === 'content' || !spatial ? 'content' : 'spatial';
}

export interface CameraPerspective {
  enabled: boolean;
  rotateX: number;
  rotateY: number;
  rotateZ: number;
  strength: number;
}

export interface CameraDepthOfField {
  enabled: boolean;
  mode: 'area' | 'depth';
  x: number;
  y: number;
  width: number;
  softness: number;
  strength: number;
}

export type SpatialQuaternion = readonly [number, number, number, number];
/** Disposable evaluated pose; never admitted from persisted camera objects. */
export interface CameraSpatialFrame {
  rotation: SpatialQuaternion;
  perspective: number;
  windowMotion: number;
  lockBackground: boolean;
  focus: readonly { settings: CameraDepthOfField; weight: number }[];
}

/** Spatial coordinates in the consuming scene plane. */
export interface CameraSpatialRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Authored settings only; clocks and scene coordinates belong to each editor. */
export interface CameraSpatialSettings {
  perspective?: CameraPerspective;
  depthOfField?: CameraDepthOfField;
}

export const DEFAULT_CAMERA_PERSPECTIVE: CameraPerspective = {
  enabled: false,
  rotateX: 0,
  rotateY: 0,
  rotateZ: 0,
  strength: 0.5,
};
export const DEFAULT_CAMERA_DEPTH: CameraDepthOfField = {
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
export function hasCameraPerspective(
  value: CameraPerspective | undefined
): value is CameraPerspective {
  return !!value?.enabled && (value.rotateX !== 0 || value.rotateY !== 0 || value.rotateZ !== 0);
}
const bounded = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;

/** Optional settings are strict at workspace/history/import admission. */
export function parseCameraPerspective(value: unknown): CameraPerspective | null | undefined {
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
export function parseCameraDepth(value: unknown): CameraDepthOfField | null | undefined {
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

function rotation(value: CameraPerspective | undefined): SpatialQuaternion {
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
  from: CameraPerspective | undefined,
  to: CameraPerspective | undefined,
  t: number
): SpatialQuaternion {
  const a = from?.enabled ? from : DEFAULT_CAMERA_PERSPECTIVE;
  const b = to?.enabled ? to : DEFAULT_CAMERA_PERSPECTIVE;
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
export function interpolateCameraSpatial(
  from: CameraSpatialSettings | null,
  to: CameraSpatialSettings,
  progress: number
): CameraSpatialFrame {
  const a = hasCameraPerspective(from?.perspective) ? from.perspective : undefined,
    b = hasCameraPerspective(to.perspective) ? to.perspective : undefined;
  const t = Math.max(0, Math.min(1, progress));
  const start = a?.enabled ? a.strength : 0;
  const end = b?.enabled ? b.strength : 0;
  const focus: { settings: CameraDepthOfField; weight: number }[] = [];
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

/** Normalized project-canvas reference; source binding retains its time-only meaning. */
export interface MotionSpatialSettings extends CameraSpatialSettings {
  spatialReference?: CameraSpatialRect;
}
export type MotionSpatialEdit =
  | ({ kind: 'perspective' } & Partial<CameraPerspective>)
  | ({ kind: 'depth' } & Partial<CameraDepthOfField>)
  | ({ kind: 'reference'; reset?: boolean } & Partial<CameraSpatialRect>);

/** Floating addition at the normalized edge may differ by at most 1e-9. */
export function parseMotionSpatialReference(value: unknown): CameraSpatialRect | null | undefined {
  if (value === undefined) return undefined;
  if (
    !isRecord(value) ||
    !bounded(value['x'], 0, 1) ||
    !bounded(value['y'], 0, 1) ||
    !bounded(value['width'], 0, 1) ||
    value['width'] === 0 ||
    !bounded(value['height'], 0, 1) ||
    value['height'] === 0 ||
    value['x'] + value['width'] > 1 + 1e-9 ||
    value['y'] + value['height'] > 1 + 1e-9
  )
    return null;
  return { x: value['x'], y: value['y'], width: value['width'], height: value['height'] };
}

/** Validate and merge scalar settings under the current project updater. */
export function editMotionSpatialSettings(
  settings: MotionSpatialSettings,
  edit: unknown
): MotionSpatialSettings | null {
  if (!isRecord(edit)) return null;
  const { kind, reset, ...fields } = edit;
  if (kind === 'perspective') {
    const keys = ['enabled', 'rotateX', 'rotateY', 'rotateZ', 'strength'] as const;
    if (reset !== undefined || !keys.some((key) => key in fields)) return null;
    const current = settings.perspective ?? DEFAULT_CAMERA_PERSPECTIVE;
    const next = parseCameraPerspective({ ...current, ...fields });
    if (!next) return null;
    return keys.every((key) => current[key] === next[key])
      ? settings
      : { ...settings, perspective: next };
  }
  if (kind === 'depth') {
    const keys = ['enabled', 'mode', 'x', 'y', 'width', 'softness', 'strength'] as const;
    if (reset !== undefined || !keys.some((key) => key in fields)) return null;
    const current = settings.depthOfField ?? DEFAULT_CAMERA_DEPTH;
    const next = parseCameraDepth({ ...current, ...fields });
    if (!next) return null;
    return keys.every((key) => current[key] === next[key])
      ? settings
      : { ...settings, depthOfField: next };
  }
  if (kind !== 'reference' || (reset !== undefined && typeof reset !== 'boolean')) return null;
  const keys = ['x', 'y', 'width', 'height'] as const;
  if (reset === true) {
    if (keys.some((key) => key in fields)) return null;
    if (settings.spatialReference === undefined) return settings;
    const { spatialReference: _reference, ...retained } = settings;
    return retained;
  }
  if (!keys.some((key) => key in fields)) return null;
  const current = settings.spatialReference ?? { x: 0, y: 0, width: 1, height: 1 };
  const next = parseMotionSpatialReference({ ...current, ...fields });
  if (!next) return null;
  return keys.every((key) => current[key] === next[key])
    ? settings
    : { ...settings, spatialReference: next };
}
