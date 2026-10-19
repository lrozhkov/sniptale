import { resolveCameraClip, cameraSourceTime } from '../../project/camera/animation';
import { DEFAULT_CAMERA_APPEARANCE } from '../../project/camera/appearance';
import type { VideoProjectVideoClip } from '../../project/types';
import {
  getFittedMediaContentFrame,
  type VisualLayerSourcePointMapping,
} from '../draw/fitted-media';

type Range = readonly [number, number];
type Mapping = Omit<VisualLayerSourcePointMapping, 'point'>;
const range = (values: readonly number[]): Range => [Math.min(...values), Math.max(...values)];
const add = (a: Range, b: Range): Range => [a[0] + b[0], a[1] + b[1]];
const minus = (a: Range, b: Range): Range => [a[0] - b[1], a[1] - b[0]];
const times = (a: Range, b: Range): Range =>
  range([a[0] * b[0], a[0] * b[1], a[1] * b[0], a[1] * b[1]]);
const scale = (a: Range, factor: number): Range => times(a, [factor, factor]);

/** Exact source-clock seams partition camera position and visibility proof intervals. */
export function cameraSourceGeometryBreaks(clip: VideoProjectVideoClip): number[] {
  const toProject = (time: number) =>
    clip.startTime + (time - clip.sourceStart) / (clip.playbackRate ?? 1);
  return [
    ...(clip.cameraPositions ?? []).flatMap((position) => [
      position.sourceTime,
      position.sourceTime +
        (position.transition.kind === 'instant' ? 0 : position.transition.duration),
    ]),
    ...(clip.cameraHiddenRanges ?? []).flatMap((interval) => [interval.start, interval.end]),
  ]
    .map(toProject)
    .filter((time) => time >= clip.startTime && time <= clip.startTime + clip.duration);
}

function trigBounds(angle: Range, cosine: boolean): Range {
  if (angle[1] - angle[0] >= Math.PI * 2) return [-1, 1];
  const fn = cosine ? Math.cos : Math.sin;
  const values = [fn(angle[0]), fn(angle[1])];
  const offset = cosine ? 0 : Math.PI / 2;
  for (
    let index = Math.ceil((angle[0] - offset) / Math.PI);
    index <= Math.floor((angle[1] - offset) / Math.PI);
    index++
  )
    values.push(index % 2 === 0 ? 1 : -1);
  return range(values);
}

function poseBounds(clip: VideoProjectVideoClip, start: number, end: number) {
  const middle = (start + end) / 2;
  // The left proof keeps the preceding position at its closing edge; the next interval owns the new position.
  const positions = (clip.cameraPositions ?? []).filter(
    (position) => position.sourceTime <= cameraSourceTime(clip, middle)
  );
  const local = { ...clip, cameraPositions: positions };
  const first = resolveCameraClip(local, start),
    last = resolveCameraClip(local, end);
  const poses = [first, resolveCameraClip(local, middle), last];
  const active = positions.at(-1);
  const progress = (time: number) =>
    !active || active.transition.duration <= 0
      ? 1
      : Math.min(
          1,
          Math.max(
            0,
            (cameraSourceTime(clip, time) - active.sourceTime) / active.transition.duration
          )
        );
  const shrink = active?.transition.kind === 'shrink';
  const factorAt = (time: number) =>
    shrink ? 1 - 0.55 * Math.sin(Math.PI * progress(time)) ** 2 : 1;
  const factors = shrink
    ? trigBounds([Math.PI * progress(start), Math.PI * progress(end)], false)
    : ([0, 0] as const);
  const sineSquare = [
    factors[0] <= 0 && factors[1] >= 0 ? 0 : Math.min(factors[0] ** 2, factors[1] ** 2),
    Math.max(factors[0] ** 2, factors[1] ** 2),
  ] as const;
  const factor: Range = shrink ? [1 - 0.55 * sineSquare[1], 1 - 0.55 * sineSquare[0]] : [1, 1];
  const widths = range([
    first.transform.width / factorAt(start),
    last.transform.width / factorAt(end),
  ]);
  const heights = range([
    first.transform.height / factorAt(start),
    last.transform.height / factorAt(end),
  ]);
  return {
    centerX: range(poses.map((pose) => pose.transform.x + pose.transform.width / 2)),
    centerY: range(poses.map((pose) => pose.transform.y + pose.transform.height / 2)),
    width: times(widths, factor),
    height: times(heights, factor),
    rotation: scale(range(poses.map((pose) => pose.transform.rotation)), Math.PI / 180),
    zoom: range(poses.map((pose) => (pose.cameraAppearance ?? DEFAULT_CAMERA_APPEARANCE).zoom)),
    panX: range(poses.map((pose) => pose.cameraAppearance?.panX ?? 0)),
    panY: range(poses.map((pose) => pose.cameraAppearance?.panY ?? 0)),
    fits: [...new Set(poses.map((pose) => pose.fitMode))],
    appearances: [...new Set(poses.map((pose) => pose.cameraAppearance !== undefined))],
  };
}

