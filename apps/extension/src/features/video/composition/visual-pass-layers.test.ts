import { createVideoProjectFromRecording } from '../project/factories/creation';
import { createVideoProjectMotionRegion } from '../project/motion';
import { bindMotionRegionToClip } from '../project/motion/source-binding';
import { REVIEW_CLICK_DEFAULT } from '../project/action-feedback/validation';
import { createQuickEditBorder } from '../project/scene/focus-appearance';
import { resolveEffectRuntimeVisualLayers } from './draw/effect-runtime';
import { createQuickEditSpotlight } from '../project/scene/focus-appearance';
import { expect, it } from 'vitest';
import { createEmptyVideoProject } from '../project/factories/creation';
import { createVideoClip } from '../project/timeline/project-meta.test.helpers';
import { resolveVideoCompositionFrame } from './timeline/frame';
import {
  resolveOrderedVisualPassLayers,
  splitVisualLayersForSourceSpotlights,
} from './visual-pass-layers';
it('preserves actions-only projections through ordered export passes without drawing the original video twice', () => {
  const project = createEmptyVideoProject('Composite');
  project.clips = [createVideoClip({ id: 'video', trackId: project.tracks[0]!.id })];
  const layer = resolveVideoCompositionFrame(project, 0).visualLayers[0]!;
  expect(layer).toBeDefined();
  const projected = { ...layer, effectActionsOnly: true };
  expect(resolveOrderedVisualPassLayers([projected], [layer])).toEqual([projected]);
  expect(resolveOrderedVisualPassLayers([layer], [layer])[0]).toBe(layer);
  expect(resolveOrderedVisualPassLayers([projected], [])).toEqual([]);
  expect(layer.effectActionsOnly).toBeUndefined();
});

it('preserves layers on both sides of a source mask and does not process action-only projections twice', () => {
  const project = createEmptyVideoProject('Ordered source mask');
  project.clips = ['below', 'source', 'above'].map((id) =>
    createVideoClip({ id, trackId: project.tracks[0]!.id })
  );
  const layers = resolveVideoCompositionFrame(project, 0).visualLayers;
  const source = layers[1]!;
  const actions = { ...source, effectActionsOnly: true };
  const state = {
    id: 'mask',
    clipId: source.clipId,
    afterClipId: source.clipId,
    spotlight: createQuickEditSpotlight(),
    phase: 'hold' as const,
    progress: 1,
  };
  expect(
    splitVisualLayersForSourceSpotlights([layers[0]!, source, actions, layers[2]!], [state])
  ).toEqual([
    { layers: [layers[0], source], afterClipId: source.clipId },
    { layers: [actions, layers[2]] },
  ]);
  expect(
    splitVisualLayersForSourceSpotlights(layers, [{ ...state, afterClipId: 'missing' }])
  ).toEqual([{ layers }]);
  expect(splitVisualLayersForSourceSpotlights(layers)).toEqual([{ layers }]);
  const grouped = [{ ...source, effectViewportRaster: true }, actions];
  expect(splitVisualLayersForSourceSpotlights(grouped, [state])).toEqual([{ layers: grouped }]);
});

it.each([
  ['actions', false],
  ['borders', false],
  ['actions', true],
  ['borders', true],
] as const)('keeps source %s above a scene mask with processed FX %s', (channel, processed) => {
  const project = createVideoProjectFromRecording({
    recordingId: 'source',
    filename: 'source.webm',
    width: 160,
    height: 90,
    duration: 2,
    size: 1,
    mimeType: 'video/webm',
    sourceNormalizedActionEvents: [
      {
        id: 'captured-click',
        kind: 'CLICK',
        time: 0.5,
        duration: 0,
        point: { x: 0.1, y: 0.5 },
        label: '',
        preset: 'NONE',
        data: {},
      },
    ],
  });
  project.version = 39;
  expect(project.actionFeedback).toHaveLength(1);
  project.actionFeedback![0]!.gestureStyles = [
    { ...REVIEW_CLICK_DEFAULT, id: 'captured-click', effect: 'ripple', before: 0, after: 1 },
  ];
  const source = project.clips.find((clip) => clip.type === 'VIDEO')!;
  const binding = (region: ReturnType<typeof createVideoProjectMotionRegion>) => {
    const bound = bindMotionRegionToClip(region, source);
    bound.sourceBinding!.coordinateSpace = 'source-window';
    return bound;
  };
  project.motionRegions = [
    binding({
      ...createVideoProjectMotionRegion(project, 0),
      duration: 2,
      spotlight: {
        ...createQuickEditSpotlight(),
        area: { x: 0.45, y: 0.45, width: 0.1, height: 0.1 },
      },
      spotlightTarget: 'source-scene',
    }),
    binding({
      ...createVideoProjectMotionRegion(project, 0),
      duration: 2,
      border: createQuickEditBorder(),
      borderTarget: 'window',
    }),
  ];
  const frame = resolveVideoCompositionFrame(project, 0.9);
  const original = frame.visualLayers.find((layer) => layer.clipId === source.id)!;
  if (original.kind !== 'video') throw new Error('Expected source video.');
  expect(original.actions).toHaveLength(1);
  expect(original.actions![0]!.gestureFeedback?.opacity).toBeGreaterThan(0);
  expect(original.actions![0]!.gestureFeedback?.radius).toBeGreaterThan(0);
  expect(original.borders).toHaveLength(1);
  const parts = splitVisualLayersForSourceSpotlights(
    resolveEffectRuntimeVisualLayers(
      frame.visualLayers,
      processed
        ? new Map([
            [
              'fx',
              {
                bitmap: { width: 160, height: 90, close() {} },
                effectInstanceId: 'fx',
                snapshotId: 'fx',
                kind: 'targetEffect',
                width: 160,
                height: 90,
                logicalWidth: 160,
                logicalHeight: 90,
                target: {
                  kind: 'clip',
                  clipId: source.id,
                  chainIndex: 0,
                  placement: source.transform,
                },
              },
            ],
          ])
        : undefined
    ),
    frame.sceneSpotlights
  );
  expect(parts[0]?.afterClipId).toBe(source.id);
  const body = parts[0]!.layers.find((layer) => layer.clipId === source.id)!;
  if (body.kind !== 'video') throw new Error('Expected source body.');
  expect(body[channel] ?? []).toEqual([]);
  const above = parts.slice(1).flatMap((part) => part.layers);
  expect(above.some((layer) => layer.kind === 'video' && layer[channel]?.length)).toBe(true);
  expect(above.filter((layer) => layer.kind === 'video' && layer.actions?.length)).toHaveLength(1);
  expect(
    above.filter(
      (layer) => layer.kind === 'video' && layer.deferSourceBorders && layer.borders?.length
    )
  ).toHaveLength(1);
  expect(original.actions).toHaveLength(1);
  expect(original.borders).toHaveLength(1);
  const sampled = resolveVideoCompositionFrame(project, 1).visualLayers;
  const sampledOwner = sampled.find((layer) => layer.clipId === source.id)!;
  if (sampledOwner.kind !== 'video') throw new Error('Expected sampled video.');
  const sampledBody = resolveOrderedVisualPassLayers(parts[0]!.layers, sampled)[0]!;
  if (sampledBody.kind !== 'video') throw new Error('Expected sampled body.');
  expect(sampledBody.actions).toEqual([]);
  expect(sampledBody.borders).toEqual([]);
  const sampledOverlay = resolveOrderedVisualPassLayers(above, sampled)[0]!;
  if (sampledOverlay.kind !== 'video') throw new Error('Expected sampled overlay.');
  expect(sampledOverlay.effectActionsOnly).toBe(true);
  expect(sampledOverlay.deferSourceBorders).toBe(true);
  expect(sampledOverlay.actions).toEqual(processed ? [] : sampledOwner.actions);
  expect(sampledOverlay.borders).toBe(sampledOwner.borders);
});

