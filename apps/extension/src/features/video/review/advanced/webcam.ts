import { parseQuickEditShadow } from './shadow-validation';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import {
  DEFAULT_CAMERA_APPEARANCE,
  cameraWindowFrame,
  isCameraAppearance,
  type CameraAppearance,
} from '../../project/camera/appearance';
import { isBoundedNumber } from '../../project/validation/primitives';

/** Normalized against the complete output scene, independently of Focus transforms. */
export interface QuickEditWebcamPlacement {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type QuickEditWebcamCrop = Pick<CameraAppearance, 'zoom' | 'panX' | 'panY'>;

interface QuickEditWebcamPosition {
  id: string;
  /** Original main-video seconds; cuts and speeds never rewrite this anchor. */
  time: number;
  placement: QuickEditWebcamPlacement;
  crop?: QuickEditWebcamCrop;
  transition: { type: 'none' | 'ease-in-out' | 'shrink'; duration: number };
}

interface QuickEditWebcamHiddenRange {
  id: string;
  start: number;
  end: number;
}

/** Authored camera content. Disabled content still retains its immutable source. */
export interface QuickEditWebcam {
  assetId: string;
  enabled: boolean;
  /** Positive values delay the camera: cameraTime = mainSourceTime - offsetSeconds. */
  offsetSeconds: number;
  mirrored: boolean;
  appearance: CameraAppearance;
  shadow?: { intensity: number; color: string };
  placement: QuickEditWebcamPlacement;
  positions: QuickEditWebcamPosition[];
  hiddenRanges: QuickEditWebcamHiddenRange[];
}

const MAX_TIME = 86_400;
const MAX_ITEMS = 512;
const identity = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 256 && value.trim() === value;

function parsePlacement(value: unknown): QuickEditWebcamPlacement | null {
  if (
    !isRecord(value) ||
    !isBoundedNumber(value['x'], 0, 1) ||
    !isBoundedNumber(value['y'], 0, 1) ||
    !isBoundedNumber(value['width'], Number.EPSILON, 1) ||
    !isBoundedNumber(value['height'], Number.EPSILON, 1) ||
    value['x'] + value['width'] > 1 + 1e-9 ||
    value['y'] + value['height'] > 1 + 1e-9
  )
    return null;
  return { x: value['x'], y: value['y'], width: value['width'], height: value['height'] };
}

function parsePosition(value: unknown): QuickEditWebcamPosition | null {
  if (
    !isRecord(value) ||
    !identity(value['id']) ||
    !isBoundedNumber(value['time'], 0.001, MAX_TIME)
  )
    return null;
  const placement = parsePlacement(value['placement']);
  const transition = value['transition'];
  if (
    !placement ||
    !isRecord(transition) ||
    (transition['type'] !== 'none' &&
      transition['type'] !== 'ease-in-out' &&
      transition['type'] !== 'shrink') ||
    !isBoundedNumber(transition['duration'], 0, 60)
  )
    return null;
  const crop = value['crop'];
  if (crop !== undefined && !isWebcamCrop(crop)) return null;
  return {
    ...(crop === undefined ? {} : { crop: { zoom: crop.zoom, panX: crop.panX, panY: crop.panY } }),
    id: value['id'],
    time: value['time'],
    placement,
    transition: { type: transition['type'], duration: transition['duration'] },
  };
}

function parseHiddenRange(value: unknown): QuickEditWebcamHiddenRange | null {
  if (
    !isRecord(value) ||
    !identity(value['id']) ||
    !isBoundedNumber(value['start'], 0, MAX_TIME) ||
    !isBoundedNumber(value['end'], 0, MAX_TIME) ||
    value['start'] >= value['end']
  )
    return null;
  return { id: value['id'], start: value['start'], end: value['end'] };
}

function parseItems<T extends { id: string }>(
  value: unknown,
  parse: (item: unknown) => T | null,
  follows: (previous: T, next: T) => boolean
): T[] | null {
  if (!Array.isArray(value) || value.length > MAX_ITEMS) return null;
  const result: T[] = [];
  const ids = new Set<string>();
  for (const raw of value) {
    const item = parse(raw);
    const previous = result.at(-1);
    if (!item || ids.has(item.id) || (previous && !follows(previous, item))) return null;
    ids.add(item.id);
    result.push(item);
  }
  return result;
}

/** Strict persisted boundary: malformed present camera content never disappears silently. */
export function parseQuickEditWebcam(value: unknown): QuickEditWebcam | null {
  if (
    !isRecord(value) ||
    !identity(value['assetId']) ||
    !value['assetId'].startsWith('project-asset:') ||
    value['assetId'].length === 'project-asset:'.length ||
    typeof value['enabled'] !== 'boolean' ||
    typeof value['mirrored'] !== 'boolean' ||
    !isBoundedNumber(value['offsetSeconds'], -MAX_TIME, MAX_TIME) ||
    !isCameraAppearance(value['appearance'])
  )
    return null;
  const placement = parsePlacement(value['placement']);
  const positions = parseItems(value['positions'], parsePosition, (a, b) => a.time < b.time);
  const hiddenRanges = parseItems(
    value['hiddenRanges'],
    parseHiddenRange,
    (a, b) => a.end <= b.start
  );
  if (!placement || !positions || !hiddenRanges) return null;
  const appearance = value['appearance'];
  const shadow = value['shadow'];
  let parsedShadow: QuickEditWebcam['shadow'];
  if (shadow !== undefined) {
    const parsed = parseQuickEditShadow(shadow);
    if (!parsed) return null;
    parsedShadow = parsed;
  }
  return {
    assetId: value['assetId'],
    enabled: value['enabled'],
    offsetSeconds: value['offsetSeconds'],
    mirrored: value['mirrored'],
    appearance: {
      shape: appearance.shape,
      roundness: appearance.roundness,
      zoom: appearance.zoom,
      panX: appearance.panX,
      panY: appearance.panY,
    },
    ...(parsedShadow ? { shadow: parsedShadow } : {}),
    placement,
    positions,
    hiddenRanges,
  };
}

/** Default overlay preserves camera aspect while staying inside the complete scene. */
export function createQuickEditWebcam(
  assetId: string,
  source: { width: number; height: number },
  scene: { width: number; height: number }
): QuickEditWebcam {
  const aspect = (source.height / source.width) * (scene.width / scene.height);
  const width = Math.min(0.24, 0.94 / aspect);
  const height = width * aspect;
  return {
    assetId,
    enabled: true,
    offsetSeconds: 0,
    mirrored: false,
    appearance: { ...DEFAULT_CAMERA_APPEARANCE, roundness: 20 },
    placement: { x: 0.97 - width, y: 0.97 - height, width, height },
    positions: [],
    hiddenRanges: [],
  };
}

/** Evaluates authored layout without camera coverage, so hidden positions remain editable. */
export function quickEditWebcamPlacementAt(webcam: QuickEditWebcam, sourceTime: number) {
  const index = webcam.positions.findLastIndex((position) => position.time <= sourceTime);
  const current = webcam.positions[index];
  if (!current) return webcam.placement;
  const previous = webcam.positions[index - 1]?.placement ?? webcam.placement;
  const duration = Math.min(
    current.transition.duration,
    (webcam.positions[index + 1]?.time ?? Infinity) - current.time
  );
  const progress =
    current.transition.type === 'none' || duration === 0
      ? 1
      : Math.min(1, Math.max(0, (sourceTime - current.time) / duration));
  if (progress === 1) return current.placement;
  if (progress === 0) return previous;
  const eased = progress * progress * (3 - 2 * progress);
  const mix = (a: number, b: number) => a + (b - a) * eased;
  const scale =
    current.transition.type === 'shrink' ? 1 - 0.55 * Math.sin(Math.PI * progress) ** 2 : 1;
  const width = mix(previous.width, current.placement.width) * scale;
  const height = mix(previous.height, current.placement.height) * scale;
  return {
    x:
      mix(previous.x + previous.width / 2, current.placement.x + current.placement.width / 2) -
      width / 2,
    y:
      mix(previous.y + previous.height / 2, current.placement.y + current.placement.height / 2) -
      height / 2,
    width,
    height,
  };
}

/** One visibility and clock policy consumed by live preview and frame export. */
export function quickEditWebcamFrameAt(
  webcam: QuickEditWebcam,
  sourceTime: number,
  cameraDuration: number
): { time: number; placement: QuickEditWebcamPlacement; crop?: QuickEditWebcamCrop } | null {
  const time = sourceTime - webcam.offsetSeconds;
  if (
    !webcam.enabled ||
    !Number.isFinite(sourceTime) ||
    sourceTime < 0 ||
    !Number.isFinite(cameraDuration) ||
    time < 0 ||
    time >= cameraDuration ||
    webcam.hiddenRanges.some((range) => sourceTime >= range.start && sourceTime < range.end)
  )
    return null;
  return {
    time,
    placement: quickEditWebcamPlacementAt(webcam, sourceTime),
    crop: quickEditWebcamCropAt(webcam, sourceTime),
  };
}

/** Resolve a centered, inscribed pixel circle without rewriting authored scene-relative positions. */
export function quickEditWebcamBounds(
  placement: QuickEditWebcamPlacement,
  output: { width: number; height: number },
  shape: CameraAppearance['shape']
): QuickEditWebcamPlacement {
  if (shape !== 'circle') return placement;
  const frame = cameraWindowFrame(
    {
      x: placement.x * output.width,
      y: placement.y * output.height,
      width: placement.width * output.width,
      height: placement.height * output.height,
    },
    shape
  );
  return {
    x: frame.x / output.width,
    y: frame.y / output.height,
    width: frame.width / output.width,
    height: frame.height / output.height,
  };
}

/** Optional per-position framing inherits the base crop in existing projects. */
function isWebcamCrop(value: unknown): value is QuickEditWebcamCrop {
  return (
    isRecord(value) &&
    isBoundedNumber(value['zoom'], 1, 4) &&
    isBoundedNumber(value['panX'], -1, 1) &&
    isBoundedNumber(value['panY'], -1, 1)
  );
}

/** Crop follows the same source-clock transition as the camera's scene placement. */
export function quickEditWebcamCropAt(webcam: QuickEditWebcam, time: number): QuickEditWebcamCrop {
  const index = webcam.positions.findLastIndex((position) => position.time <= time);
  const current = webcam.positions[index];
  const base = {
    zoom: webcam.appearance.zoom,
    panX: webcam.appearance.panX,
    panY: webcam.appearance.panY,
  };
  if (!current) return base;
  const previous = webcam.positions[index - 1]?.crop ?? base;
  const next = current.crop ?? base;
  const duration = Math.min(
    current.transition.duration,
    (webcam.positions[index + 1]?.time ?? Infinity) - current.time
  );
  const progress =
    current.transition.type === 'none' || !duration
      ? 1
      : Math.min(1, Math.max(0, (time - current.time) / duration));
  const eased = progress * progress * (3 - 2 * progress);
  return {
    zoom: previous.zoom + (next.zoom - previous.zoom) * eased,
    panX: previous.panX + (next.panX - previous.panX) * eased,
    panY: previous.panY + (next.panY - previous.panY) * eased,
  };
}

/** Move one anchor without crossing adjacent anchors or changing its content. */
export function moveQuickEditWebcamPosition(
  camera: QuickEditWebcam,
  id: string,
  time: number,
  duration: number
): QuickEditWebcam {
  const index = camera.positions.findIndex((position) => position.id === id);
  if (index < 0 || !Number.isFinite(time)) return camera;
  const min = (camera.positions[index - 1]?.time ?? 0) + 0.001;
  const max = (camera.positions[index + 1]?.time ?? duration) - 0.001;
  const bounded = Math.max(min, Math.min(max, Math.round(time * 1000) / 1000));
  if (bounded === camera.positions[index]!.time || max < min) return camera;
  return {
    ...camera,
    positions: camera.positions.map((position) =>
      position.id === id ? { ...position, time: bounded } : position
    ),
  };
}
