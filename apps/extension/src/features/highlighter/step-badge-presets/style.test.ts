import { expect, it } from 'vitest';
import { createSystemStepBadgePresetCatalog, createStepBadgeSettingsFromTemplate } from './catalog';
import { getLinkedStepBadgeDiameter, resolveStepBadgeVisualStyle } from './style';

it('keeps the classic linked diameter compatible with the legacy renderer', () => {
  expect(getLinkedStepBadgeDiameter(4)).toBeCloseTo(29.16);
  expect(getLinkedStepBadgeDiameter(8)).toBeCloseTo(48.6);
});

it('resolves semantic colors and uses fallback for transparent frame fill', () => {
  const settings = createStepBadgeSettingsFromTemplate(
    createSystemStepBadgePresetCatalog()[1]!.settings
  );
  settings.style = {
    ...settings.style,
    backgroundColorSource: 'frame-fill',
    backgroundColor: '#abcdef',
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
