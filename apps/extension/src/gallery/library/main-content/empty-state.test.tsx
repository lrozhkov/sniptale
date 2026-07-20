import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

import { GalleryEmptyState } from './empty-state';

it('renders the scenario-specific empty copy inside the shared empty shell', () => {
  const markup = renderToStaticMarkup(<GalleryEmptyState folderFilter="scenario" />);

  expect(markup).toContain('gallery.app.emptyScenarioTitle');
  expect(markup).toContain('gallery.app.emptyScenarioDescription');
  expect(markup).toContain('min-h-[420px]');
});

it('renders the default media empty copy for non-scenario folders', () => {
  const markup = renderToStaticMarkup(<GalleryEmptyState folderFilter="all" />);

  expect(markup).toContain('gallery.app.emptyTitle');
  expect(markup).toContain('gallery.app.emptyDescription');
});
