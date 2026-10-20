import { motionCameraProjection } from './spatial';
import { projectQuickEditPoint, invertQuickEditProjection } from './spatial-geometry';
import { expect, it } from 'vitest';
import { createEmptyVideoProject } from '../../project/factories/creation';
import { createVideoProjectMotionRegion } from '../../project/motion';
import { DEFAULT_CAMERA_PERSPECTIVE, DEFAULT_CAMERA_DEPTH } from '../../project/motion/spatial';
import { applyVideoProjectMutationPatch } from '../../project/mutation';
import { resolveVideoCompositionCamera } from './index';
import { resolveVideoCompositionRenderPasses } from '../timeline/render';

function fixture() {
  const base = createEmptyVideoProject('Spatial camera clocks', 800, 450);
  base.duration = 8;
  const region = {
    ...createVideoProjectMotionRegion(base, 1, { enter: 'linear', exit: 'linear' }),
    duration: 4,
    zoomInDuration: 1,
    zoomOutDuration: 1,
    scale: 1,
    perspective: { ...DEFAULT_CAMERA_PERSPECTIVE, enabled: true, rotateZ: 80 },
    spatialReference: { x: 0.1, y: 0.2, width: 0.7, height: 0.6 },
  };
  const project = applyVideoProjectMutationPatch(base, { motionRegions: [region] });
  return { project, region };
}
function camera(project: ReturnType<typeof fixture>['project'], currentTime: number) {
  return resolveVideoCompositionCamera({ project, currentTime, actions: [], cursorSample: null });
}

it('evaluates enter exit and half-open edges on the retained camera clock', () => {
  const { project } = fixture();
  for (const time of [1.25, 4.75]) {
    const value = camera(project, time).spatial!;
    expect(value.rotation[2]).toBeCloseTo(Math.sin((10 * Math.PI) / 180), 9);
    expect(value.rotation[3]).toBeCloseTo(Math.cos((10 * Math.PI) / 180), 9);
    expect(value.reference).toEqual({ x: 80, y: 90, width: 560, height: 270 });
  }
  expect(camera(project, 0.999).spatial).toBeUndefined();
  expect(camera(project, 5).spatial).toBeUndefined();
  expect(camera(project, 3).spatial?.rotation[2]).toBeCloseTo(Math.sin((40 * Math.PI) / 180), 9);
  const retained = {
    ...project,
    motionRegions: [
      {
        ...project.motionRegions![0]!,
        startTime: 1.5,
        duration: 0.5,
        animation: { start: 0.5, end: 1, duration: 4 },
      },
    ],
  };
  expect(camera(retained, 1.75).spatial?.rotation).toEqual(camera(project, 1.75).spatial?.rotation);
});

it('keeps neutral disabled and hidden cameras on their ordinary path while retaining depth-only focus', () => {
  const { project, region } = fixture();
  for (const perspective of [
    { ...region.perspective, enabled: false },
    { ...region.perspective, rotateZ: 0 },
  ])
    expect(
      camera({ ...project, motionRegions: [{ ...region, perspective }] }, 2).spatial
    ).toBeUndefined();
  const depth = {
    ...region,
    perspective: { ...region.perspective, enabled: false },
    depthOfField: { ...DEFAULT_CAMERA_DEPTH, enabled: true },
  };
  const value = camera({ ...project, motionRegions: [depth] }, 2).spatial!;
  expect(value.rotation).toEqual([0, 0, 0, 1]);
  expect(value.focus).toHaveLength(1);
  expect(
    camera(
      {
        ...project,
        utilityLanes: {
          actions: { visible: true, locked: false },
          camera: { visible: false, locked: false },
        },
      },
      2
    ).spatial
  ).toBeUndefined();
});

it('interpolates explicit links without accumulating rotation and interpolates the independent reference', () => {
  const { project, region } = fixture();
  const source = { ...region, id: 'source', duration: 2 };
  const target = {
    ...region,
    id: 'target',
    startTime: 5,
    duration: 2,
    perspective: { ...region.perspective, rotateZ: -80 },
    spatialReference: { x: 0, y: 0, width: 1, height: 1 },
    incomingConnection: { fromRegionId: 'source', easing: 'LINEAR' as const },
  };
  const linked = { ...project, motionRegions: [source, target] };
  const middle = camera(linked, 4).spatial!;
  expect(middle.rotation).toEqual([0, 0, 0, 1]);
  expect(middle.reference).toEqual({ x: 40, y: 45, width: 680, height: 360 });
});

