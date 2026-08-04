import { expect, it } from 'vitest';
import { createSystemCalloutPresetCatalog } from '../../../features/highlighter/callout-presets/catalog';
import { parseStoredCalloutPresetCatalog } from './parser';

it('parses compact catalog rows and preserves transparent colors', () => {
  const style = createSystemCalloutPresetCatalog()[2]!.style;
  const parsed = parseStoredCalloutPresetCatalog({
    schemaVersion: 1,
    systemCatalogRevision: 1,
    catalogCustomized: true,
    defaultPresetId: 'user-one',
    placements: [{ id: 'user-one', enabled: true, order: 0 }],
    systemOverrides: [],
    userPresets: [{ id: 'user-one', name: 'Text', style }],
  });
  expect(parsed).toMatchObject({ hasInvalidRoot: false, invalidFieldCount: 0 });
  expect(parsed.value.userPresets?.[0]?.style.surface.backgroundColor).toBe('transparent');
});

it('defaults the shadow color for catalogs saved before shadow colors existed', () => {
  const style = createSystemCalloutPresetCatalog()[0]!.style;
  const legacyStyle = {
    ...style,
    surface: Object.fromEntries(
      Object.entries(style.surface).filter(([key]) => key !== 'shadowColor')
    ),
  };
  const parsed = parseStoredCalloutPresetCatalog({
    userPresets: [{ id: 'user-legacy', name: 'Legacy', style: legacyStyle }],
  });

  expect(parsed.value.userPresets?.[0]?.style.surface.shadowColor).toBe('#000000');
});

it('defaults custom callout CSS for older catalogs and bounds persisted input', () => {
  const style = createSystemCalloutPresetCatalog()[0]!.style;
  const { customCss: _customCss, ...legacyStyle } = style;
  const legacy = parseStoredCalloutPresetCatalog({
    userPresets: [{ id: 'user-legacy-css', name: 'Legacy CSS', style: legacyStyle }],
  });
  const oversized = parseStoredCalloutPresetCatalog({
    userPresets: [
      {
        id: 'user-oversized-css',
        name: 'Oversized CSS',
        style: { ...style, customCss: 'x'.repeat(4_001) },
      },
    ],
  });

  expect(legacy.value.userPresets?.[0]?.style.customCss).toBe('');
  expect(oversized.invalidFieldCount).toBe(1);
  expect(oversized.value.userPresets).toEqual([]);
});

it('defaults frame color bindings to custom for older catalogs', () => {
  const style = createSystemCalloutPresetCatalog()[0]!.style;
  const { colorBindings: _colorBindings, ...legacyStyle } = style;
  const parsed = parseStoredCalloutPresetCatalog({
    userPresets: [{ id: 'user-legacy-colors', name: 'Legacy colors', style: legacyStyle }],
  });

  expect(parsed.value.userPresets?.[0]?.style.colorBindings).toEqual({
    accent: 'custom',
    connector: 'custom',
    surfaceBackground: 'custom',
    surfaceBorder: 'custom',
  });
});

it('defaults to a disabled left accent for catalogs saved before perimeter accents existed', () => {
  const style = createSystemCalloutPresetCatalog()[0]!.style;
  const { accentEdge: _accentEdge, ...legacyStyle } = style;
  const parsed = parseStoredCalloutPresetCatalog({
    userPresets: [{ id: 'user-legacy-accent', name: 'Legacy accent', style: legacyStyle }],
  });

  expect(parsed.value.userPresets?.[0]?.style.accentEdge).toEqual({
    color: '#f97316',
    enabled: false,
    lineStyle: 'solid',
    side: 'left',
    width: 4,
  });
});

it('defaults text formatting for catalogs saved before emphasis and alignment existed', () => {
  const style = createSystemCalloutPresetCatalog()[0]!.style;
  const legacyStyle = {
    ...style,
    typography: Object.fromEntries(
      Object.entries(style.typography).filter(
        ([key]) => key !== 'fontStyle' && key !== 'textAlign' && key !== 'textDecoration'
      )
    ),
  };
  const parsed = parseStoredCalloutPresetCatalog({
    userPresets: [{ id: 'user-legacy-type', name: 'Legacy type', style: legacyStyle }],
  });

  expect(parsed.value.userPresets?.[0]?.style.typography).toMatchObject({
    fontStyle: 'normal',
    textAlign: 'left',
    textDecoration: 'none',
  });
});

