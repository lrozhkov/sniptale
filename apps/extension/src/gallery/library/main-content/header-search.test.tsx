// @vitest-environment jsdom

import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { GalleryHeaderSearchField } from './header-search';
import { galleryAppMessages } from '../../../platform/i18n/messages/gallery/app';

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;
const commit = vi.fn();

function SearchProbe({ trashMode = false }: { trashMode?: boolean }) {
  const [search, setSearch] = useState('');
  return (
    <GalleryHeaderSearchField
      folderFilter="all"
      trashMode={trashMode}
      search={search}
      onSearchChange={setSearch}
      onSearchCommit={(value) => {
        commit(value);
        setSearch(value);
      }}
    />
  );
}

function typeSearch(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

it('shows a quiet clear button for nonempty search and restores input focus immediately', () => {
  act(() => root?.render(<SearchProbe />));
  const input = container?.querySelector<HTMLInputElement>('input');
  expect(input).not.toBeNull();
  expect(container?.querySelector('[data-ui="gallery.header.clearSearch"]')).toBeNull();

  act(() => typeSearch(input!, 'long matching search term'));
  const clear = container?.querySelector<HTMLButtonElement>(
    '[data-ui="gallery.header.clearSearch"]'
  );
  expect(clear?.getAttribute('aria-label')).toBe('gallery.app.clearSearch');
  expect(clear?.className).toContain('h-7 w-7');
  expect(clear?.className).toContain('focus-visible:ring-2');
  expect(input?.className).toContain('min-w-0 flex-1');
  expect(input?.parentElement?.tagName).toBe('DIV');

  act(() => clear?.click());
  expect(commit).toHaveBeenLastCalledWith('');
  expect(input?.value).toBe('');
  expect(document.activeElement).toBe(input);
  expect(container?.querySelector('[data-ui="gallery.header.clearSearch"]')).toBeNull();
});

it('commits Enter immediately while ignoring an active IME composition', () => {
  act(() => root?.render(<SearchProbe trashMode />));
  const input = container?.querySelector<HTMLInputElement>('input');
  expect(input?.getAttribute('aria-label')).toBe('gallery.app.trashSearchLabel');
  expect(galleryAppMessages.trashSearchPlaceholder).toEqual({ ru: 'Поиск', en: 'Search' });
  expect(galleryAppMessages.trashSearchLabel).toEqual({
    ru: 'Поиск в корзине',
    en: 'Search Trash',
  });
  act(() => typeSearch(input!, 'deleted material'));

  act(() => {
    input?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, isComposing: true })
    );
  });
  expect(commit).not.toHaveBeenCalled();

  act(() => {
    input?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  });
  expect(commit).toHaveBeenCalledOnce();
  expect(commit).toHaveBeenLastCalledWith('deleted material');
});
