import { expect, it } from 'vitest';
import { createVideoProjectFromRecording } from '../../project/factories/creation';
import { normalizeVideoProjectCursorSkin } from '../../project/cursor';
import { cameraWindowFrame } from '../../project/camera/appearance';
import { getFittedMediaContentFrame } from '../draw/fitted-media';
import {
  mapCursorFocusControlPoint,
  resolveCursorSourcePointMapping,
  resolveVideoCompositionCursor,
} from '../timeline/frame/cursor';
import { boundCameraSourceGeometry, cameraSourceGeometryBreaks } from './camera-source-geometry';

function fixture() {
  const project = createVideoProjectFromRecording({
    recordingId: 'geometry',
    filename: 'geometry.webm',
    width: 1000,
    height: 600,
    duration: 6,
    mimeType: 'video/webm',
    size: 10,
    cursorTrack: {
      captureMode: 'separate',
      skin: normalizeVideoProjectCursorSkin(undefined),
      samples: [
        { id: 'point', time: 0, x: 500, y: 300, visible: true, recordingPoint: { x: 0.5, y: 0.5 } },
      ],
    },
  });
  const clip = project.clips[0]!;
  if (clip.type !== 'VIDEO') throw new Error('Missing source');
  project.tracks = project.tracks.map((track) =>
    track.id === clip.trackId ? { ...track, role: 'CAMERA' } : track
  );
  clip.sourceStart = 1.2;
  clip.sourceDuration = 3;
  clip.playbackRate = 2;
  clip.duration = 1.5;
  clip.transform = { x: 100, y: 200, width: 200, height: 120, rotation: -27, opacity: 1 };
  clip.sourceCrop = { x: 0.2, y: 0.1, width: 0.6, height: 0.8 };
  return { project, clip };
}

for (const kind of ['smooth', 'shrink', 'instant'] as const)
  for (const shape of ['rounded', 'circle'] as const)
    for (const mirrored of [false, true]) {
      it(`bounds actual camera geometry for ${kind}/${shape}/mirror=${mirrored}`, () => {
        const { project, clip } = fixture();
        clip.cameraAppearance = { shape, roundness: 40, zoom: 1.3, panX: 0.1, panY: -0.2 };
        clip.cameraMirrored = mirrored;
        clip.cameraPositions = [
          {
            id: 'first',
            sourceTime: 1.4,
            transform: { ...clip.transform, x: 400, y: 100, width: 160, height: 200, rotation: 87 },
            fitMode: 'STRETCH',
            transition: { kind, duration: 1.2 },
            crop: { zoom: 2.3, panX: -0.4, panY: 0.3 },
          },
          {
            id: 'second',
            sourceTime: 3.2,
            transform: { ...clip.transform, x: 200, y: 300, width: 240, height: 140, rotation: 12 },
            fitMode: 'CONTAIN',
            transition: { kind: 'instant', duration: 0 },
          },
        ];
        const before = structuredClone(project);
        const mapping = resolveCursorSourcePointMapping(project, clip.id, 0)!;
        const bounds = boundCameraSourceGeometry({
          clip,
          mapping,
          nativeX: [0.35, 0.65],
          nativeY: [0.3, 0.7],
          start: 0,
          end: 1.5,
        });
        for (let index = 0; index <= 120; index++) {
          const time = (index * 1.5) / 120;
          const actual = resolveCursorSourcePointMapping(project, clip.id, time)!;
          const point = { x: 0.35 + (0.3 * index) / 120, y: 0.3 + (0.4 * index) / 120 };
          const world = mapCursorFocusControlPoint(actual, point);
          expect(world.x).toBeGreaterThanOrEqual(bounds.center.x[0] + bounds.rotatedX[0] - 1e-9);
          expect(world.x).toBeLessThanOrEqual(bounds.center.x[1] + bounds.rotatedX[1] + 1e-9);
          expect(world.y).toBeGreaterThanOrEqual(bounds.center.y[0] + bounds.rotatedY[0] - 1e-9);
          expect(world.y).toBeLessThanOrEqual(bounds.center.y[1] + bounds.rotatedY[1] + 1e-9);
          const content = getFittedMediaContentFrame(actual),
            frame = cameraWindowFrame(actual.frame, shape);
          const x = content.x + point.x * content.width,
            y = content.y + point.y * content.height;
          const crop = clip.sourceCrop!;
          const clearance = Math.min(
            x - frame.x,
            frame.x + frame.width - x,
            y - frame.y,
            frame.y + frame.height - y,
            (point.x - crop.x) * content.width,
            (crop.x + crop.width - point.x) * content.width,
            (point.y - crop.y) * content.height,
            (crop.y + crop.height - point.y) * content.height
          );
          expect(clearance).toBeGreaterThanOrEqual(bounds.raster.low - 1e-9);
          expect(clearance).toBeLessThanOrEqual(bounds.raster.high + 1e-9);
        }
        expect(cameraSourceGeometryBreaks(clip)).toEqual([
          expect.closeTo(0.1, 9),
          expect.closeTo(kind === 'instant' ? 0.1 : 0.7, 9),
          1,
          1,
        ]);
        expect(project).toEqual(before);
      });
    }

