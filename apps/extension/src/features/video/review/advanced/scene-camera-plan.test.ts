import type { CursorFocusPath } from '../../project/cursor-focus-path/types';
import {
  projectQuickEditPoint,
  quickEditPlaneProjection,
  multiplyQuickEditProjections,
  type QuickEditHomography,
} from '../../composition/motion/spatial-geometry';
import { createQuickEditBorder } from '../../project/scene/focus-appearance';
import { createReviewWorkingZoneCameraGeometry } from './camera-geometry';
import { fitQuickEditSourceCrop } from './canvas';
import { expect, it, vi } from 'vitest';
import * as cameraGeometry from './camera-geometry';
import {
  evaluateWorkingZoneCameraBoundary,
  planWorkingZoneCamera,
} from '../../composition/motion/follow-cursor';
import {
  computeQuickEditSceneLayout,
  computeQuickEditSpatialRasterLayout,
  computeQuickEditSpatialWindow,
  computeQuickEditWindowTransform,
  resolveReviewSceneCameraPlan,
  resolveReviewCameraGeometry,
  resolveReviewCameraConflicts,
  evaluateQuickEditCameraAtTime,
} from './scene';
import {
  createCameraFollowSettings,
  resolveCameraFollowPolicy,
} from '../../project/camera/cursor-policy';
import type { QuickEditZoomRegion } from './types';
import { reviewCameraPlanObservations } from './cursor-focus-path';

it.each([0.5, 0.05])(
  'reuses the linked camera proof across playback snapshots with observed pointer x=%s',
  (gapX) => {
    const scene = {
      source: { width: 1000, height: 600 },
      background: { enabled: false as const, zoomBehavior: 'window' as const },
    };
    const path = {
      version: 1 as const,
      mode: 'follow' as const,
      smoothing: 0,
      sensitivity: 0.5,
      gapPolicy: 'hold' as const,
      segments: [
        {
          id: 'native',
          start: 0,
          end: 4,
          binding: { kind: 'project' as const },
          keys: [0, 1, 2, 3, 4].map((time) => ({
            id: `point-${time}`,
            time,
            x: time === 2 ? gapX : 0.5,
            y: 0.5,
            anchor: 'movement' as const,
            interpolation: 'linear' as const,
          })),
        },
      ],
    };
    const from: QuickEditZoomRegion = {
      id: 'from',
      start: 0,
      end: 1,
      linkTo: 'to',
      transform: { scale: 2, centerX: 0.5, centerY: 0.5 },
      enter: { type: 'none', duration: 0 },
      exit: { type: 'none', duration: 0 },
      cursorFocus: {
        path,
        observed: path,
        scene,
        policy: resolveCameraFollowPolicy({
          defaults: { ...createCameraFollowSettings('calm'), allowExpansion: false },
        }),
      },
    };
    const to: QuickEditZoomRegion = {
      id: 'to',
      start: 3,
      end: 4,
      transform: from.transform,
      enter: from.enter,
      exit: from.exit,
    };
    const regions = [from, to];
    const prove = vi.spyOn(cameraGeometry, 'proveReviewCameraGap');
    try {
      for (const time of [1.2, 1.5, 1.8]) {
        // Stage and mini-preview supply wider objects than the scene contract.
        const preview = { ...scene, focus: { regions, time }, camera: { ...from.transform } };
        evaluateQuickEditCameraAtTime(regions, time, preview);
      }
      expect(prove).toHaveBeenCalledTimes(1);
      const conflicts = resolveReviewCameraConflicts(regions, scene, { start: 1.5, end: 2.5 });
      expect(conflicts.length).toBe(gapX === 0.5 ? 0 : 1);
      expect(prove).toHaveBeenCalledTimes(1);
      evaluateQuickEditCameraAtTime(regions, 1.5, {
        ...scene,
        output: { width: 1280, height: 720 },
      });
      expect(prove).toHaveBeenCalledTimes(2);
    } finally {
      prove.mockRestore();
    }
  }
);

