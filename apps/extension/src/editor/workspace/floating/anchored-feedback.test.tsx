// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { EditorAnchoredAlert, EditorAnchoredConfirmPopover } from './anchored-feedback';

let host: HTMLDivElement;
let root: Root;
let anchor: HTMLButtonElement;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  anchor = document.createElement('button');
  document.body.append(host, anchor);
  vi.spyOn(anchor, 'getBoundingClientRect').mockReturnValue({
    bottom: 52,
    height: 32,
    left: 20,
    right: 52,
    top: 20,
    width: 32,
    x: 20,
    y: 20,
    toJSON: () => ({}),
  });
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  anchor.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function renderConfirm(
  overrides: {
    onCancel?: () => void;
    onConfirm?: () => Promise<void> | void;
  } = {}
) {
  const onCancel = overrides.onCancel ?? vi.fn();
  const onConfirm = overrides.onConfirm ?? vi.fn();
  act(() => {
    root.render(
      <EditorAnchoredConfirmPopover
        anchorEl={anchor}
        cancelText="Cancel"
        confirmText="Delete"
        dataUi="test.confirm"
        message="This cannot be undone."
        onCancel={onCancel}
        onConfirm={onConfirm}
        title="Delete item?"
      />
    );
  });
  return { onCancel, onConfirm };
}

it('renders a compact anchored destructive dialog and confirms once while pending', async () => {
  let resolve: () => void = () => undefined;
  const pending = new Promise<void>((done) => {
    resolve = done;
  });
  const onConfirm = vi.fn(() => pending);
  renderConfirm({ onConfirm });
  const dialog = document.querySelector<HTMLElement>('[data-ui="test.confirm"]');
  const confirm = document.querySelector<HTMLButtonElement>('[data-confirm-action="true"]');

  expect(dialog?.querySelector('[role="alertdialog"]')).not.toBeNull();
  expect(confirm).toBe(document.activeElement);
  await act(async () => {
    confirm?.click();
    confirm?.click();
    await Promise.resolve();
  });
  expect(onConfirm).toHaveBeenCalledOnce();
  expect(confirm?.disabled).toBe(true);
  await act(async () => resolve());
  expect(confirm?.disabled).toBe(false);
});

it('dismisses on Escape or an outside pointer without dismissing from its own anchor', () => {
  const onCancel = vi.fn();
  renderConfirm({ onCancel });

  act(() => anchor.dispatchEvent(new Event('pointerdown', { bubbles: true })));
  expect(onCancel).not.toHaveBeenCalled();
  act(() => document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })));
  expect(onCancel).toHaveBeenCalledOnce();
  act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
  expect(onCancel).toHaveBeenCalledTimes(2);
});

it('restores focus to its trigger when the dialog closes', () => {
  renderConfirm();
  expect(document.activeElement).not.toBe(anchor);

  act(() => root.render(null));

  expect(document.activeElement).toBe(anchor);
});

it('traps forward and reverse Tab navigation inside the anchored dialog', () => {
  const { onCancel } = renderConfirm();
  const dialog = document.querySelector<HTMLElement>('[role="alertdialog"]')!;
  const buttons = [...dialog.querySelectorAll<HTMLButtonElement>('button')];
  const cancel = buttons[0]!;
  const confirm = buttons[1]!;

  confirm.focus();
  act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' })));
  expect(document.activeElement).toBe(cancel);

  act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true })));
  expect(document.activeElement).toBe(confirm);

  act(() => dialog.dispatchEvent(new Event('pointerdown', { bubbles: true })));
  expect(onCancel).not.toHaveBeenCalled();
});

it('renders non-layout-breaking alert feedback below its anchor', () => {
  act(() => {
    root.render(
      <EditorAnchoredAlert anchorEl={anchor} dataUi="test.alert">
        Save failed
      </EditorAnchoredAlert>
    );
  });

  const alert = document.querySelector<HTMLElement>('[data-ui="test.alert"]');
  expect(alert?.textContent).toContain('Save failed');
  expect(alert?.parentElement?.style.position).toBe('fixed');
});
