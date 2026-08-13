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

it('previews selected data in canonical order and inserts it as a row', () => {
  const onInsert = vi.fn();
  act(() => root.render(<EditorTechnicalDataPicker onInsert={onInsert} />));

  const checkboxes = Array.from(container.querySelectorAll<HTMLInputElement>('input'));
  const layout = Array.from(container.querySelectorAll('button')).find(
    (button) => button.getAttribute('aria-label') === 'editor.compact.technicalDataLayout'
  );

  act(() => {
    layout?.click();
    checkboxes[2]?.click();
    checkboxes[0]?.click();
  });

  const preview = container.querySelector('[aria-label="editor.compact.technicalDataPreview"]');
  expect(preview?.textContent).toContain('editor.compact.pageUrl');
  expect(preview?.textContent).toContain('editor.compact.browser');
  expect(preview?.textContent).toContain('·');

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
