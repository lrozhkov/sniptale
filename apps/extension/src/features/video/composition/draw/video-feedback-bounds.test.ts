// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { createProject, createVideoClip } from '../../project/timeline/project-meta.test.helpers';
import { createQuickEditBorder } from '../../project/scene/focus-appearance';
import { resolveVideoCompositionRenderPasses } from '../timeline/render';
import type { VideoCompositionActionState } from '../types';
import { resolveVideoSourceActionPaintBounds } from './video';

function fixture() {
  const clip = createVideoClip({
    transform: { x: 0, y: 0, width: 100, height: 50, opacity: 1, rotation: 0 },
  });
  const project = createProject([clip]);
  const layer = resolveVideoCompositionRenderPasses(project, 1).overlayFrame.visualLayers[0]!;
  if (layer.kind !== 'video') throw new Error('Expected video');
  const event = {
    id: 'click',
    kind: 'CLICK' as const,
    label: 'Click',
    anchor: { kind: 'project' as const, time: 0 },
    data: {},
    point: { x: 0.25, y: 0.5 },
  };
  const action: VideoCompositionActionState = {
    clipId: clip.id,
    duration: 1,
    event,
    occurrence: {
      event,
      eventId: event.id,
      clipId: clip.id,
      time: 0,
      sourceInstanceId: null,
      playbackRun: null,
    },
    point: event.point,
    preset: 'CLICK_RIPPLE',
    progress: 0.5,
    renderKind: 'accent',
    start: 0,
    gestureFeedback: {
      effect: 'ripple',
      point: event.point,
      radius: 2,
      stroke: 1,
      opacity: 1,
      color: '#ff0000',
    },
  };
  layer.actions = [action];
  const source = { sourceWidth: 100, sourceHeight: 50 };
  const resolve = () => resolveVideoSourceActionPaintBounds(layer, source, 1, {});
  return { layer, source, action, resolve };
}

it('bounds the canonical normalized source point and stroke with integer AA support', () => {
  const f = fixture();
  expect(f.resolve()).toEqual({ x: 20, y: 20, width: 10, height: 10 });
});
it('mirrors a camera point before source framing', () => {
  const f = fixture();
  f.layer.trackRole = 'CAMERA';
  f.layer.clip = { ...f.layer.clip, cameraMirrored: true };
  expect(f.resolve()).toEqual({ x: 70, y: 20, width: 10, height: 10 });
});
it('keeps source framing in the painter coordinate system', () => {
  const f = fixture();
  f.layer.sourceContentTransform = [2, 0, 3, 0, 1.5, -4, 0, 0, 1];
  expect(f.resolve()).toEqual({ x: 44, y: 26, width: 18, height: 15 });
});
it('unions projected path and area footprints before framing', () => {
  const f = fixture();
  f.layer.actions = [
    {
      ...f.action,
      gestureFeedback: {
        ...f.action.gestureFeedback!,
        path: [
          { x: 0.1, y: 0.2 },
          { x: 0.9, y: 0.8 },
        ],
        area: { x: 0.2, y: 0.1, width: 0.3, height: 0.3 },
      },
    },
  ];
  expect(f.resolve()).toEqual({ x: 7, y: 2, width: 86, height: 41 });
});
it.each(['none', 'null', 'point'] as const)('recognizes known empty feedback: %s', (kind) => {
  const f = fixture();
  f.layer.actions = [
    {
      ...f.action,
      ...(kind === 'none'
        ? { preset: 'NONE' as const }
        : kind === 'null'
          ? { renderKind: null }
          : { point: null }),
    },
  ];
  expect(f.resolve()).toBeNull();
});
it.each(['key', 'border', 'projective', 'invalid'] as const)(
  'preserves full-raster fallback for %s',
  (kind) => {
    const f = fixture();
    if (kind === 'key') f.layer.actions = [{ ...f.action, renderKind: 'keystroke' }];
    if (kind === 'border')
      f.layer.borders = [
        {
          id: 'border',
          clock: {
            time: 0,
            duration: 1,
            enter: { type: 'none', duration: 0 },
            exit: { type: 'none', duration: 0 },
          },
          border: createQuickEditBorder(),
        },
      ];
    if (kind === 'projective') f.layer.sourceContentTransform = [1, 0, 0, 0, 1, 0, 0.1, 0, 1];
    if (kind === 'invalid') f.layer.actions = [{ ...f.action, point: { x: NaN, y: 0.5 } }];
    expect(f.resolve()).toBeUndefined();
  }
);

it('bounds oversized source feedback by the painter clip before raster allocation', () => {
  const f = fixture();
  f.layer.actions = [
    { ...f.action, gestureFeedback: { ...f.action.gestureFeedback!, radius: 200 } },
  ];
  expect(f.resolve()).toEqual({ x: -2, y: -2, width: 104, height: 54 });
});
