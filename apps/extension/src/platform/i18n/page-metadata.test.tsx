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

  expect(document.title).toBe('Sniptale — Библиотека');
  expect(document.documentElement.lang).toBe('ru');

  useAppLocaleMock.mockReturnValue('en');

  await act(async () => {
    root?.render(<Harness titleKey="gallery.app.documentTitle" />);
  });

  expect(document.title).toBe('Sniptale — Library');
  expect(document.documentElement.lang).toBe('en');
});

function DocumentHarness(props: { name?: string | null | undefined; preview?: boolean }) {
  usePageLocaleMetadata(
    'scenario.editor.documentTitle',
    props.name,
    props.preview ? 'scenario.editor.previewTitle' : undefined
  );
  return null;
}

it('tracks names, preview context, locale, and clearing a document without a branded suffix', async () => {
  useAppLocaleMock.mockReturnValue('en');
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  for (const [name, preview, expected] of [
    [undefined, false, 'Scenario editor'],
    ['  Project A  ', false, 'Project A'],
    ['Project B', true, 'Project B · Preview'],
    ['   ', true, 'Scenario editor'],
    [null, false, 'Scenario editor'],
  ] as const) {
    await act(async () => root?.render(<DocumentHarness name={name} preview={preview} />));
    expect(document.title).toBe(expected);
  }
  useAppLocaleMock.mockReturnValue('ru');
  await act(async () => root?.render(<DocumentHarness name="Проект" preview />));
  expect(document.title).toBe('Проект · Просмотр');
  expect(document.documentElement.lang).toBe('ru');
  await act(async () => root?.render(<DocumentHarness />));
  expect(document.title).toBe('Редактор сценариев');
});
