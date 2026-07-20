import { expect, it } from 'vitest';

import { validateEffectV1Document } from '../index';
import { createEffectV1TestDocument, validationCodes } from './test-support';

it('reports nested layer, asset, scene, clip, and control violations without repair', () => {
  const document = createInvalidAuthoringDocument();

  expect(validationCodes(document)).toEqual(
    expect.arrayContaining([
      'LAYER_ID_DUPLICATE',
      'LAYER_KIND',
      'LAYER_SIZE_REQUIRED',
      'LAYER_ASSET_UNKNOWN',
      'LAYER_ASSET_KIND',
      'LAYER_TEXT_REQUIRED',
      'GROUP_FIELD_FORBIDDEN',
      'SCENE_ID_DUPLICATE',
      'CLIP_LAYER_DUPLICATE',
      'GROUP_CLIP_FORBIDDEN',
      'CLIP_SCENE_UNKNOWN',
      'CLIP_OFFSET',
      'CONTROL_ID_DUPLICATE',
      'CONTROL_RANGE',
      'CONTROL_STEP',
      'CONTROL_DEFAULT_RANGE',
      'CONTROL_STRING',
    ])
  );
});

it('validates phases, tracks, handles, and motion paths at exact authoring seams', () => {
  const document = createInvalidTimelineDocument();

  expect(validationCodes(document)).toEqual(
    expect.arrayContaining([
      'PHASE_ID_DUPLICATE',
      'PHASE_SCENE_UNKNOWN',
      'TRACK_SCENE_UNKNOWN',
      'TRACK_PHASE_UNKNOWN',
      'KEYFRAME_ORDER',
      'KEYFRAME_SCENE_UNKNOWN',
      'KEYFRAME_PHASE_UNKNOWN',
      'KEYFRAME_HANDLE_NUMBER',
      'MOTION_PATH_LAYER_UNKNOWN',
      'MOTION_POINT_KEYFRAME_UNKNOWN',
      'MOTION_POINT_KIND',
      'MOTION_TANGENT_NUMBER',
    ])
  );
});

it('accepts a layer-bound consumed track and rejects an unused editable track', () => {
  const document = createEffectV1TestDocument();
  document.layers = [{ id: 'card', name: 'Card', type: 'customDraw' }];
  document.clips = [{ duration: 2, layerId: 'card', sceneId: 'main', start: 0 }];
  document.timeline.tracks = [
    {
      id: 'card.opacity',
      keyframes: [
        { id: 'start', time: 0, value: 0 },
        { id: 'end', time: 2, value: 1 },
      ],
      property: 'opacity',
      target: 'card',
    },
  ];

  expect(validationCodes(document)).toContain('TRACK_UNUSED');
  document.program.commands.push({
    alpha: { op: 'read', path: 'tracks.card.opacity' },
    fill: '#fff',
    height: 10,
    layerId: 'card',
    op: 'shape',
    shape: 'rect',
    width: 10,
    x: 0,
    y: 0,
  });
  expect(validateEffectV1Document(document).ok).toBe(true);
});

it.each([
  ['scenes', { scenes: [] }, 'SCENES_REQUIRED'],
  ['clips', { clips: 'invalid' }, 'CLIPS_TYPE'],
  ['controls', { controls: 'invalid' }, 'CONTROLS_TYPE'],
  ['layers', { layers: 'invalid' }, 'LAYERS_TYPE'],
  ['timeline', { timeline: [] }, 'TIMELINE_TYPE'],
])('rejects malformed %s collections', (_name, replacement, code) => {
  const document = Object.assign(createEffectV1TestDocument(), replacement);
  expect(validationCodes(document)).toContain(code);
});

function createInvalidAuthoringDocument() {
  const document = createEffectV1TestDocument();
  document.assets = [
    {
      byteLength: 1,
      id: 'image',
      kind: 'image',
      mimeType: 'image/png',
      path: 'assets/image.png',
      sha256: 'a'.repeat(64),
    },
  ];
  document.layers = [
    { id: 'group', type: 'group', width: 10 },
    { assetId: 'missing', height: -1, id: 'image', type: 'imageAsset', width: 0 },
    { assetId: 'image', id: 'audio', type: 'audio' },
    { id: 'text', type: 'text' },
    { id: 'image', type: 'unknown' },
  ];
  Object.assign(document.layers[1]!, { editor: { properties: [1], typo: true }, visible: 'yes' });
  document.scenes = [
    { duration: 3, enabled: true, id: 'main', start: -1 },
    { duration: 1, id: 'main', start: 0 },
  ];
  document.clips = [
    { duration: 3, layerId: 'group', offset: Number.NaN, sceneId: 'missing', start: 0 },
    { duration: 1, layerId: 'group', start: 0 },
  ];
  document.controls = [
    { defaultValue: 2, id: 'density', kind: 'number', max: 1, min: 1, step: 0 },
    { defaultValue: '#fff', id: 'density', kind: 'color' },
  ];
  Object.assign(document.controls[1]!, { defaultValue: 3 });
  return document;
}

function createInvalidTimelineDocument() {
  const document = createEffectV1TestDocument();
  document.layers = [{ id: 'card', name: 'Card', type: 'customDraw' }];
  document.clips = [{ duration: 2, layerId: 'card', sceneId: 'main', start: 0 }];
  document.timeline.phases = [
    { duration: 1, enabled: true, id: 'resolve', sceneId: 'main', start: 0 },
    { duration: 1, id: 'resolve', sceneId: 'missing', start: 1 },
  ];
  document.timeline.tracks = [
    {
      enabled: true,
      id: 'card.position',
      keyframes: [
        { handles: { x1: 0, x2: 1, y1: 0, y2: 1 }, id: 'late', time: 1, value: 1 },
        { enabled: true, id: 'early', phaseId: 'missing', sceneId: 'missing', time: 0, value: 0 },
      ],
      layerId: 'card',
      phaseId: 'missing',
      sceneId: 'missing',
    },
  ];
  Object.assign(document.timeline.tracks[0]!.keyframes[0]!, {
    handles: { x1: Number.NaN, x2: 1, y1: 0, y2: 1, z: 2 },
  });
  document.timeline.motionPaths = [
    {
      layerId: 'missing',
      points: [
        {
          inTangent: { x: Number.NaN, y: 0 },
          kind: 'linear',
          outTangent: { x: 1, y: 1 },
          xKeyframeId: 'missing-x',
          yKeyframeId: 'missing-y',
        },
      ],
    },
  ];
  Object.assign(document.timeline.motionPaths[0]!.points[0]!, { kind: 'invalid' });
  return document;
}
