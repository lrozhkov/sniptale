import { expect, it } from 'vitest';
import { getAnnotationTemplateTagDisplayName } from './tag-display-name';

it('localizes canonical system tags and preserves customized and user labels', () => {
  expect(
    getAnnotationTemplateTagDisplayName(
      {
        id: 'system-tag-editorial',
        label: 'Editorial',
        origin: 'system',
        systemTagKey: 'editorial',
        customized: false,
      },
      'ru'
    )
  ).toBe('Редакционный');
  expect(
    getAnnotationTemplateTagDisplayName(
      {
        id: 'system-tag-editorial',
        label: 'Моя редактура',
        origin: 'system',
        systemTagKey: 'editorial',
        customized: true,
      },
      'ru'
    )
  ).toBe('Моя редактура');
  expect(getAnnotationTemplateTagDisplayName({ id: 'user', label: 'Editorial' }, 'ru')).toBe(
    'Editorial'
  );
});
