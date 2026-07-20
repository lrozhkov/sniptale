// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProductConfirmDialog } from './index';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderDialog() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root?.render(
      <ProductConfirmDialog
        title="Delete"
        message="Delete template?"
        confirmText="Delete"
        cancelText="Cancel"
      />
    );
  });
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

function runProductConfirmDialogSuite() {
  it('returns null when the dialog is closed', verifyClosedDialogState);
  it(
    'keeps the backdrop and dialog pointer-interactive inside content-script hosts',
    verifyPointerInteractionContract
  );
  it(
    'renders inside the shared modal shell and wires close and action buttons',
    verifyDialogWiring
  );
  it(
    'keeps the dialog pending while an async confirm action is in flight',
    verifyAsyncPendingState
  );
  it(
    'recovers from rejected async confirms without leaving the dialog stuck pending',
    verifyRejectedAsyncConfirmRecovery
  );
}

describe('ProductConfirmDialog', runProductConfirmDialogSuite);

function verifyClosedDialogState() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root?.render(
      <ProductConfirmDialog
        title="Delete"
        message="Delete template?"
        confirmText="Delete"
        cancelText="Cancel"
        isOpen={false}
      />
    );
  });

  expect(container?.innerHTML).toBe('');
}

function verifyPointerInteractionContract() {
  renderDialog();

  const backdrop = container?.querySelector<HTMLDivElement>('.sniptale-modal-backdrop');
  const dialog = container?.querySelector<HTMLDivElement>('.sniptale-confirm-dialog');

  expect(backdrop?.style.pointerEvents).toBe('auto');
  expect(dialog?.style.pointerEvents).toBe('auto');
  expect(
    backdrop?.className.split(/\s+/).filter((token) => token === 'sniptale-modal-backdrop')
  ).toHaveLength(1);
}

function verifyDialogWiring() {
  const onCancel = vi.fn();
  const onConfirm = vi.fn();

  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root?.render(
      <ProductConfirmDialog
        title="Delete"
        message="Delete template?"
        confirmText="Delete"
        cancelText="Cancel"
        onCancel={onCancel}
        onConfirm={onConfirm}
      />
    );
  });

  const dialog = container?.querySelector<HTMLElement>('[role="alertdialog"]');
  const closeButton = container?.querySelector<HTMLButtonElement>('.sniptale-modal-close');
  const buttons = Array.from(container?.querySelectorAll<HTMLButtonElement>('button') ?? []);
  const cancelButton = buttons.find((button) => button.textContent?.includes('Cancel'));
  const confirmButton = buttons.find((button) => button.textContent?.includes('Delete'));

  expect(dialog).not.toBeNull();
  expect(dialog?.textContent).toContain('Delete template?');
  expect(cancelButton?.className).toContain('rounded-[12px]');
  expect(confirmButton?.className).toContain('border-none');
  expect(confirmButton?.className).toContain('var(--sniptale-color-danger-soft)_34%');

  act(() => {
    closeButton?.click();
    cancelButton?.click();
    confirmButton?.click();
  });

  expect(onCancel).toHaveBeenCalledTimes(2);
  expect(onConfirm).toHaveBeenCalledTimes(1);
}

async function verifyAsyncPendingState() {
  const onConfirm = vi.fn(() => new Promise<void>((resolve) => window.setTimeout(resolve, 50)));

  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root?.render(
      <ProductConfirmDialog
        title="Delete"
        message="Delete template?"
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={onConfirm}
      />
    );
  });

  const buttons = Array.from(container?.querySelectorAll<HTMLButtonElement>('button') ?? []);
  const cancelButton = buttons.find((button) => button.textContent?.includes('Cancel'));
  const confirmButton = buttons.find((button) => button.textContent?.includes('Delete'));

  act(() => {
    confirmButton?.click();
  });

  expect(onConfirm).toHaveBeenCalledTimes(1);
  expect(confirmButton?.disabled).toBe(true);
  expect(cancelButton?.disabled).toBe(true);

  await act(async () => {
    await new Promise((resolve) => window.setTimeout(resolve, 60));
  });

  expect(confirmButton?.disabled).toBe(false);
  expect(cancelButton?.disabled).toBe(false);
}

async function verifyRejectedAsyncConfirmRecovery() {
  const onConfirm = vi.fn(
    () => new Promise<void>((_, reject) => window.setTimeout(() => reject(new Error('failed')), 10))
  );

  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root?.render(
      <ProductConfirmDialog
        title="Delete"
        message="Delete template?"
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={onConfirm}
      />
    );
  });

  const buttons = Array.from(container?.querySelectorAll<HTMLButtonElement>('button') ?? []);
  const cancelButton = buttons.find((button) => button.textContent?.includes('Cancel'));
  const confirmButton = buttons.find((button) => button.textContent?.includes('Delete'));

  act(() => {
    confirmButton?.click();
  });

  expect(confirmButton?.disabled).toBe(true);
  expect(cancelButton?.disabled).toBe(true);

  await act(async () => {
    await new Promise((resolve) => window.setTimeout(resolve, 20));
  });

  expect(confirmButton?.disabled).toBe(false);
  expect(cancelButton?.disabled).toBe(false);
}
