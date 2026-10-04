import { expect, it } from 'vitest';
import { contextMenuSectionTitle } from './context-menu-section-title';

it('translates generated menu headings but preserves user-custom titles', () => {
  expect(contextMenuSectionTitle('recommended-screenshots', 'Screenshots', 'ru')).toBe('Снимки');
  expect(contextMenuSectionTitle('block-page-link', 'Copy title and link', 'ru')).toBe(
    'Копировать название и ссылку'
  );
  expect(contextMenuSectionTitle('recommended-screenshots', 'My capture', 'ru')).toBe('My capture');
  expect(contextMenuSectionTitle('tools', 'Tools', 'ru')).toBe('Tools');
});
