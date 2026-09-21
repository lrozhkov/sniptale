import { describe, expect, it } from 'vitest';
import type { Gradient } from '@sniptale/foundation/paint';
import { createQuickEditAdvancedState } from './defaults';
import { loadQuickEditAdvancedContentState, loadQuickEditAdvancedState } from './validation';
import { buildReviewTimeMap } from '../timeline';
import { QUICK_EDIT_ADVANCED_SCHEMA_VERSION, type QuickEditAdvancedState } from './types';

const gradient: Gradient = {
  type: 'linear',
  angle: 135,
  interpolation: 'srgb',
  repeat: { enabled: false, span: 1 },
  stops: [
    { id: 'a', color: '#101010ff', position: 0, midpoint: 0.5 },
    { id: 'b', color: '#f0f0f0ff', position: 1, midpoint: 0.5 },
  ],
};

const zoomRegion = (id: string, start: number, end: number) => ({
  id,
  start,
  end,
  transform: { scale: 1.5, centerX: 0.5, centerY: 0.5 },
  enter: { type: 'none', duration: 0 },
  exit: { type: 'none', duration: 0 },
});

const audioClip = (id: string) => ({
  id,
  assetId: 'asset:voice',
  timelineStart: 2,
  sourceOffset: 0,
  duration: 5,
  volume: 1,
  muted: false,
  fadeIn: 0.1,
  fadeOut: 0.1,
});

const advanced = (): QuickEditAdvancedState => ({
  schemaVersion: QUICK_EDIT_ADVANCED_SCHEMA_VERSION,
  ui: {
    mode: 'advanced',
    tracks: { actions: false, zoom: true, audio: true },
    overlaysVisible: true,
  },
  zoom: {
    enabled: true,
    regions: [
      {
        id: 'z1',
        start: 1,
        end: 4,
        transform: { scale: 1.5, centerX: 0.25, centerY: 0.75 },
        enter: { type: 'ease-in-out', duration: 0.3 },
        exit: { type: 'none', duration: 0 },
      },
    ],
  },
  background: {
    enabled: true,
    type: 'solid',
    color: '#101010ff',
    layout: { padding: 40, cornerRadius: 24 },
  },
  audio: {
    original: { muted: true, volume: 0.5 },
    voiceover: [audioClip('v1')],
    music: [],
  },
});

it('migrates absent legacy state to defaults at the single load point', () => {
  expect(loadQuickEditAdvancedState(undefined)).toEqual(createQuickEditAdvancedState());
});

describe('migrates v1 source-time placements to result time (R03)', () => {
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

  it('migrates a v1 payload through the conversion segments', () => {
    const legacy: unknown = {
      ...structuredClone(advanced()),
      schemaVersion: 1,
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
        ],
      },
      audio: {
        ...structuredClone(advanced()).audio,
        voiceover: [audioClip('v1')],
      },
    };
    const migrated = loadQuickEditAdvancedState(legacy, segments);
    expect(migrated?.schemaVersion).toBe(2);
    expect(migrated?.zoom.regions[0]).toMatchObject({ start: 4, end: 6 });
    // Source 2 maps to the start of the sped segment at result time 0.
    expect(migrated?.audio.voiceover[0]).toMatchObject({ timelineStart: 0 });
    expect(JSON.parse(migrated?.recoveryV1 ?? '')).toMatchObject({ schemaVersion: 1 });
  });

  it('round-trips the migrated payload without re-migrating', () => {
    const legacy: unknown = {
      ...structuredClone(advanced()),
      schemaVersion: 1,
    };
    const migrated = loadQuickEditAdvancedState(legacy, segments);
    expect(loadQuickEditAdvancedState(structuredClone(migrated), segments)).toEqual(migrated);
  });

  it('refuses v1 payloads without conversion segments', () => {
    const legacy: unknown = { ...structuredClone(advanced()), schemaVersion: 1 };
    expect(loadQuickEditAdvancedState(legacy)).toBeNull();
  });

  it('keeps a partially removed region dormant instead of collapsing it', () => {
    const legacy: unknown = {
      ...structuredClone(advanced()),
      schemaVersion: 1,
    };
    const migrated = loadQuickEditAdvancedState(legacy, segments);
    // Region z1 starts inside the removed [0,2) span; the converted pair is
    // degenerate, so the stored interval is retained verbatim.
    expect(migrated?.zoom.regions[0]).toMatchObject({ start: 1, end: 4 });
  });
});

it('parses a canonical round trip unchanged', () => {
  const value = advanced();
  expect(loadQuickEditAdvancedState(structuredClone(value))).toEqual(value);
});

it('round-trips a gradient background through the shared paint normalizer', () => {
  const stored: unknown = {
    ...structuredClone(advanced()),
    background: {
      enabled: true,
      type: 'gradient',
      gradient,
      layout: { padding: 40, cornerRadius: 24 },
    },
  };
  const parsed = loadQuickEditAdvancedState(stored);
  expect(parsed?.background).toEqual({
    enabled: true,
    type: 'gradient',
    gradient,
    layout: { padding: 40, cornerRadius: 24 },
  });
  expect(loadQuickEditAdvancedState(structuredClone({ ...parsed }))).toEqual(parsed);
});