it.each([false, true])(
  'applies temporary expansion=%s across the complete captured link gap',
  (allowExpansion) => {
    const focus = {
      version: 1 as const,
      mode: 'follow' as const,
      smoothing: 0,
      sensitivity: 0.5,
      gapPolicy: 'hold' as const,
      segments: [
        {
          id: 'native',
          start: 0,
          end: 4,
          binding: { kind: 'project' as const },
          keys: [0, 1, 2, 3, 4].map((time) => ({
            id: `point-${time}`,
            time,
            x: 0.5,
            y: 0.5,
            anchor: 'movement' as const,
            interpolation: 'linear' as const,
          })),
        },
      ],
    };
    const observed = {
      ...focus,
      segments: focus.segments.map((segment) => ({
        ...segment,
        keys: segment.keys.map((key) => ({ ...key, x: key.time === 2 ? 0.05 : 0.5 })),
      })),
    };
    const scene = {
      source: { width: 1000, height: 600 },
      background: { enabled: false as const, zoomBehavior: 'window' as const },
    };
    const from = {
      id: 'from',
      start: 0,
      end: 1,
      linkTo: 'to',
      transform: { scale: 2, centerX: 0.5, centerY: 0.5 },
      enter: { type: 'none' as const, duration: 0 },
      exit: { type: 'none' as const, duration: 0 },
      cursorFocus: {
        path: focus,
        observed,
        scene,
        policy: resolveCameraFollowPolicy({
          defaults: { ...createCameraFollowSettings('calm'), allowExpansion },
        }),
      },
    };
    const to = {
      id: 'to',
      start: 3,
      end: 4,
      transform: from.transform,
      enter: from.enter,
      exit: from.exit,
    };
    expect(resolveReviewCameraConflicts([from, to], scene, { start: 0, end: 0.5 })).toEqual([]);
    if (!allowExpansion)
      expect(
        resolveReviewCameraConflicts([from, to], scene, { start: 1.9, end: 2.1 })
      ).toContainEqual(
        expect.objectContaining({
          regionId: 'from',
          interval: { start: 1, end: 3 },
          reason: 'viewport',
        })
      );
    else {
      expect(resolveReviewCameraConflicts([from, to], scene)).toEqual([]);
      for (let time = 1; time <= 3; time += 1 / 60) {
        const camera = evaluateQuickEditCameraAtTime([from, to], time, scene);
        const actualX = time <= 2 ? 0.5 - 0.45 * (time - 1) : 0.05 + 0.45 * (time - 2);
        expect(0.5 + (actualX - camera.centerX) * camera.scale).toBeGreaterThanOrEqual(-0.002);
      }
      expect(evaluateQuickEditCameraAtTime([from, to], 1, scene).scale).toBe(2);
      expect(evaluateQuickEditCameraAtTime([from, to], 3, scene).scale).toBe(2);
    }
  }
);

it.each([
  ['manual', 'none'],
  ['follow', 'none'],
  ['follow', 'ease-in-out'],
] as const)(
  'shares a C2 endpoint between contiguous %s and follow cameras with %s phases',
  (mode, phase) => {
    const path = {
      version: 1 as const,
      mode: 'follow' as const,
      smoothing: 0,
      sensitivity: 0.5,
      gapPolicy: 'hold' as const,
      segments: [
        {
          id: 'native',
          start: 0,
          end: 6,
          binding: { kind: 'project' as const },
          keys: [0, 3, 6].map((time) => ({
            id: `point-${time}`,
            time,
            x: time < 3 ? 0.4 : 0.6,
            y: 0.5,
            anchor: 'movement' as const,
            interpolation: 'linear' as const,
          })),
        },
      ],
    };
    const scene = { source: { width: 1000, height: 600 }, background: { enabled: false as const } };
    const context = {
      path,
      scene,
      policy: resolveCameraFollowPolicy({ defaults: createCameraFollowSettings('fast') }),
    };
    const from: QuickEditZoomRegion = {
      id: 'from',
      start: 0,
      end: 3,
      transform: { scale: 2, centerX: 0.4, centerY: 0.5 },
      enter: { type: phase, duration: phase === 'none' ? 0 : 0.6 },
      exit: { type: phase, duration: phase === 'none' ? 0 : 0.6 },
      ...(mode === 'follow' ? { cursorFocus: context } : {}),
    };
    const to: QuickEditZoomRegion = { ...from, id: 'to', start: 3, end: 6, cursorFocus: context };
    const regions = [from, to];
    expect(resolveReviewCameraConflicts(regions, scene)).toEqual([]);
    const position = (time: number) => {
      const camera = evaluateQuickEditCameraAtTime(regions, time, scene);
      return (camera.centerX * camera.scale - 0.5) * 1000;
    };
    const epsilon = 1e-4;
    expect(position(3 - epsilon)).toBeCloseTo(position(3), 4);
    expect(Math.abs((position(3 + epsilon) - position(3)) / epsilon)).toBeLessThan(2);
    const plan = resolveReviewSceneCameraPlan(regions, to, scene);
    expect(plan?.status).toBe('ready');
    if (plan?.status === 'ready') {
      const boundary = evaluateWorkingZoneCameraBoundary(plan, 3);
      expect(boundary.velocity.x).toBeCloseTo(0, 8);
      expect(boundary.acceleration.x).toBeCloseTo(0, 8);
    }
  }
);

