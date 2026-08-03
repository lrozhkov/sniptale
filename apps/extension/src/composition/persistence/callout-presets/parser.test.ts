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

it('rejects unsafe colors and out-of-range visual resources at the storage boundary', () => {
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

  expect(parsed.invalidFieldCount).toBe(2);
  expect(parsed.value.userPresets).toEqual([]);
});
