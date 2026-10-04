import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

import { GalleryEmptyState } from './empty-state';

it('renders the scenario-specific empty copy inside the shared empty shell', () => {
  const markup = renderToStaticMarkup(
    <GalleryEmptyState folderFilter="scenario" libraryEmpty={false} />
  );

  expect(markup).toContain('gallery.app.emptyScenarioTitle');
  expect(markup).toContain('gallery.app.emptyScenarioDescription');
  expect(markup).toContain('min-h-[420px]');
  expect(markup).toContain('rounded-[var(--sniptale-radius-lg)]');
});

it('renders the default media empty copy for non-scenario folders', () => {
  const markup = renderToStaticMarkup(
    <GalleryEmptyState folderFilter="all" libraryEmpty={false} />
  );

  expect(markup).toContain('gallery.app.emptyTitle');
  expect(markup).toContain('gallery.app.emptyDescription');
});

it('uses a first-run message only when the Library itself is empty', () => {
  const markup = renderToStaticMarkup(<GalleryEmptyState folderFilter="all" libraryEmpty />);
  expect(markup).toContain('gallery.app.emptyLibraryTitle');
  expect(markup).toContain('gallery.app.emptyLibraryDescription');
  expect(markup).not.toContain('gallery.app.emptyTitle');
});