it('keeps a nominal discontinuity when short-camera fitting changes adjacent phase acceleration', () => {
  const path = {
    version: 1 as const,
    mode: 'follow' as const,
    smoothing: 0,
    sensitivity: 0.5,
    gapPolicy: 'hold' as const,
    segments: [
      {
        id: 'native',
        start: 0,
        end: 4,
        binding: { kind: 'project' as const },
        keys: [0, 4].map((time) => ({
          id: `point-${time}`,
          time,
          x: 0.5,
          y: 0.5,
          anchor: 'movement' as const,
          interpolation: 'linear' as const,
        })),
      },
    ],
  };
  const scene = { source: { width: 1000, height: 600 }, background: { enabled: false as const } };
  const context = {
    path,
    scene,
    policy: resolveCameraFollowPolicy({ defaults: createCameraFollowSettings('fast') }),
  };
  const left: QuickEditZoomRegion = {
    id: 'short',
    start: 0,
    end: 0.5,
    transform: { scale: 2, centerX: 0.5, centerY: 0.5 },
    enter: { type: 'ease-in-out', duration: 0.6 },
    exit: { type: 'ease-in-out', duration: 0.6 },
    cursorFocus: context,
  };
  const right = { ...left, id: 'long', start: 0.5, end: 3.5 };
  const plan = resolveReviewSceneCameraPlan([left, right], right, scene);
  expect(plan?.status).toBe('ready');
  if (plan?.status === 'ready')
    expect(plan.discontinuities).toContainEqual({ time: 0.5, reason: 'nominal' });
});

it('retains crop crossings as separate visible visits and ignores wholly discarded observations', () => {
  const scene = {
    source: { width: 1000, height: 600 },
    canvas: { width: 500, height: 600, crop: { x: 0.25, y: 0, width: 0.5, height: 1 } },
    background: { enabled: false as const },
  };
  const path = {
    version: 1 as const,
    mode: 'follow' as const,
    smoothing: 0,
    sensitivity: 0.5,
    gapPolicy: 'hold' as const,
    segments: [
      {
        id: 'native',
        start: 0,
        end: 4,
        binding: { kind: 'project' as const },
        keys: [0.1, 0.5, 0.9, 0.5, 0.1].map((x, time) => ({
          id: String(time),
          time,
          x,
          y: 0.5,
          anchor: 'movement' as const,
          interpolation: 'linear' as const,
        })),
      },
    ],
  };
  const region: QuickEditZoomRegion = {
    id: 'crop',
    start: 0,
    end: 4,
    transform: { scale: 1, centerX: 0.5, centerY: 0.5 },
    enter: { type: 'none', duration: 0 },
    exit: { type: 'none', duration: 0 },
    cursorFocus: {
      path,
      observed: path,
      scene,
      policy: resolveCameraFollowPolicy({ defaults: createCameraFollowSettings('calm') }),
    },
  };
  const before = structuredClone(region);
  const observations = reviewCameraPlanObservations(region);
  expect(new Set(observations.map((point) => point.segmentId)).size).toBe(2);
  expect(observations[0]?.time).toBeCloseTo(0.375, 10);
  expect(observations.at(-1)?.time).toBeCloseTo(3.625, 10);
  expect(
    observations.every(
      (point) => point.actual!.x >= 0.25 - 1e-12 && point.actual!.x <= 0.75 + 1e-12
    )
  ).toBe(true);
  expect(resolveReviewCameraConflicts([region], scene)).toEqual([]);
  expect(region).toEqual(before);
  const outside = structuredClone(region);
  for (const segment of outside.cursorFocus!.path.segments)
    for (const key of segment.keys) key.x = 0.1;
  outside.cursorFocus!.observed = outside.cursorFocus!.path;
  expect(reviewCameraPlanObservations(outside)).toEqual([]);
  expect(resolveReviewCameraConflicts([outside], scene)).toEqual([]);
});

