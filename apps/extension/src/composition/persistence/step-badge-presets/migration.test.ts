import { expect, it } from 'vitest';
import { createSystemStepBadgePresetCatalog } from '../../../features/highlighter/step-badge-presets/catalog';
import { resolveStoredStepBadgePresetCatalog, serializeStepBadgePresetCatalog } from './migration';
import { setStepBadgeSessionDefaults } from './mutations';

it('defaults legacy sessions to off with frame-linked styling and round-trips explicit defaults', () => {
  const legacy = resolveStoredStepBadgePresetCatalog({});
  expect(legacy.newSessionDefaults).toEqual({ enabled: false, templateSource: 'frame-default' });
  const configured = resolveStoredStepBadgePresetCatalog({
    newSessionDefaults: { enabled: true, templateSource: 'forced' },
  });
  expect(resolveStoredStepBadgePresetCatalog(serializeStepBadgePresetCatalog(configured))).toEqual(
    configured
  );
});

it('does not mark the preset catalog customized when only session defaults change', () => {
  const configured = setStepBadgeSessionDefaults(resolveStoredStepBadgePresetCatalog({}), {
    enabled: true,
    templateSource: 'forced',
  })!;
  const stored = serializeStepBadgePresetCatalog(configured);

  expect(configured.catalogCustomized).toBe(false);
  expect(stored.catalogCustomized).toBe(false);
  expect(
    resolveStoredStepBadgePresetCatalog(stored).presets.every((preset) => preset.enabled !== false)
  ).toBe(true);
});

it('updates untouched systems and preserves customized system snapshots', () => {
  const settings = createSystemStepBadgePresetCatalog()[0]!.settings;
  const catalog = resolveStoredStepBadgePresetCatalog({
    systemCatalogRevision: 0,
    systemOverrides: [
      {
        systemPresetKey: 'system-classic',
        name: 'Mine',
        customized: true,
        basedOnRevision: 0,
        settings: { ...settings, style: { ...settings.style, diameter: 44 } },
      },
    ],
  });
  expect(catalog.presets[0]).toMatchObject({
    customized: true,
    name: 'Mine',
    settings: { style: { diameter: 44 } },
  });
  expect(resolveStoredStepBadgePresetCatalog(serializeStepBadgePresetCatalog(catalog))).toEqual(
    catalog
  );
});

it('migrates absent tag metadata and compactly round-trips assigned tags', () => {
  const legacy = resolveStoredStepBadgePresetCatalog({});
  expect(legacy.presets.every((preset) => preset.tagIds.length === 0)).toBe(true);
  legacy.presets[0]!.tagIds = ['tag-one'];
  expect(resolveStoredStepBadgePresetCatalog(serializeStepBadgePresetCatalog(legacy))).toEqual(
    legacy
  );
});
