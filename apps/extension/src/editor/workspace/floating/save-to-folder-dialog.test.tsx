// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ProductSaveDialogProps } from '@sniptale/ui/product-save-dialog';
import { EditorSaveToFolderDialog } from './save-to-folder-dialog';

let dialogProps: ProductSaveDialogProps | null = null;

vi.mock('@sniptale/ui/product-save-dialog', () => ({
  ProductSaveDialogSurface: (props: ProductSaveDialogProps) => {
    dialogProps = props;
    return (
      <div data-ui="mock.save-dialog">
        <input aria-label="Filename" />
        <button type="button">Save</button>
        {props.footer}
      </div>
    );
  },
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let anchor: HTMLButtonElement | null = null;

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
  anchor = document.createElement('button');
  vi.spyOn(anchor, 'getBoundingClientRect').mockReturnValue({
    bottom: 48,
    height: 36,
    left: 700,
    right: 736,
    top: 12,
    width: 36,
    x: 700,
    y: 12,
    toJSON: () => ({}),
  });
  document.body.append(container, anchor);
  root = createRoot(container);
  const element = Reflect.apply(createElement, null, [
    EditorSaveToFolderDialog,
    { anchorEl: anchor, controller, defaultFilename: 'capture.png', onClose },
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
  anchor?.remove();
  container = null;
  anchor = null;
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
  expect(document.querySelector('[role="status"]')).not.toBeNull();
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
  expect(document.querySelector('[role="alert"]')).not.toBeNull();

  act(() => dialogProps?.onFilenameChange('retry.png'));
  expect(document.querySelector('[role="alert"]')).toBeNull();
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
  expect(document.querySelector('[role="status"]')).not.toBeNull();

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

it('anchors below its trigger and dismisses on Escape or an outside pointer', () => {
  const { onClose } = renderDialog(createController());
  const positioner = document.querySelector<HTMLElement>('.sniptale-content-popover-positioner');

  expect(positioner?.style.position).toBe('fixed');
  expect(positioner?.style.top).toBe('56px');
  expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  expect(document.activeElement?.getAttribute('aria-label')).toBe('Filename');

  act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
  expect(onClose).toHaveBeenCalledOnce();

  act(() => document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })));
  expect(onClose).toHaveBeenCalledTimes(2);
});

it('restores focus to the save trigger when the dialog unmounts', () => {
  renderDialog(createController());
  expect(document.activeElement).not.toBe(anchor);

  act(() => root?.render(null));

  expect(document.activeElement).toBe(anchor);
});
