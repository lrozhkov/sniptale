// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../../platform/i18n', () => ({
  translate: (key: string) => key,
}));

import { EditorDocumentExportPreferencesImageSizeRow } from './image-size';
import type { EditorExportImageSizeState } from '../../export-image-size';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createSizeState(): EditorExportImageSizeState {
  return {
    draft: { height: 900, width: 1600 },
    locked: true,
    setHeight: vi.fn(),
    setLocked: vi.fn(),
    setWidth: vi.fn(),
  };
}

async function renderRow(sizeState: EditorExportImageSizeState) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  await act(async () => {
    root?.render(<EditorDocumentExportPreferencesImageSizeRow sizeState={sizeState} />);
  });
}

function queryInput(dataUi: string) {
  return container?.querySelector(`[data-ui="${dataUi}"]`) as HTMLInputElement | null;
}

function setInputValue(input: HTMLInputElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  descriptor?.set?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
});

beforeEach(() => {
  vi.clearAllMocks();
});

function registerDimensionCommitTest() {
  it('commits sanitized width and height values from draft inputs', async () => {
    const sizeState = createSizeState();

    await renderRow(sizeState);

    await act(async () => {
      setInputValue(queryInput('editor.file-actions.export-size.width')!, '0020abc');
    });
    await act(async () => {
      queryInput('editor.file-actions.export-size.width')!.dispatchEvent(
        new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' })
      );
    });
    await act(async () => {
      setInputValue(queryInput('editor.file-actions.export-size.height')!, '0');
    });
    await act(async () => {
      queryInput('editor.file-actions.export-size.height')!.dispatchEvent(
        new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' })
      );
    });

    expect(sizeState.setWidth).toHaveBeenCalledWith(20);
    expect(sizeState.setHeight).toHaveBeenCalledWith(1);
  });
}

function registerDimensionResetTest() {
  it('restores the current dimension when the draft is cleared or escaped', async () => {
    const sizeState = createSizeState();

    await renderRow(sizeState);

    await act(async () => {
      setInputValue(queryInput('editor.file-actions.export-size.width')!, '');
    });
    await act(async () => {
      queryInput('editor.file-actions.export-size.width')!.dispatchEvent(
        new FocusEvent('blur', { bubbles: true })
      );
    });
    await act(async () => {
      setInputValue(queryInput('editor.file-actions.export-size.height')!, '777');
    });
    await act(async () => {
      queryInput('editor.file-actions.export-size.height')!.dispatchEvent(
        new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' })
      );
    });

    expect(sizeState.setWidth).not.toHaveBeenCalled();
    expect(queryInput('editor.file-actions.export-size.height')?.value).toBe('900');
  });
}

function registerAspectToggleTest() {
  it('toggles the aspect lock from the inline header action', async () => {
    const sizeState = createSizeState();

    await renderRow(sizeState);

    await act(async () => {
      (
        container?.querySelector(
          'button[title="editor.compact.keepAspectRatio"]'
        ) as HTMLButtonElement | null
      )?.click();
    });

    expect(sizeState.setLocked).toHaveBeenCalledWith(expect.any(Function));
  });
}

function registerImageSizeRowTests() {
  registerDimensionCommitTest();
  registerDimensionResetTest();
  registerAspectToggleTest();
}

describe('editor export image size row', registerImageSizeRowTests);
