import { expect, it } from 'vitest';
import { describeDesignReviewElement } from './element-label';

it('explains common DOM tags in the active interface locale', () => {
  expect(describeDesignReviewElement('DIV', 'ru')).toBe('<div> — универсальный контейнер');
  expect(describeDesignReviewElement('p', 'ru')).toBe('<p> — абзац текста');
  expect(describeDesignReviewElement('a', 'ru')).toBe('<a> — ссылка');

  expect(describeDesignReviewElement('button', 'en')).toBe('<button> — button');
  expect(describeDesignReviewElement('custom-widget', 'en')).toBe('<custom-widget> — HTML element');
});
