import { expect, it } from 'vitest';
import { createSystemStepBadgePresetCatalog } from '../../../features/highlighter/step-badge-presets/catalog';
import { parseStoredStepBadgePresetCatalog } from './parser';

it('parses bounded new-session defaults and rejects malformed values', () => {
  const valid = parseStoredStepBadgePresetCatalog({
    newSessionDefaults: { enabled: true, templateSource: 'forced' },
  });
  expect(valid.value.newSessionDefaults).toEqual({ enabled: true, templateSource: 'forced' });
  expect(valid.invalidFieldCount).toBe(0);

  for (const newSessionDefaults of [
    { enabled: 'yes', templateSource: 'forced' },
    { enabled: true, templateSource: 'unknown' },
    null,
  ]) {
    const malformed = parseStoredStepBadgePresetCatalog({ newSessionDefaults });
    expect(malformed.value.newSessionDefaults).toBeUndefined();
    expect(malformed.invalidFieldCount).toBe(1);
  }
});

it('strictly parses valid templates and rejects unsafe colors and duplicate system ids', () => {
  const settings = createSystemStepBadgePresetCatalog()[0]!.settings;
  const valid = parseStoredStepBadgePresetCatalog({
    userPresets: [{ id: 'user-one', name: 'One', settings }],
  });
  expect(valid).toMatchObject({ hasInvalidRoot: false, invalidFieldCount: 0 });
  const { outlineWidth: _legacyOutlineWidth, ...legacyStyle } = settings.style;
  const legacy = parseStoredStepBadgePresetCatalog({
    userPresets: [
      { id: 'legacy-outline', name: 'Legacy', settings: { ...settings, style: legacyStyle } },
    ],
  });
  expect(legacy.value.userPresets?.[0]?.settings.style.outlineWidth).toBe(2);
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
  const oversizedCss = parseStoredStepBadgePresetCatalog({
    userPresets: [
      {
        id: 'user-css',
        name: 'CSS',
        settings: { ...settings, style: { ...settings.style, customCss: 'x'.repeat(4_001) } },
      },
    ],
  });
  expect(oversizedCss.invalidFieldCount).toBe(1);
  const invalidOutline = parseStoredStepBadgePresetCatalog({
    userPresets: [
      {
        id: 'invalid-outline',
        name: 'Invalid outline',
        settings: { ...settings, style: { ...settings.style, outlineWidth: 21 } },
      },
    ],
  });
  expect(invalidOutline.invalidFieldCount).toBe(1);
  for (const customCss of [
    '[badge]\nbackground: url(https://example.com/tracker.png);',
    '[badge]\nbackground: src("https://example.com/tracker.png");',
    '[badge]\nbackground: image("https://example.com/tracker.png");',
    '[text]\ncolor: var(--page-color);',
    '[badge]\nposition: fixed;',
    '[unknown]\ncolor: red;',
    '[badge]\ncolor red;',
  ]) {
    const unsafeCss = parseStoredStepBadgePresetCatalog({
      userPresets: [
        {
          id: 'user-unsafe-css',
          name: 'Unsafe CSS',
          settings: { ...settings, style: { ...settings.style, customCss } },
        },
      ],
    });
    expect(unsafeCss.invalidFieldCount).toBe(1);
  }
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