it('includes the interior shrink extremum and keeps exact point intervals tight', () => {
  const { project, clip } = fixture();
  clip.sourceStart = 0;
  clip.playbackRate = 1;
  clip.sourceDuration = 3;
  clip.duration = 3;
  clip.fitMode = 'STRETCH';
  clip.transform = { ...clip.transform, width: 200, height: 200, rotation: 0 };
  clip.cameraAppearance = { shape: 'rounded', zoom: 1, panX: 0, panY: 0, roundness: 0 };
  clip.cameraPositions = [
    {
      id: 'shrink',
      sourceTime: 0,
      transform: { ...clip.transform },
      fitMode: 'STRETCH',
      transition: { kind: 'shrink', duration: 2 },
    },
  ];
  const mapping = resolveCursorSourcePointMapping(project, clip.id, 0)!;
  const bounds = boundCameraSourceGeometry({
    clip,
    mapping,
    nativeX: [0.5, 0.5],
    nativeY: [0.5, 0.5],
    start: 0,
    end: 2,
  });
  expect(bounds.width[0]).toBeCloseTo(90, 9);
  expect(bounds.width[1]).toBeCloseTo(200, 9);
  const exact = boundCameraSourceGeometry({
    clip,
    mapping,
    nativeX: [0.5, 0.5],
    nativeY: [0.5, 0.5],
    start: 1,
    end: 1,
  });
  const point = mapCursorFocusControlPoint(resolveCursorSourcePointMapping(project, clip.id, 1)!, {
    x: 0.5,
    y: 0.5,
  });
  expect(exact.center.x[0] + exact.rotatedX[0]).toBeCloseTo(point.x, 9);
  expect(exact.center.x[1] + exact.rotatedX[1]).toBeCloseTo(point.x, 9);
});

it('retains camera geometry while hidden and restores the source cursor after the interval', () => {
  const { project, clip } = fixture();
  // Keep the trusted sample inside this retained placement's project window.
  project.cursorTrack!.samples = project.cursorTrack!.samples.map((sample) => ({
    ...sample,
    sourceAnchor: { ...sample.sourceAnchor!, sourceTime: 1.2 },
  }));
  clip.cameraHiddenRanges = [{ id: 'hidden', start: 1.2, end: 2.2 }];
  expect(resolveCursorSourcePointMapping(project, clip.id, 0)).not.toBeNull();
  expect(resolveVideoCompositionCursor(project, 0, [])).toBeNull();
  expect(resolveVideoCompositionCursor(project, 0.75, [])).not.toBeNull();
  expect(cameraSourceGeometryBreaks(clip)).toEqual([0, expect.closeTo(0.5, 9)]);
});
