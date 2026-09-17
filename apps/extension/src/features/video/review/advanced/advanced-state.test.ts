import { describe, expect, it } from 'vitest';
import type { Gradient } from '@sniptale/foundation/paint';
import { createQuickEditAdvancedState } from './defaults';
import { loadQuickEditAdvancedState } from './validation';
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

const zoomRegion = (id: string, startMs: number, endMs: number) => ({
  id,
  startMs,
  endMs,
  transform: { scale: 1.5, centerX: 0.5, centerY: 0.5 },
  enter: { type: 'none', durationMs: 0 },
  exit: { type: 'none', durationMs: 0 },
});

const audioClip = (id: string) => ({
  id,
  assetId: 'asset:voice',
  timelineStartMs: 2_000,
  sourceOffsetMs: 0,
  durationMs: 5_000,
  volume: 1,
  muted: false,
  fadeInMs: 100,
  fadeOutMs: 100,
});

const advanced = (): QuickEditAdvancedState => ({
  schemaVersion: QUICK_EDIT_ADVANCED_SCHEMA_VERSION,
  ui: { mode: 'advanced', tracks: { actions: false, zoom: true, audio: true } },
  zoom: {
    enabled: true,
    regions: [
      {
        id: 'z1',
        startMs: 1_000,
        endMs: 4_000,
        transform: { scale: 1.5, centerX: 0.25, centerY: 0.75 },
        enter: { type: 'ease-in-out', durationMs: 300 },
        exit: { type: 'none', durationMs: 0 },
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
      loadQuickEditAdvancedState({ ...structuredClone(advanced()), schemaVersion: 2 })
    ).toBeNull();
    expect(
      loadQuickEditAdvancedState({ ...structuredClone(advanced()), schemaVersion: 0 })
    ).toBeNull();
  });

  it('rejects invalid mode and track visibility', () => {
    expect(
      loadQuickEditAdvancedState({
        ...structuredClone(advanced()),
        ui: { mode: 'pro', tracks: { actions: true, zoom: true, audio: true } },
      })
    ).toBeNull();
    expect(
      loadQuickEditAdvancedState({
        ...structuredClone(advanced()),
        ui: { mode: 'advanced', tracks: { actions: 1, zoom: true, audio: true } },
      })
    ).toBeNull();
  });

  it('rejects out-of-range camera transforms', () => {
    const high: unknown = {
      ...structuredClone(advanced()),
      zoom: {
        enabled: true,
        regions: [
          {
            ...zoomRegion('z1', 1_000, 4_000),
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
            ...zoomRegion('z1', 1_000, 4_000),
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
      zoom: { enabled: true, regions: [zoomRegion('a', 0, 3_000), zoomRegion('a', 3_000, 3_500)] },
    };
    expect(loadQuickEditAdvancedState(duplicated)).toBeNull();
    const adjacent: unknown = {
      ...structuredClone(advanced()),
      zoom: { enabled: true, regions: [zoomRegion('a', 0, 3_000), zoomRegion('b', 3_000, 3_500)] },
    };
    expect(loadQuickEditAdvancedState(adjacent)).not.toBeNull();
    const overlapping: unknown = {
      ...structuredClone(advanced()),
      zoom: { enabled: true, regions: [zoomRegion('a', 0, 3_000), zoomRegion('b', 2_000, 3_500)] },
    };
    expect(loadQuickEditAdvancedState(overlapping)).toBeNull();
  });

  it('rejects malformed transitions', () => {
    const negative: unknown = {
      ...structuredClone(advanced()),
      zoom: {
        enabled: true,
        regions: [{ ...zoomRegion('z1', 1_000, 4_000), enter: { type: 'linear', durationMs: -1 } }],
      },
    };
    expect(loadQuickEditAdvancedState(negative)).toBeNull();
    const unknownType: unknown = {
      ...structuredClone(advanced()),
      zoom: {
        enabled: true,
        regions: [{ ...zoomRegion('z1', 1_000, 4_000), exit: { type: 'bounce', durationMs: 300 } }],
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
        voiceover: [{ ...audioClip('v1'), timelineStartMs: -1 }],
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
