// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { PageStyleAssetCleanupError } from '../action-errors';
import type { PageStyleInspectorActionOutcome } from '../types';
import { FileField } from './file-field';

let host: HTMLDivElement | null = null;
let root: Root | null = null;

function renderField(onSelect: (file: File) => Promise<PageStyleInspectorActionOutcome>) {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);

  act(() => {
    root?.render(
      <FileField buttonLabel="Upload" disabled={false} label="File" onSelect={onSelect} />
    );
  });
}

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  host?.remove();
  host = null;
  document.body.replaceChildren();
});

it('surfaces file action failures in the field', async () => {
  renderField(
    vi.fn(async () => {
      throw new Error('cleanup failed');
    })
  );
  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  Object.defineProperty(input, 'files', {
    configurable: true,
    value: [new File(['image'], 'hero.png', { type: 'image/png' })],
  });

  await act(async () => {
    input?.dispatchEvent(new Event('change', { bubbles: true }));
  });

  expect(document.body.textContent).toContain('Не удалось сохранить файл');
});

it('surfaces upload compensation cleanup failures in the field', async () => {
  renderField(
    vi.fn(async () => {
      throw new PageStyleAssetCleanupError(['asset-new-image']);
    })
  );
  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  Object.defineProperty(input, 'files', {
    configurable: true,
    value: [new File(['image'], 'hero.png', { type: 'image/png' })],
  });

  await act(async () => {
    input?.dispatchEvent(new Event('change', { bubbles: true }));
  });

  expect(document.body.textContent).toContain(
    'Не удалось применить файл и очистить временную копию'
  );
});

it('surfaces post-apply cleanup warnings in the field', async () => {
  renderField(
    vi.fn(async () => ({
      message: 'Действие выполнено, но часть файлов не удалось очистить',
      state: 'warning' as const,
    }))
  );
  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  Object.defineProperty(input, 'files', {
    configurable: true,
    value: [new File(['image'], 'hero.png', { type: 'image/png' })],
  });

  await act(async () => {
    input?.dispatchEvent(new Event('change', { bubbles: true }));
  });

  expect(document.body.textContent).toContain(
    'Действие выполнено, но часть файлов не удалось очистить'
  );
});
