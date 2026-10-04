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
    en: 'Search Trash Bin',
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

it.each([false, true])(
  'consumes search Escape and returns to the list without changing its query, Trash=%s',
  (trashMode) => {
    const grid = document.createElement('div');
    grid.tabIndex = -1;
    container?.append(grid);
    const searchRef = { current: null as HTMLInputElement | null };
    const onExit = vi.fn(() => grid.focus());
    const onSearchChange = vi.fn();
    const bubble = vi.fn();
    window.addEventListener('keydown', bubble);
    act(() =>
      root?.render(
        <GalleryHeaderSearchField
          folderFilter="all"
          trashMode={trashMode}
          search="keep this query"
          onSearchChange={onSearchChange}
          onSearchCommit={commit}
          searchNavigation={{ inputRef: searchRef, onExit }}
        />
      )
    );
    // Render replaces the root children; keep the list surface outside that root.
    document.body.append(grid);
    const input = searchRef.current;
    input?.focus();
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    act(() => input?.dispatchEvent(escape));
    expect(escape.defaultPrevented).toBe(true);
    expect(bubble).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(grid);
    expect(input?.value).toBe('keep this query');
    expect(onSearchChange).not.toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
    window.removeEventListener('keydown', bubble);
    grid.remove();
  }
);
