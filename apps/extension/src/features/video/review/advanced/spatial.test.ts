import { describe, expect, it } from 'vitest';
import { evaluateQuickEditCameraAtTime } from './scene';
import { createQuickEditZoomRegion, updateQuickEditZoomRegion } from './zoom';
import {
  DEFAULT_QUICK_EDIT_PERSPECTIVE,
  DEFAULT_QUICK_EDIT_DEPTH,
  parseQuickEditPerspective,
  parseQuickEditDepth,
  quickEditSpatialSpan,
} from './spatial';
import { loadQuickEditAdvancedState } from './validation';
import { createQuickEditAdvancedState } from './defaults';

const a = {
  ...createQuickEditZoomRegion({ id: 'a', at: 0, duration: 2 }),
  perspective: { ...DEFAULT_QUICK_EDIT_PERSPECTIVE, enabled: true, rotateY: 40 },
  linkTo: 'b',
  linkEasing: 'linear' as const,
};
const b = {
  ...createQuickEditZoomRegion({ id: 'b', at: 4, duration: 2 }),
  transform: { scale: 2, centerX: 0.3, centerY: 0.4 },
};

describe('spatial zoom contract', () => {
  it('interpolates perspective to ordinary zoom without resetting scale or accumulating rotation', () => {
    const start = evaluateQuickEditCameraAtTime([a, b], 2);
    const middle = evaluateQuickEditCameraAtTime([a, b], 3);
    const end = evaluateQuickEditCameraAtTime([a, b], 4);
    expect(start.spatial?.rotation[1]).toBeCloseTo(Math.sin((20 * Math.PI) / 180));
    expect(middle.spatial?.rotation[1]).toBeCloseTo(Math.sin((10 * Math.PI) / 180));
    expect(middle.scale).toBe(1.75);
    expect(end.spatial?.rotation).toEqual([0, 0, 0, 1]);
    expect(end.scale).toBe(2);
    expect(quickEditSpatialSpan([a, b], 5.9)).toBe(true);
    expect(quickEditSpatialSpan([a, b], 6)).toBe(false);
  });
  it('takes the short rotation path and crossfades blur modes', () => {
    const left = {
      ...a,
      perspective: { ...a.perspective, rotateZ: 170 },
      depthOfField: { ...DEFAULT_QUICK_EDIT_DEPTH, enabled: true },
    };
    const right = {
      ...b,
      perspective: { ...a.perspective, rotateZ: -170 },
      depthOfField: { ...DEFAULT_QUICK_EDIT_DEPTH, enabled: true, mode: 'area' as const },
    };
    const frame = evaluateQuickEditCameraAtTime([left, right], 3).spatial!;
    expect(Math.abs(frame.rotation[2])).toBeGreaterThan(0.9);
    expect(frame.focus.map((f) => f.weight)).toEqual([0.5, 0.5]);
    expect(frame.focus.map((f) => f.settings.mode)).toEqual(['depth', 'area']);
  });
  it('preserves settings through workspace parsing and ignores disabled and non-zoom settings', () => {
    const state = createQuickEditAdvancedState();
    state.zoom.regions = [a, b];
    expect(loadQuickEditAdvancedState(state)?.zoom.regions[0]?.perspective).toEqual(a.perspective);
    const disabled = { ...a, perspective: { ...a.perspective, enabled: false } };
    expect(evaluateQuickEditCameraAtTime([disabled, b], 1).spatial).toBeUndefined();
    expect(parseQuickEditPerspective({ ...a.perspective, rotateX: Infinity })).toBeNull();
    expect(parseQuickEditDepth({ ...DEFAULT_QUICK_EDIT_DEPTH, softness: 0 })).toBeNull();
    expect(
      updateQuickEditZoomRegion([a], 'a', { perspective: { ...a.perspective, rotateY: 100 } })
    ).toEqual([a]);
  });
  it('uses exact half-open bounds and does not invent a removed link', () => {
    expect(evaluateQuickEditCameraAtTime([a], 3).spatial).toBeUndefined();
    expect(evaluateQuickEditCameraAtTime([a, b], 6).spatial).toBeUndefined();
    const touching = { ...b, start: 2 };
    expect(evaluateQuickEditCameraAtTime([a, touching], 2).scale).toBe(1);
  });
});

it('retains optional settings while changing focus type and duplicating projected source slices', async () => {
  const { projectReviewFocus } = await import('../focus-edits');
  const changed = updateQuickEditZoomRegion([a], 'a', {
    depthOfField: { ...DEFAULT_QUICK_EDIT_DEPTH, enabled: true },
  });
  const anchored = { ...changed[0]!, sourceAnchor: { start: 0, end: 2 } };
  const slices = projectReviewFocus(
    [anchored],
    [
      { kind: 'keep', sourceStart: 0, sourceEnd: 1, resultStart: 0, resultEnd: 1, rate: 1 },
      { kind: 'keep', sourceStart: 1, sourceEnd: 2, resultStart: 1, resultEnd: 1.5, rate: 2 },
    ]
  );
  expect(slices.length).toBeGreaterThan(0);
  expect(slices.every((r) => r.perspective?.rotateY === 40 && r.depthOfField?.enabled)).toBe(true);
});

it('keeps a mixed three-zoom chain fixed and interpolates ordinary to perspective only once', () => {
  const middle = { ...b, linkTo: 'c', linkEasing: 'linear' as const };
  const { linkTo: _link, ...unlinked } = a;
  const last = {
    ...unlinked,
    id: 'c',
    start: 8,
    end: 10,
    perspective: { ...a.perspective, rotateY: -40 },
  };
  const chain = [a, middle, last];
  expect(quickEditSpatialSpan(chain, 7)).toBe(true);
  const pose = evaluateQuickEditCameraAtTime(chain, 7);
  expect(pose.spatial?.rotation[1]).toBeCloseTo(Math.sin((-10 * Math.PI) / 180));
  expect(pose.scale).toBe(1.75);
  expect(pose.spatial?.windowMotion).toBe(0.5);
  expect(evaluateQuickEditCameraAtTime(chain, 10).spatial).toBeUndefined();
  expect(quickEditSpatialSpan([middle, last], 3)).toBe(false);
});

it('preserves the visual anchor when switching a projected comment between content and viewport', async () => {
  const { createCanvasComment, switchCanvasCommentAttachment } = await import('../comments');
  const { quickEditPlaneProjection } = await import('./spatial-geometry');
  const { quickEditSpatialTargetCamera } = await import('./spatial');
  const window = { x: 100, y: 70, width: 600, height: 360 };
  const geometry = {
    output: { width: 800, height: 500 },
    videoTransform: window,
    projection: quickEditPlaneProjection(window, window, quickEditSpatialTargetCamera(a).spatial!),
  };
  const content = { ...createCanvasComment({ id: 'c' }), position: { x: 0.3, y: 0.4 } };
  const projected = switchCanvasCommentAttachment(content, 'viewport', geometry)!;
  const restored = switchCanvasCommentAttachment(
    { ...content, ...projected, attachment: 'viewport' },
    'content',
    geometry
  )!;
  expect(restored.position.x).toBeCloseTo(content.position.x, 6);
  expect(restored.position.y).toBeCloseTo(content.position.y, 6);
});
