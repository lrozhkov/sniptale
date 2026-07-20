import { describe, expect, it } from 'vitest';
import {
  EDITOR_BUILT_IN_SHAPE_CATALOG,
  EDITOR_RICH_SHAPE_KINDS_BY_FAMILY,
  PRIMARY_BUILT_IN_SHAPE_IDS,
  getEditorBuiltInShapeEntry,
  isValidEditorBuiltInShapeGeometry,
  isEditorKnownRichShapeKind,
  isEditorRichShapeFamily,
  resolveEditorRichShapeFamily,
} from './index';
import type { EditorBuiltInShapeGeometryDefinition } from './index';
import {
  REQUIRED_CATEGORY_IDS,
  REQUIRED_ENTRY_IDS,
  findIds,
  getCatalogIds,
  getGeometryBounds,
  getRequiredEntry,
  hasTranslatedLabel,
  isKebabShapeId,
} from './catalog.test-support.ts';

describe('built-in rich shape catalog', () => {
  registerCatalogIdentityTests();
  registerCatalogMetadataTests();
  registerCatalogGeometryTests();
  registerCatalogSearchTests();
  registerCatalogValidationTests();
});

function registerCatalogIdentityTests() {
  it('exposes the primary shortcut order used by the shapes and lines browser', () => {
    expect(PRIMARY_BUILT_IN_SHAPE_IDS).toEqual(['block-arrow', 'rectangle', 'oval']);
  });

  it('contains the required office-style category groups and shape families', () => {
    const { categories, entries } = getCatalogIds();

    REQUIRED_CATEGORY_IDS.forEach((category) => expect(categories.has(category)).toBe(true));
    REQUIRED_ENTRY_IDS.forEach((id) => expect(entries.has(id)).toBe(true));
  });

  it('resolves every declared built-in shape kind through the family registry', () => {
    Object.entries(EDITOR_RICH_SHAPE_KINDS_BY_FAMILY).forEach(([family, kinds]) => {
      kinds.forEach((kind) => {
        expect(isEditorKnownRichShapeKind(kind)).toBe(true);
        expect(resolveEditorRichShapeFamily(kind)).toBe(family);
      });
    });
    expect(isEditorKnownRichShapeKind('future-kind')).toBe(false);
    expect(isEditorRichShapeFamily('office')).toBe(true);
    expect(isEditorRichShapeFamily('not-a-family')).toBe(false);
    expect(resolveEditorRichShapeFamily('future-kind')).toBe('custom');
  });
}

function registerCatalogMetadataTests() {
  it('gives every entry stable metadata, defaults, capabilities, and geometry', () => {
    EDITOR_BUILT_IN_SHAPE_CATALOG.forEach((entry) => {
      expect(isKebabShapeId(entry.id)).toBe(true);
      expect(entry.labelKey).toBe(`editor.shapeCatalog.labels.${entry.id}`);
      expect(hasTranslatedLabel(entry.labelKey)).toBe(true);
      expect(entry.labelFallback.length).toBeGreaterThan(0);
      expect(entry.category).toBeTruthy();
      expect(entry.searchAliases.length).toBeGreaterThan(0);
      expect(entry.insertDefaults.shapeFamily).toBeTruthy();
      expect(entry.insertDefaults.shapeKind).toBeTruthy();
      expect(entry.insertDefaults.frame.width).toBeGreaterThan(0);
      expect(entry.insertDefaults.style.fillTransparency).toBe(1);
      expect(entry.capabilities.length).toBeGreaterThan(0);
      expect(isValidEditorBuiltInShapeGeometry(entry.thumbnail)).toBe(true);
      expect(isValidEditorBuiltInShapeGeometry(entry.geometry)).toBe(true);
    });
  });
}

function registerCatalogGeometryTests() {
  it('keeps common built-in figure geometry aligned to the full frame bounds', () => {
    [
      'rectangle',
      'rounded-rectangle',
      'oval',
      'triangle',
      'diamond',
      'plus',
      'cross',
      'flowchart-process',
      'flowchart-predefined-process',
      'flowchart-stored-data',
      'flowchart-database',
    ].forEach((id) => {
      expect(getGeometryBounds(getRequiredEntry(id).geometry)).toEqual({
        maxX: 100,
        maxY: 100,
        minX: 0,
        minY: 0,
      });
    });
  });

  it('uses distinct geometry for visually different built-in catalog entries', () => {
    expect(getRequiredEntry('plus').geometry).not.toEqual(getRequiredEntry('cross').geometry);
    expect(getRequiredEntry('flowchart-process').geometry).not.toEqual(
      getRequiredEntry('flowchart-predefined-process').geometry
    );
    expect(getRequiredEntry('flowchart-stored-data').geometry).not.toEqual(
      getRequiredEntry('flowchart-database').geometry
    );
  });
}

function registerCatalogSearchTests() {
  it('supports Russian and English search aliases for common office names', () => {
    expect(findIds('ромб')).toContain('diamond');
    expect(findIds('diamond')).toContain('diamond');
    expect(findIds('соединитель')).toContain('straight-connector');
    expect(findIds('connector')).toContain('straight-connector');
    expect(findIds('база данных')).toContain('flowchart-database');
    expect(findIds('database')).toContain('flowchart-database');
    expect(findIds('выноска')).toContain('dynamic-callout');
    expect(findIds('callout')).toContain('dynamic-callout');
  });
}

function registerCatalogValidationTests() {
  it('rejects duplicate ids and invalid geometry definitions', () => {
    const ids = EDITOR_BUILT_IN_SHAPE_CATALOG.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);

    const invalidGeometry: EditorBuiltInShapeGeometryDefinition = {
      closed: false,
      points: [[0, 0]],
      type: 'polyline',
      viewBox: { minX: 0, minY: 0, width: 0, height: 100 },
    };
    const invalidTextFrameGeometry: EditorBuiltInShapeGeometryDefinition = {
      closed: false,
      points: [
        [0, 0],
        [100, 100],
      ],
      textFrame: { height: 10, left: 95, top: 0, width: 10 },
      type: 'polyline',
      viewBox: { minX: 0, minY: 0, width: 100, height: 100 },
    };

    expect(isValidEditorBuiltInShapeGeometry(invalidGeometry)).toBe(false);
    expect(isValidEditorBuiltInShapeGeometry(invalidTextFrameGeometry)).toBe(false);
  });

  it('keeps compatibility aliases for existing rectangle, ellipse, diamond, and line-arrow consumers', () => {
    expect(getEditorBuiltInShapeEntry('rectangle')?.id).toBe('rectangle');
    expect(getEditorBuiltInShapeEntry('ellipse')?.id).toBe('oval');
    expect(getEditorBuiltInShapeEntry('diamond')?.id).toBe('diamond');
    expect(getEditorBuiltInShapeEntry('line-arrow')?.id).toBe('arrow');
  });
}