it('defaults endpoint sizes for catalogs saved before marker sizing existed', () => {
  const style = createSystemCalloutPresetCatalog()[0]!.style;
  const legacyStyle = {
    ...style,
    connector: Object.fromEntries(
      Object.entries(style.connector).filter(
        ([key]) => key !== 'blockMarkerSize' && key !== 'frameMarkerSize'
      )
    ),
  };
  const parsed = parseStoredCalloutPresetCatalog({
    userPresets: [{ id: 'user-legacy-markers', name: 'Legacy markers', style: legacyStyle }],
  });

  expect(parsed.value.userPresets?.[0]?.style.connector).toMatchObject({
    blockMarkerSize: 10,
    frameMarkerSize: 10,
  });
});

it('defaults line styles and a disabled title divider for older catalogs', () => {
  const style = createSystemCalloutPresetCatalog()[0]!.style;
  const legacyStyle = {
    ...style,
    connector: Object.fromEntries(
      Object.entries(style.connector).filter(([key]) => key !== 'lineStyle')
    ),
    surface: Object.fromEntries(
      Object.entries(style.surface).filter(([key]) => key !== 'borderStyle')
    ),
    title: Object.fromEntries(
      Object.entries(style.title).filter(
        ([key]) => !['dividerColor', 'dividerStyle', 'dividerWidth'].includes(key)
      )
    ),
  };
  const parsed = parseStoredCalloutPresetCatalog({
    userPresets: [{ id: 'user-legacy-lines', name: 'Legacy lines', style: legacyStyle }],
  });

  expect(parsed.value.userPresets?.[0]?.style).toMatchObject({
    connector: { lineStyle: 'solid' },
    surface: { borderStyle: 'solid' },
    title: { dividerColor: 'transparent', dividerStyle: 'solid', dividerWidth: 0 },
  });
});

it('preserves the explicit angled connector routing mode', () => {
  const style = createSystemCalloutPresetCatalog()[0]!.style;
  const parsed = parseStoredCalloutPresetCatalog({
    userPresets: [
      {
        id: 'user-angled',
        name: 'Angled',
        style: {
          ...style,
          connector: { ...style.connector, kind: 'line', routing: 'polyline' },
        },
      },
    ],
  });

  expect(parsed.value.userPresets?.[0]?.style.connector.routing).toBe('polyline');
});

it('parses the explicit system customization marker and its source revision', () => {
  const preset = createSystemCalloutPresetCatalog()[0]!;
  const parsed = parseStoredCalloutPresetCatalog({
    systemOverrides: [
      {
        basedOnRevision: 1,
        customized: false,
        name: preset.name,
        style: preset.style,
        systemPresetKey: preset.systemPresetKey,
      },
    ],
  });
  expect(parsed).toMatchObject({ hasInvalidRoot: false, invalidFieldCount: 0 });
  expect(parsed.value.systemOverrides?.[0]).toMatchObject({
    basedOnRevision: 1,
    customized: false,
  });
});

it('counts malformed boundary rows without casting them into the catalog', () => {
  const parsed = parseStoredCalloutPresetCatalog({
    placements: [{ id: 'x', enabled: 'yes', order: -1 }],
    userPresets: [{ id: 'system-callout-bubble', name: '', style: {} }],
  });
  expect(parsed.invalidFieldCount).toBe(2);
  expect(parsed.value.placements).toEqual([]);
  expect(parsed.value.userPresets).toEqual([]);
  expect(parseStoredCalloutPresetCatalog([]).hasInvalidRoot).toBe(true);
});

it('drops duplicate identifiers and marks the payload unsafe for mutation', () => {
  const duplicate = { enabled: true, id: 'user-one', order: 0 };
  const parsed = parseStoredCalloutPresetCatalog({ placements: [duplicate, duplicate] });
  expect(parsed.invalidFieldCount).toBe(1);
  expect(parsed.value.placements).toEqual([duplicate]);
});

