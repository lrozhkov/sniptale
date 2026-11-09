import { expect, it } from 'vitest';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
import { createQuickEditZoomRegion } from '../../features/video/review/advanced/zoom';
import { resolveQuickEditEffectiveState } from '../../features/video/review/advanced/effective';
import { classifyReviewExportMagnification, planReviewExportSource } from './export-source-plan';
import { hasMagnificationDemand } from '../../features/video/composition/export-enhancement/prepared-source';
import { DEFAULT_CAMERA_PERSPECTIVE } from '../../features/video/project/motion/spatial';
import { REVIEW_CLICK_DEFAULT } from '../../features/video/review/advanced/click-animation';
import { createQuickEditSpotlight } from '../../features/video/project/scene/focus-appearance';
function fixture() {
  const advanced = createQuickEditAdvancedState();
  return {
    advanced,
    sourceSize: { width: 1280, height: 720 },
    output: { width: 1280, height: 720 },
  };
}
it('proves static no-growth windows without inferring dynamic or historical absence', () => {
  const args = fixture();
  expect(classifyReviewExportMagnification(args)).toBe('none');
  expect(classifyReviewExportMagnification({ ...args, recordingHistory: true })).toBe('unknown');
  args.advanced.ui.mode = 'advanced';
  args.advanced.ui.tracks.zoom = true;
  args.advanced.zoom.enabled = true;
  args.advanced.zoom.regions = [createQuickEditZoomRegion({ id: 'late', at: 100, duration: 1 })];
  expect(classifyReviewExportMagnification(args)).toBe('unknown');
});
it('detects actual output enlargement through canonical geometry', () => {
  const args = fixture();
  expect(
    classifyReviewExportMagnification({ ...args, output: { width: 2560, height: 1440 } })
  ).toBe('growth');
});
it('keeps original sample identity and exact output clock in body demands', () => {
  const args = fixture(),
    effective = resolveQuickEditEffectiveState(args.advanced);
  const identity = { sourceKey: {}, sourceTime: 17.25, passTime: 3.5, sourceSize: args.sourceSize };
  const plan = planReviewExportSource({
    identity,
    output: args.output,
    resultTime: 3.5,
    scene: {
      sourceSize: args.sourceSize,
      background: effective.background,
      zoomRegions: [],
    },
  });
  expect(plan.demands).toHaveLength(1);
  expect(plan.demands[0]).toMatchObject(identity);
  expect(hasMagnificationDemand(plan.demands)).toBe(false);
});
it.each([1.5, 2, 3])('plans the original visible source ROI before camera scale %s', (scale) => {
  const args = fixture(),
    effective = resolveQuickEditEffectiveState(args.advanced);
  const region = createQuickEditZoomRegion({ id: 'camera', at: 0, duration: 10 });
  region.enter.duration = region.exit.duration = 0;
  region.transform.scale = scale;
  const plan = planReviewExportSource({
    identity: { sourceKey: {}, sourceTime: 2, passTime: 1, sourceSize: args.sourceSize },
    output: args.output,
    resultTime: 1,
    scene: {
      sourceSize: args.sourceSize,
      background: effective.background,
      zoomRegions: [region],
    },
  });
  expect(plan.exposures[0]!.body.originalPixelROI.width).toBeCloseTo(
    args.sourceSize.width / scale,
    8
  );
  expect(plan.exposures[0]!.body.targetRasterSize.width).toBeGreaterThanOrEqual(args.output.width);
  expect(plan.exposures[0]!.body.targetRasterSize.width).toBeLessThanOrEqual(args.output.width + 1);
});
it('composes 3D, optical spotlight and click density once while retaining source and pass clocks', () => {
  const args = fixture(),
    effective = resolveQuickEditEffectiveState(args.advanced);
  const camera = createQuickEditZoomRegion({ id: 'camera', at: 0, duration: 10 });
  camera.enter.duration = camera.exit.duration = 0;
  camera.transform.scale = 2;
  camera.perspective = { ...DEFAULT_CAMERA_PERSPECTIVE, enabled: true, rotateY: 15 };
  const lens = createQuickEditZoomRegion({ id: 'lens', at: 0, duration: 10 });
  lens.enter.duration = lens.exit.duration = 0;
  lens.spotlight = {
    ...createQuickEditSpotlight(),
    effect: 'magnify',
    magnification: 2,
    lensOptics: 'optical',
  };
  const identity = { sourceKey: {}, sourceTime: 7.25, passTime: 1, sourceSize: args.sourceSize };
  const plan = planReviewExportSource({
    identity,
    output: args.output,
    resultTime: 1,
    scene: {
      sourceSize: args.sourceSize,
      background: effective.background,
      zoomRegions: [camera, lens],

      clickCues: [
        {
          settings: {
            ...REVIEW_CLICK_DEFAULT,
            effect: 'magnify',
            magnification: 2,
            lensOptics: 'optical',
          },
          point: { x: 0.5, y: 0.5 },
          anchor: 0,
          start: 0,
          end: 10,
        },
      ],
    },
  });
  expect(plan.layout.spatial).toBeDefined();
  expect(plan.lenses.map((l) => l.kind)).toEqual(['scene', 'click']);
  for (const d of plan.demands) {
    expect(d.sourceKey).toBe(identity.sourceKey);
    expect(d.sourceTime).toBe(7.25);
    expect(d.passTime).toBe(1);
    expect(d.originalPixelROI.x).toBeGreaterThanOrEqual(0);
  }
  const body = plan.exposures[0]!.body;
  expect(
    plan.lenses[0]!.demand.targetRasterSize.width / plan.lenses[0]!.demand.originalPixelROI.width
  ).toBeGreaterThan(body.targetRasterSize.width / body.originalPixelROI.width);
});
it('plans every camera exposure for a scene lens while click magnification retains its sharp nominal camera', () => {
  const args = fixture(),
    effective = resolveQuickEditEffectiveState(args.advanced);
  const camera = createQuickEditZoomRegion({ id: 'blur', at: 0, duration: 10 });
  camera.enter.duration = 1;
  camera.transform.scale = 3;
  camera.motionBlur = { enter: { enabled: true, strength: 0.7 } };
  const lens = createQuickEditZoomRegion({ id: 'lens', at: 0, duration: 10 });
  lens.enter.duration = lens.exit.duration = 0;
  lens.spotlight = { ...createQuickEditSpotlight(), effect: 'magnify', magnification: 2 };
  const plan = planReviewExportSource({
    identity: { sourceKey: {}, sourceTime: 4, passTime: 0.5, sourceSize: args.sourceSize },
    resultTime: 0.5,
    output: args.output,
    scene: {
      sourceSize: args.sourceSize,
      background: effective.background,
      zoomRegions: [camera, lens],

      clickCues: [
        {
          settings: { ...REVIEW_CLICK_DEFAULT, effect: 'magnify', magnification: 2 },
          point: { x: 0.5, y: 0.5 },
          anchor: 0,
          start: 0,
          end: 10,
        },
      ],
    },
  });
  expect(plan.exposures.length).toBeGreaterThan(1);
  expect(plan.lenses.find((l) => l.kind === 'scene')!.demands).toHaveLength(plan.exposures.length);
  expect(plan.lenses.find((l) => l.kind === 'click')!.demands).toHaveLength(1);
  expect(new Set(plan.demands.map((d) => d.id)).size).toBe(plan.demands.length);
  expect(plan.demands.every((d) => d.sourceTime === 4 && d.passTime === 0.5)).toBe(true);
});
