// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ScenarioImageStepDialogFields } from './ScenarioImageStepDialogFields';

vi.mock('../../../platform/i18n', () => ({
  translate: (key: string) => key,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function dispatchDrop(target: Element | null | undefined, files: File[]) {
  const event = new Event('drop', { bubbles: true });
  Object.defineProperty(event, 'dataTransfer', {
    configurable: true,
    value: { files },
  });
  target?.dispatchEvent(event);
}

function changeTextInput(input: HTMLInputElement, nextValue: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;

  valueSetter?.call(input, nextValue);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function renderFields(pending = false) {
  const fileInputRef = { current: null as HTMLInputElement | null };
  const onFileChange = vi.fn(async () => undefined);
  const onFileDrop = vi.fn(async () => undefined);
  const onOpenFilePicker = vi.fn(() => fileInputRef.current?.click());
  const onSearchChange = vi.fn();

  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(
      <ScenarioImageStepDialogFields
        error={null}
        fileInputRef={fileInputRef}
        onFileChange={onFileChange}
        onFileDrop={onFileDrop}
        onOpenFilePicker={onOpenFilePicker}
        onSearchChange={onSearchChange}
        pending={pending}
        search=""
      />
    );
  });

  return { fileInputRef, onFileChange, onFileDrop, onOpenFilePicker, onSearchChange };
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

it('opens the file picker from the dropzone and disables controls while pending', () => {
  renderFields(true);
  const pendingDropzone = container?.querySelector<HTMLButtonElement>(
    '[data-ui="scenario.image-step-dropzone"]'
  );

  expect(container?.querySelector<HTMLInputElement>('input[type="text"]')?.disabled).toBe(true);
  expect(pendingDropzone?.disabled).toBe(true);

  const { fileInputRef, onOpenFilePicker } = renderFields(false);
  const dropzone = container?.querySelector<HTMLButtonElement>(
    '[data-ui="scenario.image-step-dropzone"]'
  );
  const fileInput = container?.querySelector<HTMLInputElement>('input[type="file"]');
  fileInputRef.current = fileInput ?? null;
  const clickSpy = vi.spyOn(fileInput ?? document.createElement('input'), 'click');

  act(() => {
    dropzone?.click();
  });

  expect(clickSpy).toHaveBeenCalledTimes(1);
  expect(onOpenFilePicker).toHaveBeenCalledTimes(1);
});

it('forwards dropped files only when the dropzone is active', () => {
  const active = renderFields(false);
  const activeDropzone = container?.querySelector<HTMLButtonElement>(
    '[data-ui="scenario.image-step-dropzone"]'
  );

  act(() => {
    dispatchDrop(activeDropzone, [new File(['image'], 'drop.png', { type: 'image/png' })]);
  });

  expect(active.onFileDrop).toHaveBeenCalledTimes(1);

  const pending = renderFields(true);
  const pendingDropzone = container?.querySelector<HTMLButtonElement>(
    '[data-ui="scenario.image-step-dropzone"]'
  );

  act(() => {
    dispatchDrop(pendingDropzone, [new File(['image'], 'skip.png', { type: 'image/png' })]);
  });

  expect(pending.onFileDrop).not.toHaveBeenCalled();
});

it('opens the file picker from keyboard activation', () => {
  const { onOpenFilePicker } = renderFields(false);
  const dropzone = container?.querySelector<HTMLButtonElement>(
    '[data-ui="scenario.image-step-dropzone"]'
  );

  act(() => {
    dropzone?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
    dropzone?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: ' ' }));
  });

  expect(onOpenFilePicker).toHaveBeenCalledTimes(2);
});

it('forwards file input changes and search updates through the field shell', () => {
  const { fileInputRef, onFileChange, onSearchChange } = renderFields(false);
  const fileInput = container?.querySelector<HTMLInputElement>('input[type="file"]');
  const searchInput = container?.querySelector<HTMLInputElement>('input[type="text"]');
  fileInputRef.current = fileInput ?? null;

  act(() => {
    fileInput?.dispatchEvent(new Event('change', { bubbles: true }));
    if (searchInput) {
      changeTextInput(searchInput, 'hero');
    }
  });

  expect(fileInputRef.current).toBe(fileInput);
  expect(onFileChange).toHaveBeenCalledTimes(1);
  expect(onSearchChange).toHaveBeenCalledWith('hero');
});
