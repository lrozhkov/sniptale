// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const { useAppLocaleMock } = vi.hoisted(() => ({
  useAppLocaleMock: vi.fn(),
}));

vi.mock('./locale/hook', () => ({
  useAppLocale: useAppLocaleMock,
}));

import { usePageLocaleMetadata } from './page-metadata';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function Harness(props: { titleKey: 'gallery.app.documentTitle' }) {
  usePageLocaleMetadata(props.titleKey);
  return null;
}

beforeEach(() => {
  useAppLocaleMock.mockReset();
  document.title = 'initial';
  document.documentElement.lang = 'ru';
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
});

it('syncs document title and html lang with the active locale', async () => {
  useAppLocaleMock.mockReturnValue('ru');
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  await act(async () => {
    root?.render(<Harness titleKey="gallery.app.documentTitle" />);
  });

  expect(document.title).toBe('Sniptale — Галерея');
  expect(document.documentElement.lang).toBe('ru');

  useAppLocaleMock.mockReturnValue('en');

  await act(async () => {
    root?.render(<Harness titleKey="gallery.app.documentTitle" />);
  });

  expect(document.title).toBe('Sniptale — Gallery');
  expect(document.documentElement.lang).toBe('en');
});
