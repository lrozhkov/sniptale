import { expect, it } from 'vitest';
import { createSystemStepBadgePresetCatalog } from '../../../features/highlighter/step-badge-presets/catalog';
import { parseStoredStepBadgePresetCatalog } from './parser';

it('strictly parses valid templates and rejects unsafe colors and duplicate system ids', () => {
  const settings = createSystemStepBadgePresetCatalog()[0]!.settings;
  const valid = parseStoredStepBadgePresetCatalog({
    userPresets: [{ id: 'user-one', name: 'One', settings }],
  });
  expect(valid).toMatchObject({ hasInvalidRoot: false, invalidFieldCount: 0 });
  const unsafe = parseStoredStepBadgePresetCatalog({
    userPresets: [
      {
        id: 'user-two',
        name: 'Two',
        settings: { ...settings, style: { ...settings.style, backgroundColor: 'url(x)' } },
      },
    ],
  });
  expect(unsafe.invalidFieldCount).toBe(1);
  const duplicate = parseStoredStepBadgePresetCatalog({
    userPresets: [{ id: 'system-classic', name: 'Duplicate', settings }],
  });
  expect(duplicate.invalidFieldCount).toBe(1);
});

it('rejects malformed roots, duplicate ids, and catalogs above the user limit', () => {
  expect(parseStoredStepBadgePresetCatalog([]).hasInvalidRoot).toBe(true);
  const settings = createSystemStepBadgePresetCatalog()[0]!.settings;
  const users = Array.from({ length: 17 }, (_, index) => ({
    id: `user-${index}`,
    name: `User ${index}`,
    settings,
  }));
  expect(parseStoredStepBadgePresetCatalog({ userPresets: users }).invalidFieldCount).toBe(1);
  expect(
    parseStoredStepBadgePresetCatalog({
      placements: [
        { id: 'same', enabled: true, order: 0 },
        { id: 'same', enabled: true, order: 1 },
      ],
    }).invalidFieldCount
  ).toBe(1);
});

it('rejects negative and fractional revision and ordering fields', () => {
  for (const value of [
    { schemaVersion: -1 },
    { schemaVersion: 0.5 },
    { systemCatalogRevision: -1 },
    { systemCatalogRevision: 1.5 },
    { placements: [{ id: 'system-classic', enabled: true, order: -1 }] },
    { placements: [{ id: 'system-classic', enabled: true, order: 0.5 }] },
    {
      systemOverrides: [
        {
          basedOnRevision: -1,
          customized: true,
          name: 'Classic',
          settings: createSystemStepBadgePresetCatalog()[0]!.settings,
          systemPresetKey: 'system-classic',
        },
      ],
    },
  ]) {
    expect(parseStoredStepBadgePresetCatalog(value).invalidFieldCount).toBe(1);
  }
});
