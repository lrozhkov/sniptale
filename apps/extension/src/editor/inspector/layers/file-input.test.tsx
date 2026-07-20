// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { LayerInsertImageControl } from './file-input';

const mocks = vi.hoisted(() => ({
  controller: { id: 'controller' },
  fireAndReport: vi.fn((_label: string, action: () => unknown) => action()),
  insertImage: vi.fn(),
}));

vi.mock('../../application/controller-context', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../application/controller-context')>();
  return {
    ...actual,
    useEditorController: () => mocks.controller,
  };
});

vi.mock('../../runtime/async-actions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../runtime/async-actions')>();
  return {
    ...actual,
    fireAndReportEditorAction: mocks.fireAndReport,
  };
});

vi.mock('../../document/file-actions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../document/file-actions')>();
  return {
    ...actual,
    insertEditorImageFromFile: mocks.insertImage,
  };
});

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  mocks.fireAndReport.mockClear();
  mocks.insertImage.mockClear();
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

it('opens the hidden input and uploads the selected layer image', () => {
  const clickSpy = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
  const file = new File(['image'], 'layer.png', { type: 'image/png' });

  act(() => {
    root?.render(<LayerInsertImageControl />);
  });
  act(() => {
    container?.querySelector('button')?.click();
  });
  const input = container?.querySelector<HTMLInputElement>('input[type="file"]');
  expect(input).not.toBeNull();
  Object.defineProperty(input, 'files', {
    configurable: true,
    value: [file],
  });
  act(() => {
    input?.dispatchEvent(new Event('change', { bubbles: true }));
  });

  expect(clickSpy).toHaveBeenCalledTimes(1);
  expect(mocks.fireAndReport).toHaveBeenCalledWith(
    'layers-insert-image-upload',
    expect.any(Function)
  );
  expect(mocks.insertImage).toHaveBeenCalledWith(mocks.controller, file);
  expect(input?.value).toBe('');
});
