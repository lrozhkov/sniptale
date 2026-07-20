import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RICH_SHAPE_EFFECTS,
  DEFAULT_RICH_SHAPE_LAYER,
  DEFAULT_RICH_SHAPE_ROUGH,
  DEFAULT_RICH_SHAPE_SOURCE,
  DEFAULT_RICH_SHAPE_STYLE,
  DEFAULT_RICH_SHAPE_TEXT,
  EDITOR_RICH_SHAPE_FAMILY,
  createDefaultRichShapeObject,
  createEnabledRichShapeRoughStyle,
  createStableRichShapeRoughSeed,
  isEditorKnownRichShapeKind,
  normalizeEditorDocumentRichShapes,
  normalizeEditorRichShapeObject,
  resolveEditorRichShapeFamily,
} from './index';

describe('rich shape document contracts', () => {
  registerRichShapeDefaultTests();
  registerRichShapeFamilyTests();
  registerRichShapeSerializationTests();
  registerRichShapeRoughTests();
  registerRichShapeFallbackTests();
});

function registerRichShapeDefaultTests() {
  it('defines stable defaults for style, effects, text, rough, source, and layer state', () => {
    expect(DEFAULT_RICH_SHAPE_STYLE).toMatchObject({
      fill: { type: 'solid', color: '#ffffff' },
      fillTransparency: 0,
      line: { color: '#111827', width: 2, beginArrowhead: 'none', endArrowhead: 'none' },
      opacity: 1,
      cornerRadius: 0,
    });
    expect(DEFAULT_RICH_SHAPE_EFFECTS).toMatchObject({
      shadow: { enabled: false },
      reflection: { enabled: false },
      glow: { enabled: false },
      softEdge: { enabled: false },
    });
    expect(DEFAULT_RICH_SHAPE_TEXT).toMatchObject({
      content: '',
      horizontalAlign: 'center',
      verticalAlign: 'middle',
      autofit: 'none',
      wrap: 'wrap',
      rotationPolicy: 'shape',
    });
    expect(DEFAULT_RICH_SHAPE_ROUGH).toMatchObject({
      enabled: false,
      seed: null,
      fillStyle: 'hachure',
      fillColor: '#ffffff',
      fillWeight: 1,
      fillRoughness: 1,
      fillBowing: 1,
      fillTransparency: 0,
      preserveVertices: true,
    });
    expect(DEFAULT_RICH_SHAPE_SOURCE).toEqual({
      type: 'built-in',
      name: null,
      libraryId: null,
      itemId: null,
      importedAt: null,
      formatVersion: null,
    });
    expect(DEFAULT_RICH_SHAPE_LAYER).toEqual({ visible: true, locked: false, zIndex: null });
  });
}

function registerRichShapeFamilyTests() {
  it('covers office-style shape families and resolves known catalog kinds', () => {
    expect(resolveEditorRichShapeFamily('decision')).toBe(EDITOR_RICH_SHAPE_FAMILY.FLOWCHART);
    expect(resolveEditorRichShapeFamily('right-arrow')).toBe(EDITOR_RICH_SHAPE_FAMILY.BLOCK_ARROW);
    expect(resolveEditorRichShapeFamily('excalidraw-library-item')).toBe(
      EDITOR_RICH_SHAPE_FAMILY.LIBRARY
    );
    expect(isEditorKnownRichShapeKind('action-button-home')).toBe(true);
    expect(resolveEditorRichShapeFamily('future-user-shape')).toBe(EDITOR_RICH_SHAPE_FAMILY.CUSTOM);
  });
}

function registerRichShapeSerializationTests() {
  it('round-trips rich shape documents through JSON serialization', () => {
    const shape = createDefaultRichShapeObject({
      id: 'shape-1',
      shapeFamily: EDITOR_RICH_SHAPE_FAMILY.CALLOUT,
      shapeKind: 'cloud-callout',
      source: { ...DEFAULT_RICH_SHAPE_SOURCE, type: 'custom', itemId: 'item-1' },
    });
    const [roundTrip] = normalizeEditorDocumentRichShapes(JSON.parse(JSON.stringify([shape])));

    expect(roundTrip).toEqual(shape);
  });
}

function registerRichShapeRoughTests() {
  it('normalizes rough settings and derives stable non-zero seeds from shape ids', () => {
    const seed = createStableRichShapeRoughSeed('shape-1');
    expect(seed).toBe(createStableRichShapeRoughSeed('shape-1'));
    expect(seed).toBeGreaterThan(0);

    const shape = normalizeEditorRichShapeObject({
      id: 'rough-shape',
      objectType: 'rich-shape',
      shapeKind: 'rectangle',
      rough: {
        enabled: true,
        seed,
        roughness: 2.4,
        bowing: 0.5,
        fillStyle: 'cross-hatch',
        hachureGap: 6,
        hachureAngle: 15,
        fillWeight: 2,
        fillRoughness: 3,
        fillBowing: 0.25,
        fillTransparency: 0.4,
        preserveVertices: false,
      },
    });

    expect(shape.rough).toEqual({
      enabled: true,
      seed,
      roughness: 2.4,
      bowing: 0.5,
      fillStyle: 'cross-hatch',
      fillColor: '#ffffff',
      hachureGap: 6,
      hachureAngle: 15,
      fillWeight: 2,
      fillRoughness: 3,
      fillBowing: 0.25,
      fillTransparency: 0.4,
      preserveVertices: false,
    });
    expect(createEnabledRichShapeRoughStyle('shape-1').seed).toBe(seed);
  });
}

function registerRichShapeFallbackTests() {
  it('normalizes unknown shape kinds and missing source metadata without throwing', () => {
    expect(() =>
      normalizeEditorRichShapeObject({
        id: 'future-shape',
        objectType: 'rich-shape',
        shapeKind: 'vendor-future-kind',
      })
    ).not.toThrow();
    expect(
      normalizeEditorRichShapeObject({
        id: 'future-shape',
        objectType: 'rich-shape',
        shapeKind: 'vendor-future-kind',
      })
    ).toEqual(
      expect.objectContaining({
        shapeFamily: 'custom',
        shapeKind: 'vendor-future-kind',
        source: DEFAULT_RICH_SHAPE_SOURCE,
      })
    );
  });
}
