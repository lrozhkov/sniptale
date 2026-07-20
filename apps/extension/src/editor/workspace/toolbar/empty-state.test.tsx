import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';

vi.mock('../../../platform/i18n', () => ({
  translate: vi.fn((key: string) => `t:${key}`),
}));

import { EditorToolbarEmptyState } from './empty-state';

it('renders translated toolbar empty-state labels', () => {
  const markup = renderToStaticMarkup(<EditorToolbarEmptyState />);

  expect(markup).toContain('t:editor.page.title');
  expect(markup).toContain('t:editor.page.subtitle');
  expect(markup).toContain('justify-between');
  expect(markup).not.toContain('uppercase');
});
