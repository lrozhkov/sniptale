import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TranslationKey } from '../../platform/i18n';

const { translateMock } = vi.hoisted(() => ({
  translateMock: vi.fn((key: string) => key),
}));

vi.mock('../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/i18n')>()),
  translate: translateMock,
}));

import { getSettingsCountLabel } from './text.helpers';

const countKeys = {
  few: 'few' as TranslationKey,
  many: 'many' as TranslationKey,
  one: 'one' as TranslationKey,
} as const;

describe('settings surface text helpers', () => {
  beforeEach(() => {
    translateMock.mockImplementation((key: string) => key);
  });

  it('uses the single-form fallback for languages without plural variants', () => {
    translateMock.mockReturnValue('items');

    expect(getSettingsCountLabel(1, countKeys)).toBe('items');
    expect(getSettingsCountLabel(2, countKeys)).toBe('items');
  });

  it('selects Russian-style one, few, and many plural forms', () => {
    expect(getSettingsCountLabel(1, countKeys)).toBe('one');
    expect(getSettingsCountLabel(2, countKeys)).toBe('few');
    expect(getSettingsCountLabel(5, countKeys)).toBe('many');
    expect(getSettingsCountLabel(11, countKeys)).toBe('many');
    expect(getSettingsCountLabel(22, countKeys)).toBe('few');
  });
});