function fittedBounds(
  clip: VideoProjectVideoClip,
  mapping: Mapping,
  pose: ReturnType<typeof poseBounds>
) {
  const { cameraAppearance: _previous, ...base } = mapping;
  const content = pose.appearances.flatMap((present) =>
    pose.fits.flatMap((fitMode) =>
      [0, 1].map((edge) => {
        const appearance = present
          ? {
              ...(clip.cameraAppearance ?? DEFAULT_CAMERA_APPEARANCE),
              zoom: pose.zoom[edge]!,
              panX: 0,
              panY: 0,
            }
          : undefined;
        const frame = { x: 0, y: 0, width: pose.width[edge]!, height: pose.height[edge]! };
        return getFittedMediaContentFrame({
          ...base,
          fitMode,
          frame,
          ...(appearance ? { cameraAppearance: appearance } : {}),
        });
      })
    )
  );
  const windows = pose.appearances.map((present) =>
    present && clip.cameraAppearance?.shape === 'circle'
      ? {
          width: [
            Math.min(pose.width[0], pose.height[0]),
            Math.min(pose.width[1], pose.height[1]),
          ] as Range,
          height: [
            Math.min(pose.width[0], pose.height[0]),
            Math.min(pose.width[1], pose.height[1]),
          ] as Range,
        }
      : { width: pose.width, height: pose.height }
  );
  return {
    contentWidth: range(content.map((frame) => frame.width)),
    contentHeight: range(content.map((frame) => frame.height)),
    windowWidth: range(windows.flatMap((window) => [...window.width])),
    windowHeight: range(windows.flatMap((window) => [...window.height])),
  };
}

function boundCameraPart(input: {
  clip: VideoProjectVideoClip;
  mapping: Mapping;
  nativeX: Range;
  nativeY: Range;
  start: number;
  end: number;
}) {
  const { clip, mapping, nativeX, nativeY, start, end } = input;
  const pose = poseBounds(clip, start, end),
    fitted = fittedBounds(clip, mapping, pose);
  const crop = mapping.sourceCrop ?? { x: 0, y: 0, width: 1, height: 1 };
  const x = add(
    times(minus(nativeX, [crop.x + crop.width / 2, crop.x + crop.width / 2]), fitted.contentWidth),
    scale(times(minus(fitted.windowWidth, scale(fitted.contentWidth, crop.width)), pose.panX), 0.5)
  );
  const y = add(
    times(
      minus(nativeY, [crop.y + crop.height / 2, crop.y + crop.height / 2]),
      fitted.contentHeight
    ),
    scale(
      times(minus(fitted.windowHeight, scale(fitted.contentHeight, crop.height)), pose.panY),
      0.5
    )
  );
  const margins = [
    add(x, scale(fitted.windowWidth, 0.5)),
    minus(scale(fitted.windowWidth, 0.5), x),
    add(y, scale(fitted.windowHeight, 0.5)),
    minus(scale(fitted.windowHeight, 0.5), y),
    times(minus(nativeX, [crop.x, crop.x]), fitted.contentWidth),
    times(minus([crop.x + crop.width, crop.x + crop.width], nativeX), fitted.contentWidth),
    times(minus(nativeY, [crop.y, crop.y]), fitted.contentHeight),
    times(minus([crop.y + crop.height, crop.y + crop.height], nativeY), fitted.contentHeight),
  ];
  const dx = clip.cameraMirrored ? scale(x, -1) : x;
  const cosine = trigBounds(pose.rotation, true),
    sine = trigBounds(pose.rotation, false);
  return {
    center: { x: pose.centerX, y: pose.centerY },
    rotatedX: minus(times(dx, cosine), times(y, sine)),
    rotatedY: add(times(dx, sine), times(y, cosine)),
    raster: {
      low: Math.min(...margins.map((margin) => margin[0])),
      high: Math.min(...margins.map((margin) => margin[1])),
    },
    width: pose.width,
    height: pose.height,
  };
}

/** Bound source points through continuous camera poses without sampling rendered output extrema. */
export function boundCameraSourceGeometry(input: Parameters<typeof boundCameraPart>[0]) {
  const breaks = [
    input.start,
    ...cameraSourceGeometryBreaks(input.clip).filter(
      (time) => time > input.start && time < input.end
    ),
    input.end,
  ].sort((a, b) => a - b);
  const parts = breaks
    .slice(0, -1)
    .map((start, index) => boundCameraPart({ ...input, start, end: breaks[index + 1]! }));
  return {
    center: {
      x: range(parts.flatMap((part) => [...part.center.x])),
      y: range(parts.flatMap((part) => [...part.center.y])),
    },
    rotatedX: range(parts.flatMap((part) => [...part.rotatedX])),
    rotatedY: range(parts.flatMap((part) => [...part.rotatedY])),
    raster: {
      low: Math.min(...parts.map((part) => part.raster.low)),
      high: Math.max(...parts.map((part) => part.raster.high)),
    },
    width: range(parts.flatMap((part) => [...part.width])),
    height: range(parts.flatMap((part) => [...part.height])),
  };
}
