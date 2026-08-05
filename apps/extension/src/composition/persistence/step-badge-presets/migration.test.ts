import { expect, it } from 'vitest';
import { createSystemStepBadgePresetCatalog } from '../../../features/highlighter/step-badge-presets/catalog';
import { resolveStoredStepBadgePresetCatalog, serializeStepBadgePresetCatalog } from './migration';

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