it('normalizes solid colors through the shared paint normalizer', () => {
  const stored: unknown = {
    ...structuredClone(advanced()),
    background: {
      enabled: true,
      type: 'solid',
      color: '#ff0000',
      layout: { padding: 40, cornerRadius: 24 },
    },
  };
  expect(loadQuickEditAdvancedState(stored)?.background).toEqual({
    enabled: true,
    type: 'solid',
    color: '#ff0000ff',
    layout: { padding: 40, cornerRadius: 24 },
  });
});

describe('rejects malformed persisted state', () => {
  it('rejects unknown schema versions and non-records', () => {
    expect(loadQuickEditAdvancedState(null)).toBeNull();
    expect(loadQuickEditAdvancedState('state')).toBeNull();
    expect(
      loadQuickEditAdvancedState({ ...structuredClone(advanced()), schemaVersion: 3 })
    ).toBeNull();
    expect(
      loadQuickEditAdvancedState({ ...structuredClone(advanced()), schemaVersion: 0 })
    ).toBeNull();
  });

  it('rejects invalid mode and track visibility', () => {
    expect(
      loadQuickEditAdvancedState({
        ...structuredClone(advanced()),
        ui: {
          mode: 'pro',
          tracks: { actions: true, zoom: true, audio: true },
          overlaysVisible: true,
        },
      })
    ).toBeNull();
    expect(
      loadQuickEditAdvancedState({
        ...structuredClone(advanced()),
        ui: {
          mode: 'advanced',
          tracks: { actions: 1, zoom: true, audio: true },
          overlaysVisible: true,
        },
      })
    ).toBeNull();
  });

  it('falls legacy workspaces back to visible overlays', () => {
    const legacy = structuredClone(advanced()) as unknown as Record<string, unknown>;
    delete (legacy['ui'] as Record<string, unknown>)['overlaysVisible'];
    const loaded = loadQuickEditAdvancedState(legacy);
    expect(loaded?.ui.overlaysVisible).toBe(true);
    const hidden = loadQuickEditAdvancedState({
      ...structuredClone(advanced()),
      ui: {
        mode: 'advanced',
        tracks: { actions: false, zoom: true, audio: true },
        overlaysVisible: false,
      },
    });
    expect(hidden?.ui.overlaysVisible).toBe(false);
  });

  it('rejects out-of-range camera transforms', () => {
    const high: unknown = {
      ...structuredClone(advanced()),
      zoom: {
        enabled: true,
        regions: [
          {
            ...zoomRegion('z1', 1, 4),
            transform: { scale: 8, centerX: 0.5, centerY: 0.5 },
          },
        ],
      },
    };
    expect(loadQuickEditAdvancedState(high)).toBeNull();
    const offCenter: unknown = {
      ...structuredClone(advanced()),
      zoom: {
        enabled: true,
        regions: [
          {
            ...zoomRegion('z1', 1, 4),
            transform: { scale: 1.5, centerX: 1.2, centerY: 0.5 },
          },
        ],
      },
    };
    expect(loadQuickEditAdvancedState(offCenter)).toBeNull();
  });

  it('rejects duplicated ids but allows adjacent non-overlapping regions', () => {
    const duplicated: unknown = {
      ...structuredClone(advanced()),
      zoom: { enabled: true, regions: [zoomRegion('a', 0, 3), zoomRegion('a', 3, 3.5)] },
    };
    expect(loadQuickEditAdvancedState(duplicated)).toBeNull();
    const adjacent: unknown = {
      ...structuredClone(advanced()),
      zoom: { enabled: true, regions: [zoomRegion('a', 0, 3), zoomRegion('b', 3, 3.5)] },
    };
    expect(loadQuickEditAdvancedState(adjacent)).not.toBeNull();
    const overlapping: unknown = {
      ...structuredClone(advanced()),
      zoom: { enabled: true, regions: [zoomRegion('a', 0, 3), zoomRegion('b', 2, 3.5)] },
    };
    expect(loadQuickEditAdvancedState(overlapping)).toBeNull();
  });

  it('round-trips link easing and rejects unsupported values while legacy links still parse', () => {
    const withEasing: unknown = {
      ...structuredClone(advanced()),
      zoom: {
        enabled: true,
        regions: [
          { ...zoomRegion('a', 0, 2), linkTo: 'b', linkEasing: 'linear' },
          zoomRegion('b', 4, 6),
        ],
      },
    };
    const parsed = loadQuickEditAdvancedState(withEasing);
    expect(parsed?.zoom.regions[0]).toMatchObject({ linkTo: 'b', linkEasing: 'linear' });
    expect(loadQuickEditAdvancedState(structuredClone({ ...parsed }))).toEqual(parsed);
    // Documents written before the setting existed keep the implicit smooth default.
    const legacy: unknown = {
      ...structuredClone(advanced()),
      zoom: {
        enabled: true,
        regions: [{ ...zoomRegion('a', 0, 2), linkTo: 'b' }, zoomRegion('b', 4, 6)],
      },
    };
    const parsedLegacy = loadQuickEditAdvancedState(legacy);
    expect(parsedLegacy?.zoom.regions[0]).toMatchObject({ linkTo: 'b' });
    expect(parsedLegacy?.zoom.regions[0]?.linkEasing).toBeUndefined();
    const hostile: unknown = {
      ...structuredClone(advanced()),
      zoom: {
        enabled: true,
        regions: [
          { ...zoomRegion('a', 0, 2), linkTo: 'b', linkEasing: 'bounce' },
          zoomRegion('b', 4, 6),
        ],
      },
    };
    expect(loadQuickEditAdvancedState(hostile)).toBeNull();
  });

  it('rejects malformed transitions', () => {
    const negative: unknown = {
      ...structuredClone(advanced()),
      zoom: {
        enabled: true,
        regions: [{ ...zoomRegion('z1', 1, 4), enter: { type: 'linear', duration: -1 } }],
      },
    };
    expect(loadQuickEditAdvancedState(negative)).toBeNull();
    const unknownType: unknown = {
      ...structuredClone(advanced()),
      zoom: {
        enabled: true,
        regions: [{ ...zoomRegion('z1', 1, 4), exit: { type: 'bounce', duration: 0.3 } }],
      },
    };
    expect(loadQuickEditAdvancedState(unknownType)).toBeNull();
  });

  it('rejects malformed background variants', () => {
    const hostileColor: unknown = {
      ...structuredClone(advanced()),
      background: {
        enabled: true,
        type: 'solid',
        color: 'javascript:alert(1)',
        layout: { padding: 0, cornerRadius: 0 },
      },
    };
    expect(loadQuickEditAdvancedState(hostileColor)).toBeNull();
    const solidPaintAsGradient: unknown = {
      ...structuredClone(advanced()),
      background: {
        enabled: true,
        type: 'gradient',
        gradient: { ...gradient, stops: [gradient.stops[0]] },
        layout: { padding: 0, cornerRadius: 0 },
      },
    };
    expect(loadQuickEditAdvancedState(solidPaintAsGradient)).toBeNull();
    const imageFit: unknown = {
      ...structuredClone(advanced()),
      background: {
        enabled: true,
        type: 'image',
        assetId: 'asset:bg',
        imageFit: 'fill',
        layout: { padding: 0, cornerRadius: 0 },
      },
    };
    expect(loadQuickEditAdvancedState(imageFit)).toBeNull();
  });

  it('rejects malformed audio clips and duplicates', () => {
    const negativeStart: unknown = {
      ...structuredClone(advanced()),
      audio: {
        ...structuredClone(advanced().audio),
        voiceover: [{ ...audioClip('v1'), timelineStart: -1 }],
      },
    };
    expect(loadQuickEditAdvancedState(negativeStart)).toBeNull();
    const loud: unknown = {
      ...structuredClone(advanced()),
      audio: {
        ...structuredClone(advanced().audio),
        voiceover: [{ ...audioClip('v1'), volume: 3 }],
      },
    };
    expect(loadQuickEditAdvancedState(loud)).toBeNull();
    const duplicated: unknown = {
      ...structuredClone(advanced()),
      audio: {
        ...structuredClone(advanced().audio),
        voiceover: [audioClip('v1'), audioClip('v1')],
      },
    };
    expect(loadQuickEditAdvancedState(duplicated)).toBeNull();
  });
});

it('loads content snapshots and rejects ui leakage or schema drift', () => {
  const state = advanced();
  const content = { zoom: state.zoom, background: state.background, audio: state.audio };
  expect(loadQuickEditAdvancedContentState({ ...content, schemaVersion: 2 })).toEqual({
    ...content,
    schemaVersion: 2,
  });
  expect(loadQuickEditAdvancedContentState({ ...content, schemaVersion: 1 })).toBeNull();
  expect(loadQuickEditAdvancedContentState({ ...state, schemaVersion: 2 })).toBeNull();
  expect(loadQuickEditAdvancedContentState(undefined)).toBeNull();
});

it('preserves spotlight settings through advanced content parsing and rejects malformed openings', async () => {
  const { createQuickEditSpotlight } = await import('./focus');
  const state = advanced();
  state.zoom.regions[0]!.spotlight = createQuickEditSpotlight();
  expect(loadQuickEditAdvancedState(state)).toEqual(state);
  const malformed = structuredClone(state);
  malformed.zoom.regions[0]!.spotlight!.area.width = 2;
  expect(loadQuickEditAdvancedState(malformed)).toBeNull();
});
