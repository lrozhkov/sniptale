import { expect, it } from 'vitest';
import type { TranslationDictionary, TranslationKey } from './types';

it('derives exact paths and string values from the canonical catalog', () => {
  const key: TranslationKey = 'common.actions.save';
  const translated: TranslationDictionary['common']['actions']['save'] = '保存';
  expect(key).toBe('common.actions.save');
  expect(translated).toBe('保存');
  // @ts-expect-error Unknown message paths must not compile.
  const missing: TranslationKey = 'common.actions.nonexistentTranslation';
  // @ts-expect-error An object path is not a translation key.
  const group: TranslationKey = 'common.actions';
  expect([missing, group]).toHaveLength(2);
});
