// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { EditorTechnicalDataPicker } from './technical-data-picker';

vi.mock('../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/i18n')>()),
  translate: (key: string) => key,
  useAppLocale: () => 'en',
}));

const container = document.createElement('div');
document.body.appendChild(container);
const root = createRoot(container);

afterEach(() => {
  act(() => root.render(<></>));
  vi.clearAllMocks();
});

it('offers layout only for multiple fields and inserts them in canonical order', () => {
  const onInsert = vi.fn();
  act(() => root.render(<EditorTechnicalDataPicker onInsert={onInsert} />));

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
  act(() => layout?.click());
  expect(container.querySelector('[aria-label="editor.compact.technicalDataPreview"]')).toBeNull();

  const insert = Array.from(container.querySelectorAll('button')).find(
    (button) => button.textContent === 'editor.compact.technicalDataInsert'
  );
  act(() => insert?.click());

  expect(onInsert).toHaveBeenCalledWith(['url', 'browser'], 'row');
  expect(insert?.disabled).toBe(true);
});

it('announces the empty preview and keeps insert disabled', () => {
  act(() => root.render(<EditorTechnicalDataPicker onInsert={vi.fn()} variant="compact" />));

  expect(container.textContent).toContain('editor.compact.technicalDataPreviewEmpty');
  expect(
    Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'editor.compact.technicalDataInsert'
    )?.disabled
  ).toBe(true);
});
