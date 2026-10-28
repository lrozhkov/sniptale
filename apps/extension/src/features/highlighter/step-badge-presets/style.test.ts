import { expect, it } from 'vitest';
import { createSystemStepBadgePresetCatalog, createStepBadgeSettingsFromTemplate } from './catalog';
import { getStepBadgeVisualMetrics } from '../frame-annotation/step-badge-metrics';
import { getLinkedStepBadgeDiameter, resolveStepBadgeVisualStyle } from './style';

it('uses whole diameters for inherited, custom and legacy badges', () => {
  expect(getLinkedStepBadgeDiameter(4)).toBe(29);
  expect(getLinkedStepBadgeDiameter(8)).toBe(49);
  const settings = createStepBadgeSettingsFromTemplate(
    createSystemStepBadgePresetCatalog()[0]!.settings
  );
  settings.style = { ...settings.style, sizeSource: 'custom', diameter: 29.16 };
  expect(
    resolveStepBadgeVisualStyle(settings, { borderColor: '#000000', borderWidth: 4 }).diameter
  ).toBe(29);
  const { style: _style, ...legacy } = settings;
  for (const borderWidth of [1, 4, 5.25, 8]) {
    expect(Number.isInteger(getStepBadgeVisualMetrics(legacy, borderWidth).badgeSize)).toBe(true);
  }
});

it('resolves semantic colors and uses fallback for transparent frame fill', () => {
  const settings = createStepBadgeSettingsFromTemplate(
    createSystemStepBadgePresetCatalog()[1]!.settings
  );
  settings.style = {
    ...settings.style,
    backgroundColorSource: 'frame-fill',
    backgroundColor: '#abcdef',
    outlineColorSource: 'frame-border',
    textColorSource: 'frame-border',
  };
  expect(
    resolveStepBadgeVisualStyle(settings, {
      borderColor: '#123456',
      borderWidth: 4,
      fillColor: '#fedcba00',
    })
  ).toMatchObject({ backgroundColor: '#abcdef', outlineColor: '#123456', textColor: '#123456' });
  expect(
    resolveStepBadgeVisualStyle(settings, {
      borderColor: '#123456',
      borderWidth: 4,
      fillColor: '#fedcba',
    }).backgroundColor
  ).toBe('#fedcba');
});

it('resolves a configurable outline width and preserves the legacy 2px fallback', () => {
  const settings = createStepBadgeSettingsFromTemplate(
    createSystemStepBadgePresetCatalog()[0]!.settings
  );
  settings.style.outlineWidth = 6;
  expect(
    resolveStepBadgeVisualStyle(settings, { borderColor: '#123456', borderWidth: 4 }).outlineWidth
  ).toBe(6);
  delete settings.style.outlineWidth;
  expect(
    resolveStepBadgeVisualStyle(settings, { borderColor: '#123456', borderWidth: 4 }).outlineWidth
  ).toBe(2);
});