it('rejects unsafe colors while preserving a user-expanded wrapping width', () => {
  const style = createSystemCalloutPresetCatalog()[0]!.style;
  const unsafeColor = {
    ...style,
    surface: { ...style.surface, backgroundColor: 'url(https://example.test/tracker)' },
  };
  const oversized = {
    ...style,
    typography: { ...style.typography, maxWidth: 100_000 },
  };
  const parsed = parseStoredCalloutPresetCatalog({
    userPresets: [
      { id: 'user-unsafe-color', name: 'Unsafe color', style: unsafeColor },
      { id: 'user-oversized', name: 'Oversized', style: oversized },
    ],
  });

  expect(parsed.invalidFieldCount).toBe(1);
  expect(parsed.value.userPresets).toHaveLength(1);
  expect(parsed.value.userPresets?.[0]?.style.typography.maxWidth).toBe(100_000);
});

it('rejects endpoint sizes outside the supported visual range', () => {
  const style = createSystemCalloutPresetCatalog()[0]!.style;
  const parsed = parseStoredCalloutPresetCatalog({
    userPresets: [
      {
        id: 'user-invalid-marker',
        name: 'Invalid marker',
        style: {
          ...style,
          connector: { ...style.connector, blockMarkerSize: 49 },
        },
      },
    ],
  });

  expect(parsed.invalidFieldCount).toBe(1);
  expect(parsed.value.userPresets).toEqual([]);
});

it('rejects unknown frame color binding sources', () => {
  const style = createSystemCalloutPresetCatalog()[0]!.style;
  const parsed = parseStoredCalloutPresetCatalog({
    userPresets: [
      {
        id: 'user-invalid-binding',
        name: 'Invalid binding',
        style: {
          ...style,
          colorBindings: { ...style.colorBindings, connector: 'page-css-variable' },
        },
      },
    ],
  });

  expect(parsed.invalidFieldCount).toBe(1);
  expect(parsed.value.userPresets).toEqual([]);
});

it('rejects unsupported accent sides and widths', () => {
  const style = createSystemCalloutPresetCatalog()[0]!.style;
  const parsed = parseStoredCalloutPresetCatalog({
    userPresets: [
      {
        id: 'user-invalid-accent-side',
        name: 'Invalid accent side',
        style: { ...style, accentEdge: { ...style.accentEdge, side: 'center' } },
      },
      {
        id: 'user-invalid-accent-width',
        name: 'Invalid accent width',
        style: { ...style, accentEdge: { ...style.accentEdge, width: 13 } },
      },
    ],
  });

  expect(parsed.invalidFieldCount).toBe(2);
  expect(parsed.value.userPresets).toEqual([]);
});

it('rejects a preset position whose anchor and side are outside the supported grid', () => {
  const style = createSystemCalloutPresetCatalog()[0]!.style;
  const parsed = parseStoredCalloutPresetCatalog({
    userPresets: [
      {
        id: 'user-invalid-position',
        name: 'Invalid position',
        placement: { anchor: 'center', side: 'auto' },
        style,
      },
    ],
  });

  expect(parsed.invalidFieldCount).toBe(1);
  expect(parsed.value.userPresets).toEqual([]);
});

it('accepts larger title typography while keeping its persisted range bounded', () => {
  const style = createSystemCalloutPresetCatalog()[0]!.style;
  const parsed = parseStoredCalloutPresetCatalog({
    userPresets: [
      {
        id: 'user-large-title',
        name: 'Large title',
        style: { ...style, title: { ...style.title, fontSize: 144 } },
      },
      {
        id: 'user-oversized-title',
        name: 'Oversized title',
        style: { ...style, title: { ...style.title, fontSize: 145 } },
      },
    ],
  });

  expect(parsed.invalidFieldCount).toBe(1);
  expect(parsed.value.userPresets?.map((preset) => preset.id)).toEqual(['user-large-title']);
});
