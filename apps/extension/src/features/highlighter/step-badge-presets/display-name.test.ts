import { expect, it, vi } from 'vitest';
import { createSystemStepBadgePresetCatalog } from './catalog';
import { getStepBadgePresetDisplayName } from './display-name';

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string, locale: string) => `${locale}:${key}`,
}));

it('translates untouched systems and preserves customized and user names', () => {
  const system = createSystemStepBadgePresetCatalog()[0]!;
  expect(getStepBadgePresetDisplayName(system, 'en')).toBe(
    'en:highlighter.stepBadgePresets.system.classic'
  );
  expect(getStepBadgePresetDisplayName({ ...system, customized: true, name: 'Mine' }, 'ru')).toBe(
    'Mine'
  );
  expect(getStepBadgePresetDisplayName({ ...system, origin: 'user', name: 'User' }, 'en')).toBe(
    'User'
  );
});
