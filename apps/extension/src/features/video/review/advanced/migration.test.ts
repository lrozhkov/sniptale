import { createQuickEditBorder } from './border';
import { reviewSpeechTextSignature } from '../speech-transcript';
import { loadQuickEditAdvancedState, loadQuickEditAdvancedContentState } from './validation';
import { reviewAdvancedContentBaseline } from '../document';
import { createQuickEditWebcam } from './webcam';
import { createQuickEditWatermark } from './watermark';
import { expect, it } from 'vitest';
import { buildReviewTimeMap } from '../timeline';
import { migrateQuickEditAdvancedV1 } from './migration';
import { createQuickEditAdvancedState } from './defaults';
import { QUICK_EDIT_ADVANCED_SCHEMA_VERSION, type QuickEditAdvancedState } from './types';

/** cut [0,2) + speed [2,6)x2 + keep [6,12): source 8 sits at result time 4. */
const segments = buildReviewTimeMap(12, [
  { id: 'cut-1', start: 0, end: 2, requestedStart: 0, requestedEnd: 2, kind: 'cut' },
  {
    id: 'speed-1',
    start: 2,
    end: 6,
    requestedStart: 2,
    requestedEnd: 6,
    kind: 'speed',
    rate: 2,
    audio: 'speed',
  },
]);

const v1State = (): QuickEditAdvancedState => {
  const state = createQuickEditAdvancedState();
  return {
    ...state,
    schemaVersion: 1 as unknown as QuickEditAdvancedState['schemaVersion'],
    zoom: {
      enabled: true,
      regions: [
        {
          id: 'zoom-1',
          start: 8,
          end: 10,
          transform: { scale: 1.5, centerX: 0.5, centerY: 0.5 },
          enter: { type: 'ease-in-out', duration: 0.3 },
          exit: { type: 'ease-in-out', duration: 0.3 },
        },
        {
          id: 'zoom-2',
          start: 0.5,
          end: 1.5,
          transform: { scale: 2, centerX: 0.5, centerY: 0.5 },
          enter: { type: 'none', duration: 0 },
          exit: { type: 'none', duration: 0 },
        },
      ],
    },
    audio: {
      original: state.audio.original,
      voiceover: [
        {
          id: 'voice-1',
          assetId: 'project-asset:1',
          timelineStart: 8,
          sourceOffset: 0,
          duration: 2,
          volume: 1,
          muted: false,
          fadeIn: 0,
          fadeOut: 0,
        },
      ],
      music: [],
    },
  };
};

it('converts v1 placements from source time to result time', () => {
  const migrated = migrateQuickEditAdvancedV1(v1State(), segments);
  expect(migrated.schemaVersion).toBe(QUICK_EDIT_ADVANCED_SCHEMA_VERSION);
  expect(migrated.zoom.regions[0]).toMatchObject({ start: 4, end: 6, dormant: false });
  expect(migrated.audio.voiceover[0]).toMatchObject({ timelineStart: 4, dormant: false });
});

it('keeps placements whose source points were removed dormant and unapplied', () => {
  const migrated = migrateQuickEditAdvancedV1(v1State(), segments);
  expect(migrated.zoom.regions[1]).toMatchObject({ start: 0.5, end: 1.5, dormant: true });
});

it('retains the pre-conversion v1 payload for recovery', () => {
  const legacy = v1State();
  const migrated = migrateQuickEditAdvancedV1(legacy, segments);
  expect(JSON.parse(migrated.recoveryV1!)).toMatchObject({
    schemaVersion: 1,
    zoom: legacy.zoom,
  });
});

it('admits released v4 without dropping webcam, focus or speech content', () => {
  const state = createQuickEditAdvancedState();
  state.webcam = createQuickEditWebcam(
    'project-asset:camera',
    { width: 640, height: 480 },
    { width: 1920, height: 1080 }
  );
  state.zoom = v1State().zoom;
  state.zoom.regions[0]!.border = createQuickEditBorder();
  const profile = { modelId: 'model', voiceId: 'voice', responseFormat: 'wav' as const };
  state.audio.voiceover = [
    {
      ...v1State().audio.voiceover[0]!,
      transcript: {
        version: 1,
        phrases: [],
        replacements: [
          {
            id: 'replacement',
            start: 0,
            end: 1,
            assetId: 'project-asset:speech',
            duration: 1,
            phraseId: 'phrase',
            revision: 0,
            text: 'Saved',
            profile,
            textSignature: reviewSpeechTextSignature('Saved', profile),
          },
        ],
      },
    },
  ];
  const legacy = { ...state, schemaVersion: 4 };
  const loaded = loadQuickEditAdvancedState(legacy);
  expect(loaded).toEqual(state);
  expect(loaded?.watermark).toBeUndefined();
  const content = reviewAdvancedContentBaseline(state);
  expect(loadQuickEditAdvancedContentState({ ...content, schemaVersion: 4 })).toEqual(content);
  expect(loadQuickEditAdvancedState(loaded)).toEqual(loaded);
});

it('does not admit watermark payloads under legacy or future version declarations', () => {
  const state = createQuickEditAdvancedState();
  const watermark = createQuickEditWatermark('Made with Sniptale');
  for (const schemaVersion of [1, 2, 3, 4, QUICK_EDIT_ADVANCED_SCHEMA_VERSION + 1]) {
    expect(loadQuickEditAdvancedState({ ...state, schemaVersion, watermark }, segments)).toBeNull();
    expect(
      loadQuickEditAdvancedContentState({
        ...reviewAdvancedContentBaseline(state),
        schemaVersion,
        watermark,
      })
    ).toBeNull();
  }
  for (const schemaVersion of [2, 3, 4]) {
    expect(loadQuickEditAdvancedState({ ...state, schemaVersion })?.schemaVersion).toBe(
      QUICK_EDIT_ADVANCED_SCHEMA_VERSION
    );
  }
});

it('admits released v6 presentation and preserves v5 watermark in current and history content', () => {
  const presentation = {
    fadeIn: { enabled: true, duration: 0.4 },
    fadeOut: { enabled: true, duration: 0.4 },
    color: '#000000ff',
    audioFade: false,
    intro: { mode: 'none' },
    outro: { mode: 'none' },
  };
  const state = { ...createQuickEditAdvancedState(), schemaVersion: 6, presentation };
  expect(loadQuickEditAdvancedState(state)).toMatchObject({ presentation });
  const { ui: _ui, ...content } = state;
  expect(loadQuickEditAdvancedContentState(content)).toMatchObject({ presentation });
  expect(loadQuickEditAdvancedState({ ...state, schemaVersion: 5 })).toBeNull();
  const legacy = {
    ...createQuickEditAdvancedState(),
    schemaVersion: 5,
    watermark: createQuickEditWatermark('Saved'),
  };
  expect(loadQuickEditAdvancedState(legacy)).toMatchObject({
    schemaVersion: QUICK_EDIT_ADVANCED_SCHEMA_VERSION,
    watermark: legacy.watermark,
  });
  const { ui: _legacyUi, ...legacyContent } = legacy;
  expect(loadQuickEditAdvancedContentState(legacyContent)).toMatchObject({
    schemaVersion: QUICK_EDIT_ADVANCED_SCHEMA_VERSION,
    watermark: legacy.watermark,
  });
  expect(loadQuickEditAdvancedState(undefined)).not.toHaveProperty('presentation');
});