it('starts a camera transition after crop re-entry without joining the hidden interval', () => {
  const source = { width: 2120, height: 1080 };
  const output = { width: 720, height: 1280 };
  const canvas = { ...output, crop: fitQuickEditSourceCrop(source, output) };
  const background = {
    enabled: true as const,
    type: 'solid' as const,
    color: '#ffffffff',
    zoomBehavior: 'window' as const,
    layout: { padding: 40, cornerRadius: 12 },
  };
  const region: QuickEditZoomRegion = {
    id: 'return',
    start: 1.5441898864809083,
    end: 10.481582780480613,
    transform: { scale: 2, centerX: 0.5, centerY: 0.5 },
    enter: { type: 'ease-in-out', duration: 0.3 },
    exit: { type: 'ease-in-out', duration: 0.3 },
  };
  const policy = resolveCameraFollowPolicy({
    defaults: {
      zoneSize: 0.3,
      transitionDuration: 1.5,
      marginFraction: 0.08,
      minimumHoldDuration: 0.35,
      minimumScale: 1.35,
      preservePointer: true,
      allowExpansion: true,
    },
  });
  const layout = computeQuickEditSceneLayout({
    source,
    canvas,
    output,
    background,
    camera: { scale: 1, centerX: 0.5, centerY: 0.5 },
  });
  const geometry = createReviewWorkingZoneCameraGeometry({
    output,
    window: layout.windowRect,
    video: layout.videoRect,
    cornerRadius: 12,
    background,
    region,
    topology: [region],
    policy,
  });
  // Reduced native observations retain the actual and preferred pointer positions at re-entry.
  const samples = [
    [
      1.7348641509278766,
      0.3565566475164171,
      0.2656142590564628,
      1,
      0.3567216981132076,
      0.26559676136774385,
      'one',
    ],
    [
      5.286686792454067,
      0.3020253823788935,
      0.5472520541828956,
      4,
      0.3567216981132076,
      0.45057471264367815,
      'two',
    ],
    [
      5.710856553147563,
      0.28865295288652953,
      0.5690104166666666,
      1.9855465366107774,
      0.46328125000000003,
      0.44904214559386973,
      'two',
    ],
    [
      6.144189886480895,
      0.4825152683300728,
      0.43598545251382054,
      2.680288370599281,
      0.4635931108089911,
      0.44904214559386973,
      'two',
    ],
    [
      6.744189886480893,
      0.4704818234125116,
      0.44646366944777693,
      1.904659452364169,
      0.467578125,
      0.44904214559386973,
      'two',
    ],
    [
      7.283599999994039,
      0.5575187053415264,
      0.5015716091114307,
      1,
      0.59921875,
      0.5187739463601533,
      'two',
    ],
  ] as const;
  const frames = samples.map(([time, x, y, preferenceWeight, actualX, actualY, segmentId]) => ({
    time,
    x,
    y,
    preferenceWeight,
    actual: { x: actualX, y: actualY },
    segmentId,
  }));
  const plan = planWorkingZoneCamera({
    frames,
    start: region.start,
    end: region.end,
    targetScale: 2,
    policy,
    geometry,
  });
  expect(plan.status).toBe('ready');
  if (plan.status !== 'ready') return;
  expect(
    plan.spans
      .filter((span) => span.segmentId === 'two')
      .every((span) => span.start >= samples[1][0])
  ).toBe(true);
});

it('restores the linked camera exit after a neighboring Border becomes Zoom with the same cursor facts', () => {
  const scene = { source: { width: 1000, height: 600 }, background: { enabled: false as const } };
  const from: QuickEditZoomRegion = {
    id: 'from',
    start: 0,
    end: 3,
    linkTo: 'to',
    transform: { scale: 2, centerX: 0.5, centerY: 0.5 },
    enter: { type: 'ease-in-out', duration: 0.3 },
    exit: { type: 'ease-in-out', duration: 0.6 },
    cursorFocus: {
      scene,
      path: {
        version: 1,
        mode: 'follow',
        smoothing: 0,
        sensitivity: 0.5,
        gapPolicy: 'hold',
        segments: [],
      },
      policy: resolveCameraFollowPolicy({ defaults: createCameraFollowSettings('calm') }),
    },
  };
  const target: QuickEditZoomRegion = { ...from, id: 'to', start: 4, end: 6 };
  delete target.linkTo;
  const border = { ...target, border: createQuickEditBorder() };
  const independent = resolveReviewCameraGeometry([from, border], from, scene)!;
  expect(independent.breaks).toContain(2.4);
  const linked = resolveReviewCameraGeometry([from, target], from, scene)!;
  expect(linked.breaks).not.toContain(2.4);
});

