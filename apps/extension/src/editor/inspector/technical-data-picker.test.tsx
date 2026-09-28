// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { EditorTechnicalDataPicker } from './technical-data-picker';

const { loadPreferenceMock, savePreferenceMock } = vi.hoisted(() => ({
  loadPreferenceMock: vi.fn(),
  savePreferenceMock: vi.fn(),
}));

vi.mock('../persistence/ui-state/technical-data', () => ({
  loadEditorTechnicalDataPreference: loadPreferenceMock,
  saveEditorTechnicalDataPreference: savePreferenceMock,
}));

vi.mock('../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/i18n')>()),
  translate: (key: string) => key,
  useAppLocale: () => 'en',
}));

const container = document.createElement('div');
document.body.appendChild(container);
const root = createRoot(container);

beforeEach(() => {
  loadPreferenceMock.mockResolvedValue({ kinds: [], layout: 'column' });
  savePreferenceMock.mockResolvedValue(undefined);
});

afterEach(() => {
  act(() => root.render(<></>));
  vi.clearAllMocks();
});

it('offers layout only for multiple fields and inserts them in canonical order', async () => {
  const onInsert = vi.fn();
  await act(async () => root.render(<EditorTechnicalDataPicker onInsert={onInsert} />));

  const buttons = Array.from(container.querySelectorAll('button'));
  expect(container.textContent).not.toContain('editor.compact.technicalDataLayoutRow');

  act(() => {
    buttons
      .find((button) => button.getAttribute('aria-label') === 'editor.compact.browser')
      ?.click();
    buttons
      .find((button) => button.getAttribute('aria-label') === 'editor.compact.pageUrl')
      ?.click();
  });

  const layout = Array.from(container.querySelectorAll('button')).find(
    (button) => button.textContent === 'editor.compact.technicalDataLayoutRow'
  );
  expect(layout).toBeTruthy();
  expect(layout?.getAttribute('aria-pressed')).toBe('false');
  expect(layout?.parentElement?.className).toContain('bg-[var(--sniptale-color-surface-hover)]');
  act(() => layout?.click());
  expect(layout?.getAttribute('aria-pressed')).toBe('true');
  expect(layout?.className).toContain('bg-[var(--sniptale-color-surface-panel)]');
  expect(container.querySelector('[aria-label="editor.compact.technicalDataPreview"]')).toBeNull();

  const insert = Array.from(container.querySelectorAll('button')).find(
    (button) => button.textContent === 'editor.compact.technicalDataInsert'
  );
  await act(async () => insert?.click());

  expect(onInsert).toHaveBeenCalledWith(['url', 'browser'], 'row');
  expect(savePreferenceMock).toHaveBeenCalledWith({ kinds: ['url', 'browser'], layout: 'row' });
  expect(insert?.disabled).toBe(false);
});

it('announces the empty preview and keeps insert disabled', async () => {
  await act(async () =>
    root.render(<EditorTechnicalDataPicker onInsert={vi.fn()} variant="compact" />)
  );

  expect(container.textContent).toContain('editor.compact.technicalDataPreviewEmpty');
  expect(
    Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'editor.compact.technicalDataInsert'
    )?.disabled
  ).toBe(true);
});

it('restores the last inserted selection and layout on a new mount', async () => {
  loadPreferenceMock.mockResolvedValueOnce({ kinds: ['date', 'browser'], layout: 'row' });
  const onInsert = vi.fn();
  await act(async () => root.render(<EditorTechnicalDataPicker onInsert={onInsert} />));

  const date = container.querySelector<HTMLButtonElement>('[aria-label="editor.compact.dateTime"]');
  const browser = container.querySelector<HTMLButtonElement>(
    '[aria-label="editor.compact.browser"]'
  );
  expect(date?.getAttribute('aria-pressed')).toBe('true');
  expect(browser?.getAttribute('aria-pressed')).toBe('true');
  expect(
    Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent === 'editor.compact.technicalDataLayoutRow')
      ?.getAttribute('aria-pressed')
  ).toBe('true');

  const insert = Array.from(container.querySelectorAll('button')).find(
    (button) => button.textContent === 'editor.compact.technicalDataInsert'
  );
  act(() => insert?.click());
  expect(onInsert).toHaveBeenCalledWith(['date', 'browser'], 'row');
});

it('preserves user changes made before the saved preference loads', async () => {
  let resolveLoad: (value: { kinds: ['date']; layout: 'row' }) => void = () => undefined;
  loadPreferenceMock.mockReturnValueOnce(
    new Promise((resolve) => {
      resolveLoad = resolve;
    })
  );
  act(() => root.render(<EditorTechnicalDataPicker onInsert={vi.fn()} />));
  const url = container.querySelector<HTMLButtonElement>('[aria-label="editor.compact.pageUrl"]');
  act(() => url?.click());
  await act(async () => resolveLoad({ kinds: ['date'], layout: 'row' }));
  expect(url?.getAttribute('aria-pressed')).toBe('true');
  expect(
    container
      .querySelector<HTMLButtonElement>('[aria-label="editor.compact.dateTime"]')
      ?.getAttribute('aria-pressed')
  ).toBe('false');
});

it('reports when insertion succeeds but saving the preference fails', async () => {
  savePreferenceMock.mockRejectedValueOnce(new Error('quota'));
  await act(async () => root.render(<EditorTechnicalDataPicker onInsert={vi.fn()} />));
  act(() =>
    container.querySelector<HTMLButtonElement>('[aria-label="editor.compact.pageUrl"]')?.click()
  );
  await act(async () => {
    Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent === 'editor.compact.technicalDataInsert')
      ?.click();
  });
  expect(container.querySelector('[role="alert"]')?.textContent).toBe(
    'editor.compact.technicalDataPreferenceSaveFailed'
  );
});
