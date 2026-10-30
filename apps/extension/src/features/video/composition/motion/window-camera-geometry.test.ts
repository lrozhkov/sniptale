import { expect, it } from 'vitest';
import { createWindowCameraGeometry } from './window-camera-geometry';
import { proveCameraPlan, type CameraPlanSpan } from './camera-plan-proof';
import { resolveCameraFollowPolicy } from '../../project/camera/cursor-policy';

it.each(['none', 'instant', 'linear'] as const)(
  'preserves detailed native admission across %s phase boundaries and interior pointer excursions',
  (type) => {
    const geometry = createWindowCameraGeometry({
      output: { width: 1000, height: 600 },
      window: { x: 0, y: 0, width: 1000, height: 600 },
      video: { x: 0, y: 0, width: 1000, height: 600 },
      cornerRadius: 24,
      windowWeight: 'window',
      region: { start: 0, end: 1, enter: { type, duration: 0.1 }, exit: { type, duration: 0.1 } },
      connectedIn: false,
      connectedOut: false,
      policy: resolveCameraFollowPolicy({}),
    });
    const span: CameraPlanSpan = {
      kind: 'hold',
      start: 0,
      end: 1,
      segmentId: 'source',
      pan: { x: 500, y: 300 },
    };
    const observations = Array.from({ length: 1025 }, (_, index) => ({
      time: index / 1024,
      segmentId: 'source',
      actual: { x: 0.4 + (index % 7) / 1000, y: 0.4 + (index % 11) / 1000 },
    }));
    const input = {
      spans: [span],
      observations,
      geometry,
      targetScale: 2,
      preservePointer: true,
      limits: { speed: 1e9, acceleration: 1e9, jerk: 1e9 },
    };
    const detailed = { ...geometry, supportsObservationBounds: false };
    expect(proveCameraPlan(input)).toEqual({ status: 'proven' });
    expect(proveCameraPlan(input)).toEqual(proveCameraPlan({ ...input, geometry: detailed }));
    const unsafe = observations.map((point, index) =>
      index === 511 ? { ...point, actual: { x: 0.999, y: 0.4 } } : point
    );
    expect(proveCameraPlan({ ...input, observations: unsafe }).status).toBe('conflict');
    expect(proveCameraPlan({ ...input, observations: unsafe })).toEqual(
      proveCameraPlan({ ...input, observations: unsafe, geometry: detailed })
    );
  }
);

it('retains the same native projection throughout a dense held camera phase', () => {
  let reads = 0;
  const perspective = { enabled: true, rotateX: 12, rotateY: -8, rotateZ: 5, strength: 0.5 };
  const region = {
    start: 0,
    end: 10,
    enter: { type: 'none' as const, duration: 0 },
    exit: { type: 'none' as const, duration: 0 },
    get perspective() {
      reads++;
      return perspective;
    },
  };
  const geometry = createWindowCameraGeometry({
    output: { width: 1000, height: 600 },
    window: { x: 20, y: 20, width: 960, height: 560 },
    video: { x: 20, y: 20, width: 960, height: 560 },
    cornerRadius: 24,
    windowWeight: 'window',
    region,
    connectedIn: false,
    connectedOut: false,
    policy: resolveCameraFollowPolicy({}),
  });
  const frame = { time: 1, x: 0.4, y: 0.4, actual: { x: 0.4, y: 0.4 }, segmentId: 'source' };
  const preferred = geometry.preferredPan(frame, 2);
  const bounds = geometry.pointPanBounds!(frame, 2, 0.1);
  reads = 0;
  for (let index = 0; index < 1025; index++) {
    const moved = { ...frame, time: 1 + index / 1024 };
    expect(geometry.preferredPan(moved, 2)).toEqual(preferred);
    expect(geometry.pointPanBounds!(moved, 2, 0.1)).toEqual(bounds);
  }
  expect(reads).toBeLessThan(10);
});

it.each(['window', 'content', 'spatial'] as const)(
  'preserves changing phases and scales in retained %s projections',
  (windowWeight) => {
    const input = {
      output: { width: 1000, height: 600 },
      window: { x: 20, y: 30, width: 960, height: 540 },
      video: { x: 20, y: 30, width: 960, height: 540 },
      cornerRadius: 24,
      windowWeight,
      region: {
        start: 0,
        end: 10,
        enter: { type: 'linear' as const, duration: 2 },
        exit: { type: 'linear' as const, duration: 2 },
        perspective: { enabled: true, rotateX: 12, rotateY: -8, rotateZ: 5, strength: 0.5 },
      },
      connectedIn: false,
      connectedOut: false,
      policy: resolveCameraFollowPolicy({}),
    };
    const retained = createWindowCameraGeometry(input);
    for (const time of [0, 0.5, 1, 2, 5, 8, 9, 10, 1, 5])
      for (const scale of [1, 1.5, 2, 3, 1.5]) {
        const frame = { time, x: 0.4, y: 0.6, actual: { x: 0.5, y: 0.3 }, segmentId: 'source' };
        const fresh = createWindowCameraGeometry(input);
        expect(retained.preferredPan(frame, scale)).toEqual(fresh.preferredPan(frame, scale));
        expect(retained.pointPanBounds!(frame, scale, 0.1)).toEqual(
          fresh.pointPanBounds!(frame, scale, 0.1)
        );
      }
  }
);
