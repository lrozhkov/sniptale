import { expect, it } from 'vitest';
import { buildReviewTimeMap } from '../timeline';
import { migrateQuickEditAdvancedV1 } from './migration';
import { createQuickEditAdvancedState } from './defaults';
import type { QuickEditAdvancedState } from './types';

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
  expect(migrated.schemaVersion).toBe(2);
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