it('retains rotation-only temporal exposure when affine scale and pan stay constant', () => {
  const { project, region } = fixture();
  const result = resolveVideoCompositionRenderPasses(
    { ...project, motionRegions: [{ ...region, motionBlurAmount: 1 }] },
    1.25
  );
  expect(result.visualPasses).toHaveLength(5);
  expect(
    result.visualPasses.every(
      (pass) =>
        pass.frame.camera.scale === 1 &&
        pass.frame.camera.viewportX === 0 &&
        pass.frame.camera.viewportY === 0
    )
  ).toBe(true);
  expect(result.visualPasses[0]!.frame.camera.spatial?.rotation).not.toEqual(
    result.visualPasses[4]!.frame.camera.spatial?.rotation
  );
});

it('projects the authored reference around its own center with an independent point oracle', () => {
  const { project, region } = fixture();
  const rolled = {
    ...project,
    motionRegions: [
      { ...region, perspective: { ...region.perspective, rotateZ: 90, strength: 0 } },
    ],
  };
  const projection = motionCameraProjection(camera(rolled, 3))!;
  const point = projectQuickEditPoint(projection, { x: 80, y: 90 })!;
  expect(point.x).toBeCloseTo(495, 9);
  expect(point.y).toBeCloseTo(-55, 9);
  const tilted = {
    ...project,
    motionRegions: [
      { ...region, perspective: { ...region.perspective, rotateZ: 0, rotateY: 30, strength: 1 } },
    ],
  };
  const matrix = motionCameraProjection(camera(tilted, 3))!;
  const actual = projectQuickEditPoint(matrix, { x: 80, y: 90 })!;
  const denominator = 1 - (0.35 * 280) / Math.hypot(560, 270);
  expect(actual.x).toBeCloseTo(360 - (Math.cos(Math.PI / 6) * 280) / denominator, 9);
  expect(actual.y).toBeCloseTo(225 - 135 / denominator, 9);
  const restored = projectQuickEditPoint(invertQuickEditProjection(matrix)!, actual)!;
  expect(restored.x).toBeCloseTo(80, 9);
  expect(restored.y).toBeCloseTo(90, 9);
});

it('retains None Instant and legacy easing semantics for the spatial pose', () => {
  const { project, region } = fixture();
  const none = {
    ...project,
    motionRegions: [
      { ...region, phaseTransitions: { enter: 'none' as const, exit: 'none' as const } },
    ],
  };
  expect(camera(none, 1).spatial?.rotation[2]).toBeCloseTo(Math.sin((40 * Math.PI) / 180), 9);
  expect(camera(none, 4.999).spatial?.rotation[2]).toBeCloseTo(Math.sin((40 * Math.PI) / 180), 9);
  const instant = {
    ...project,
    motionRegions: [
      { ...region, phaseTransitions: { enter: 'instant' as const, exit: 'instant' as const } },
    ],
  };
  expect(camera(instant, 1).spatial?.rotation[2]).toBe(0);
  expect(camera(instant, 1.001).spatial?.rotation[2]).toBeCloseTo(
    Math.sin((40 * Math.PI) / 180),
    9
  );
  const { phaseTransitions: _phases, ...legacyRegion } = region;
  const legacy = {
    ...project,
    motionRegions: [{ ...legacyRegion, easing: 'EASE_IN_OUT' as const }],
  };
  expect(camera(legacy, 1.25).spatial?.rotation[2]).toBeCloseTo(Math.sin((2.5 * Math.PI) / 180), 9);
});

it('maps interactive points through the actual projective plane and refuses an invalid inverse', async () => {
  const { mapCompositionPointThroughCamera: forward, mapViewportPointToComposition: inverse } =
    await import('./index');
  const { project, region } = fixture();
  const state = camera(
    {
      ...project,
      motionRegions: [
        { ...region, perspective: { ...region.perspective, rotateZ: 0, rotateY: 30, strength: 1 } },
      ],
    },
    3
  );
  const denominator = 1 - (0.35 * 280) / Math.hypot(560, 270);
  const expected = {
    x: 360 - (Math.cos(Math.PI / 6) * 280) / denominator,
    y: 225 - 135 / denominator,
  };
  expect(forward({ x: 80, y: 90 }, state)).toEqual({
    x: expect.closeTo(expected.x, 9),
    y: expect.closeTo(expected.y, 9),
  });
  expect(inverse(expected, state)).toEqual({ x: expect.closeTo(80, 9), y: expect.closeTo(90, 9) });
  expect(inverse({ x: Number.NaN, y: 20 }, state)).toBeNull();
  expect(inverse({ x: 20, y: 20 }, { ...state, scale: 0 })).toBeNull();
  expect(forward({ x: Infinity, y: 20 }, state)).toBeNull();
  expect(
    inverse(
      { x: 20, y: 20 },
      { ...state, spatial: { ...state.spatial!, reference: { x: 0, y: 0, width: 0, height: 0 } } }
    )
  ).toBeNull();
});
