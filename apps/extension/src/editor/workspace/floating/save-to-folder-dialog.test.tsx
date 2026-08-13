// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ProductSaveDialogProps } from '@sniptale/ui/product-save-dialog';
import { EditorSaveToFolderDialog } from './save-to-folder-dialog';

let dialogProps: ProductSaveDialogProps | null = null;

vi.mock('@sniptale/ui/product-save-dialog', () => ({
  ProductSaveDialog: (props: ProductSaveDialogProps) => {
    dialogProps = props;
    return <div data-ui="mock.save-dialog">{props.footer}</div>;
  },
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createController(overrides: Record<string, unknown> = {}) {
  return {
    onSaveImageAs: vi.fn(async () => undefined),
    savePresets: [{ id: 'docs', name: 'Documents', path: 'Sniptale' }],
    saveToPreset: vi.fn(async () => undefined),
    ...overrides,
  };
}

function renderDialog(controller: ReturnType<typeof createController>, onClose = vi.fn()) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const element = Reflect.apply(createElement, null, [
    EditorSaveToFolderDialog,
    { controller, defaultFilename: 'capture.png', onClose },
  ]);
  act(() => root?.render(element));
  return { controller, onClose };
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.useFakeTimers();
  dialogProps = null;
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('maps presets, editable filename, saving success, and delayed close', async () => {
  const { controller, onClose } = renderDialog(createController());
  expect(dialogProps?.filename).toBe('capture.png');
  expect(dialogProps?.presetItems).toEqual([
    expect.objectContaining({ id: 'docs', title: 'Documents' }),
  ]);

  act(() => dialogProps?.onFilenameChange('named.png'));
  await act(async () => {
    if (dialogProps) Reflect.apply(dialogProps.onChoosePreset, null, ['docs', {}]);
    await Promise.resolve();
  });

  expect(controller.saveToPreset).toHaveBeenCalledWith('docs', { filename: 'named.png' });
  expect(container?.querySelector('[role="status"]')).not.toBeNull();
  act(() => vi.advanceTimersByTime(450));
  expect(onClose).toHaveBeenCalledOnce();
});

it('surfaces save errors and clears them after the filename changes', async () => {
  const error = new Error('disk unavailable');
  renderDialog(createController({ saveToPreset: vi.fn(async () => Promise.reject(error)) }));

  await act(async () => {
    if (dialogProps) Reflect.apply(dialogProps.onChoosePreset, null, ['docs', {}]);
    await Promise.resolve();
  });
  expect(container?.querySelector('[role="alert"]')).not.toBeNull();

  act(() => dialogProps?.onFilenameChange('retry.png'));
  expect(container?.querySelector('[role="alert"]')).toBeNull();
});

it('routes system-folder saves and ignores another action while saving', async () => {
  let resolveSave: (value?: void | PromiseLike<void>) => void = () => undefined;
  const pending = new Promise<void>((resolve) => {
    resolveSave = resolve;
  });
  const controller = createController({ onSaveImageAs: vi.fn(() => pending) });
  renderDialog(controller);

  act(() => {
    if (!dialogProps) return;
    Reflect.apply(dialogProps.onChooseSystemFolder, null, [{}]);
    Reflect.apply(dialogProps.onChooseSystemFolder, null, [{}]);
  });
  expect(controller.onSaveImageAs).toHaveBeenCalledOnce();
  expect(dialogProps?.disabled).toBe(true);
  expect(container?.querySelector('[role="status"]')).not.toBeNull();

  await act(async () => resolveSave());
  expect(controller.onSaveImageAs).toHaveBeenCalledWith({ filename: 'capture.png' });
});

it('does not publish async state or delayed close after unmount', async () => {
  let resolveSave: (value?: void | PromiseLike<void>) => void = () => undefined;
  const pending = new Promise<void>((resolve) => {
    resolveSave = resolve;
  });
  const onClose = vi.fn();
  renderDialog(createController({ onSaveImageAs: vi.fn(() => pending) }), onClose);

  act(() => {
    if (dialogProps) Reflect.apply(dialogProps.onChooseSystemFolder, null, [{}]);
    root?.unmount();
  });
  root = null;
  await act(async () => resolveSave());
  act(() => vi.advanceTimersByTime(450));

  expect(onClose).not.toHaveBeenCalled();
});