it('keeps full camera projection at a same-time capture boundary within one backing pixel', () => {
  const source = { width: 2560, height: 1440 };
  const backing = { width: 840, height: 472 };
  const cut = 2.01;
  const path: CursorFocusPath = {
    version: 1,
    mode: 'follow',
    smoothing: 0,
    sensitivity: 0.5,
    gapPolicy: 'hold',
    segments: [
      {
        id: 'before',
        binding: {
          kind: 'project',
        },
        start: 0,
        end: 2.01,
        keys: [
          {
            time: 0,
            x: 0.26,
            y: 0.42,
            id: 'before0',
            anchor: 'boundary',
            interpolation: 'linear',
          },
          {
            time: 2.01,
            x: 0.26,
            y: 0.42,
            id: 'before1',
            anchor: 'movement',
            interpolation: 'linear',
          },
        ],
      },
      {
        id: 'after',
        binding: {
          kind: 'project',
        },
        start: 2.01,
        end: 4,
        keys: [
          {
            time: 2.01,
            x: 0.260390625,
            y: 0.41930555555555554,
            id: 'after0',
            anchor: 'boundary',
            interpolation: 'linear',
          },
          {
            time: 2.11,
            x: 0.26,
            y: 0.3,
            id: 'after1',
            anchor: 'movement',
            interpolation: 'linear',
          },
          {
            time: 2.31,
            x: 0.26,
            y: 0.18,
            id: 'after2',
            anchor: 'movement',
            interpolation: 'linear',
          },
          {
            time: 4,
            x: 0.26,
            y: 0.18,
            id: 'after3',
            anchor: 'movement',
            interpolation: 'linear',
          },
        ],
      },
    ],
  };
  const scene = { source, output: source, background: { enabled: false as const } };
  const region: QuickEditZoomRegion = {
    id: 'camera',
    start: 0,
    end: 4,
    transform: { scale: 1.5, centerX: 0.5, centerY: 0.5 },
    enter: { type: 'none', duration: 0 },
    exit: { type: 'none', duration: 0 },
    followCursor: true,
    cursorComposition: { mode: 'orbit', amount: 0.5, smoothness: 0.6 },
    cursorFocus: { path, observed: path, scene },
  };
  const plan = resolveReviewSceneCameraPlan([region], region, scene);
  expect(plan?.status).toBe('ready');
  const project = (time: number) => {
    const camera = evaluateQuickEditCameraAtTime([region], time, scene);
    expect(camera.scale).toBe(1.5);
    const layout = computeQuickEditSceneLayout({ ...scene, camera });
    const raster = layout.spatial
      ? computeQuickEditSpatialRasterLayout(layout, scene.background)
      : layout;
    const window = computeQuickEditWindowTransform(raster),
      base = layout.windowRect;
    const scale = window.width / base.width;
    const inner: QuickEditHomography = [
      scale,
      0,
      window.x - base.x * scale,
      0,
      scale,
      window.y - base.y * scale,
      0,
      0,
      1,
    ];
    const outer: QuickEditHomography = layout.spatial
      ? quickEditPlaneProjection(
          base,
          computeQuickEditSpatialWindow(layout, scene.background),
          layout.spatial
        )
      : [1, 0, 0, 0, 1, 0, 0, 0, 1];
    const projection = multiplyQuickEditProjections(outer, inner);
    return [
      [0, 0],
      [source.width, 0],
      [source.width, source.height],
      [0, source.height],
      [source.width / 2, source.height / 2],
    ].map(([x, y]) => {
      const projected = projectQuickEditPoint(projection, { x: x!, y: y! });
      if (!projected) throw new Error('Expected finite camera projection');
      return projected;
    });
  };
  // The endpoint moves by one source pixel per axis. Allow one 840-wide backing pixel,
  // including the preserved input discontinuity and its orbit projection.
  for (const time of [cut, Math.ceil(cut * 30) / 30]) {
    const left = project(time - 1e-9),
      right = project(time + 1e-9);
    expect(
      Math.max(...left.map((point, i) => Math.hypot(point.x - right[i]!.x, point.y - right[i]!.y)))
    ).toBeLessThanOrEqual(source.width / backing.width);
  }
  if (plan?.status !== 'ready') throw new Error('Expected admitted camera plan');
  expect(
    plan.discontinuities
      .filter((boundary) => boundary.reason === 'source')
      .map((boundary) => boundary.time)
  ).toEqual([cut]);
});
