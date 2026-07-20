import { describe, expect, it } from 'vitest';

import type { EditorShapeSettings } from '../types';
import {
  DEFAULT_RICH_SHAPE_STYLE,
  createRichShapeFromLegacyShapeSettings,
  normalizeEditorRichShapeObject,
} from './index';

function createLegacySettings(overrides: Partial<EditorShapeSettings> = {}): EditorShapeSettings {
  return {
    borderPresetId: 'preset-1',
    customCss: '',
    fillColor: '#22c55e',
    fillOpacity: 0.4,
    inheritCustomCss: false,
    opacity: 0.75,
    radius: 14,
    shadow: 30,
    strokeColor: '#2563eb',
    strokeOpacity: 0.6,
    strokeStyle: 'dashed',
    strokeWidth: 5,
    ...overrides,
  };
}

function expectLegacyStyleMapping(kind: 'rectangle' | 'ellipse' | 'diamond'): void {
  const shape = createRichShapeFromLegacyShapeSettings({
    id: `${kind}-1`,
    kind,
    frame: { left: 10, top: 20, width: 120, height: 80 },
    settings: createLegacySettings(),
  });

  expect(shape).toEqual(
    expect.objectContaining({
      id: `${kind}-1`,
      objectType: 'rich-shape',
      shapeFamily: 'office',
      shapeKind: kind,
      frame: { left: 10, top: 20, width: 120, height: 80 },
    })
  );
  expect(shape.style).toEqual(
    expect.objectContaining({
      fill: { type: 'solid', color: '#22c55e' },
      fillTransparency: 0.6,
      opacity: 0.75,
      cornerRadius: kind === 'rectangle' ? 14 : 0,
    })
  );
  expect(shape.style.line).toEqual(
    expect.objectContaining({
      color: '#2563eb',
      dashStyle: 'dash',
      transparency: 0.4,
      width: 5,
    })
  );
}

function normalizeStylePatch(style: unknown) {
  return normalizeEditorRichShapeObject({
    id: 'style-shape',
    objectType: 'rich-shape',
    shapeKind: 'rectangle',
    style,
  }).style;
}

describe('rich shape style contracts', () => {
  registerLegacyRichShapeStyleTests();
  registerFillRichShapeStyleTests();
});

function registerLegacyRichShapeStyleTests() {
  it('maps legacy rectangle, ellipse, and diamond settings into rich shape documents', () => {
    expectLegacyStyleMapping('rectangle');
    expectLegacyStyleMapping('ellipse');
    expectLegacyStyleMapping('diamond');
  });

  it('normalizes legacy stroke dash variants and disabled shadows', () => {
    const dotted = createRichShapeFromLegacyShapeSettings({
      id: 'dotted',
      kind: 'rectangle',
      frame: { left: 0, top: 0, width: 10, height: 10 },
      settings: createLegacySettings({ strokeStyle: 'dotted' }),
    });
    const solid = createRichShapeFromLegacyShapeSettings({
      id: 'solid',
      kind: 'rectangle',
      frame: { left: 0, top: 0, width: 10, height: 10 },
      settings: createLegacySettings({ shadow: 0, strokeStyle: 'solid' }),
    });

    expect(dotted.style.line.dashStyle).toBe('dot');
    expect(solid.style.line.dashStyle).toBe('solid');
    expect(solid.effects.shadow).toEqual(expect.objectContaining({ enabled: false, opacity: 0 }));
  });
}

function registerFillRichShapeStyleTests() {
  registerFillStyleNormalizationTests();
  registerMalformedStyleFallbackTests();
}

function registerFillStyleNormalizationTests() {
  it('normalizes gradient, image, and unknown fill styles', () => {
    expect(
      normalizeStylePatch({
        fill: {
          type: 'gradient',
          gradientType: 'radial',
          angle: 25,
          stops: [{ color: '#111111', offset: 0.4, transparency: 0.2 }, 'ignored'],
        },
      }).fill
    ).toEqual({
      type: 'gradient',
      gradientType: 'radial',
      angle: 25,
      stops: [{ color: '#111111', offset: 0.4, transparency: 0.2 }],
    });
    expect(
      normalizeStylePatch({ fill: { type: 'image', assetId: 'asset-1', fit: 'tile' } }).fill
    ).toEqual({ type: 'image', assetId: 'asset-1', fit: 'tile' });
    expect(normalizeStylePatch({ fill: { type: 'future-fill' } }).fill).toEqual(
      DEFAULT_RICH_SHAPE_STYLE.fill
    );
  });
}

function registerMalformedStyleFallbackTests() {
  it('falls back malformed style fields while preserving valid line options', () => {
    const style = normalizeStylePatch({
      fill: { type: 'gradient', stops: 'not-array' },
      fillTransparency: 0.25,
      line: {
        color: '#222222',
        transparency: 0.5,
        width: 6,
        dashStyle: 'long-dash',
        cap: 'square',
        join: 'bevel',
        beginArrowhead: 'stealth',
        endArrowhead: 'oval',
      },
      opacity: 0.7,
      cornerRadius: 12,
    });

    expect(style.fill).toEqual({
      type: 'gradient',
      gradientType: 'linear',
      angle: 0,
      stops: [],
    });
    expect(style.line).toEqual(
      expect.objectContaining({ cap: 'square', join: 'bevel', endArrowhead: 'oval' })
    );
    expect(style).toEqual(expect.objectContaining({ fillTransparency: 0.25, opacity: 0.7 }));
  });
}