it.each([false, true])(
  'defers both source utility channels until one crossfade mask pass; processed=%s',
  (processed) => {
    const project = createVideoProjectFromRecording({
      recordingId: 'source',
      filename: 'source.webm',
      width: 160,
      height: 90,
      duration: 4,
      size: 1,
      mimeType: 'video/webm',
      sourceNormalizedActionEvents: [
        {
          id: 'click',
          kind: 'CLICK',
          time: 0.5,
          duration: 0,
          point: { x: 0.1, y: 0.5 },
          label: '',
          preset: 'NONE',
          data: {},
        },
      ],
    });
    project.actionFeedback![0]!.gestureStyles = [
      { ...REVIEW_CLICK_DEFAULT, id: 'click', effect: 'ripple', before: 0, after: 1 },
    ];
    const template = resolveVideoCompositionFrame(project, 0.9).visualLayers[0]!;
    if (template.kind !== 'video') throw new Error('Expected video.');
    expect(template.actions).toHaveLength(1);
    expect(template.actions![0]!.gestureFeedback?.opacity).toBeGreaterThan(0);
    const border = {
      id: 'border',
      border: createQuickEditBorder(),
      clock: {
        time: 1,
        duration: 4,
        enter: { type: 'none' as const, duration: 0 },
        exit: { type: 'none' as const, duration: 0 },
      },
    };
    const leading = { ...template, clipId: 'leading', borders: [border] };
    const trailing = { ...template, clipId: 'trailing', borders: [border] };
    const explicit = { ...leading, effectActionsOnly: true, borders: [] };
    const layers = processed ? [leading, explicit, trailing] : [leading, trailing];
    const before = structuredClone(layers);
    const mask = {
      id: 'mask',
      clipId: 'leading',
      afterClipId: 'trailing',
      sourceTransition: { id: 'focus', leadingClipId: 'leading', trailingClipId: 'trailing' },
      spotlight: createQuickEditSpotlight(),
      phase: 'hold' as const,
      progress: 1,
    };
    const parts = splitVisualLayersForSourceSpotlights(layers, [mask]);
    expect(parts.map((part) => part.afterClipId)).toEqual(['trailing', undefined]);
    expect(parts[0]!.layers.map((layer) => layer.clipId)).toEqual(['leading', 'trailing']);
    expect(
      parts[0]!.layers.every(
        (layer) => layer.kind === 'video' && !layer.borders?.length && !layer.actions?.length
      )
    ).toBe(true);
    expect(
      parts[1]!.layers.filter((layer) => layer.deferSourceBorders).map((layer) => layer.clipId)
    ).toEqual(['leading', 'trailing']);
    expect(
      parts[1]!.layers.filter((layer) => layer.kind === 'video' && layer.actions?.length)
    ).toHaveLength(2);
    if (processed) expect(parts[1]!.layers).toContainEqual(explicit);
    const { sourceTransition: _transition, ...localMask } = mask;
    const local = splitVisualLayersForSourceSpotlights(layers, [
      mask,
      { ...localMask, id: 'local', afterClipId: 'leading' },
    ]);
    expect(local.map((part) => part.afterClipId)).toEqual(['leading', 'trailing', undefined]);
    expect(
      local
        .slice(0, 2)
        .flatMap((part) => part.layers)
        .every(
          (layer) => layer.kind !== 'video' || (!layer.actions?.length && !layer.borders?.length)
        )
    ).toBe(true);
    expect(
      local[2]!.layers.filter((layer) => layer.kind === 'video' && layer.actions?.length)
    ).toHaveLength(2);
    expect(layers).toEqual(before);
  }
);
