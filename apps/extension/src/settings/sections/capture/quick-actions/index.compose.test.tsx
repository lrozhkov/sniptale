// @vitest-environment jsdom

import type React from 'react';
import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';

function renderProductSelect(props: {
  disabled?: boolean;
  onChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
  value: string;
}) {
  return (
    <select
      data-testid="product-select"
      disabled={Boolean(props.disabled)}
      value={props.value}
      onChange={(event) => props.onChange(event.currentTarget.value)}
    >
      {props.options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

vi.mock('@sniptale/ui/product-form-controls', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-form-controls')>()),
  ProductInput: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
  ProductSelect: renderProductSelect,
}));

vi.mock('@sniptale/ui/product-modal/actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-modal/actions')>()),
  ProductActionButton: (props: {
    children: React.ReactNode;
    onClick: () => void | Promise<void>;
  }) => <button onClick={() => void props.onClick()}>{props.children}</button>,
}));

vi.mock('@sniptale/ui/product-modal', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-modal')>()),
  ProductModal: (props: { children: React.ReactNode; isOpen: boolean }) =>
    props.isOpen ? <div data-testid="product-modal">{props.children}</div> : null,
  ProductModalBody: (props: { children: React.ReactNode }) => <div>{props.children}</div>,
  ProductModalFooter: (props: { children: React.ReactNode }) => <div>{props.children}</div>,
  ProductModalHeader: (props: { onClose: () => void; title: string }) => (
    <div>
      <div>{props.title}</div>
      <button data-action="close-modal" onClick={props.onClose}>
        close
      </button>
    </div>
  ),
}));

vi.mock('@sniptale/ui/product-feedback/confirm-dialog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-feedback/confirm-dialog')>()),
  ProductConfirmDialog: (props: {
    cancelText: string;
    confirmText: string;
    isOpen: boolean;
    message: string;
    onCancel: () => void;
    onConfirm: () => void | Promise<void>;
    title: string;
  }) =>
    props.isOpen ? (
      <div data-testid="confirm-dialog">
        <div>{props.title}</div>
        <div>{props.message}</div>
        <button data-action="confirm" onClick={() => void props.onConfirm()}>
          {props.confirmText}
        </button>
        <button data-action="cancel" onClick={props.onCancel}>
          {props.cancelText}
        </button>
      </div>
    ) : null,
}));

import {
  createSectionState,
  getQuickActionsContainer,
  renderQuickActionsSection,
  setSelectValue,
  useQuickActionsControllerSpy,
} from './test-helpers';

function updateEditorSelections(
  container: HTMLDivElement,
  state: ReturnType<typeof createSectionState>
) {
  const selects = Array.from(container.querySelectorAll<HTMLSelectElement>('select'));

  setSelectValue(selects[0]!, 'selection');
  setSelectValue(selects[1]!, 'copy');
  setSelectValue(selects[2]!, 'desktop-1440');
  setSelectValue(selects[3]!, '5');
  setSelectValue(selects[4]!, 'jpeg');
  setSelectValue(selects[5]!, '90');

  expect(state.updateFormField).toHaveBeenCalledWith('screenshotMode', 'selection');
  expect(state.updateFormField).toHaveBeenCalledWith('afterCapture', 'copy');
  expect(state.updateFormField).toHaveBeenCalledWith('viewportPresetId', 'desktop-1440');
  expect(state.updateFormField).toHaveBeenCalledWith('delay', 5);
  expect(state.updateFormField).toHaveBeenCalledWith('imageFormat', 'jpeg');
  expect(state.updateFormField).toHaveBeenCalledWith('imageQuality', 90);
}

function triggerQuickActionsButtons(container: HTMLDivElement) {
  act(() => {
    container
      .querySelector<HTMLButtonElement>('button[aria-label="settings.collection.actions.edit"]')
      ?.click();
    [...container.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent === 'settings.collection.actions.delete')
      ?.click();
    container.querySelectorAll<HTMLButtonElement>('[data-testid="settings-switch"]')[0]?.click();
    container.querySelectorAll<HTMLButtonElement>('[data-testid="settings-switch"]')[1]?.click();
    container.querySelectorAll<HTMLButtonElement>('[data-testid="settings-switch"]')[2]?.click();
    container
      .querySelector<HTMLButtonElement>('button[title="settings.hotkeyInput.clearTitle"]')
      ?.click();
    container.querySelector<HTMLButtonElement>('button[data-action="close-modal"]')?.click();
    Array.from(container.querySelectorAll<HTMLButtonElement>('button')).forEach((button) => {
      if (
        button.textContent === 'settings.quickActions.addButton' ||
        button.textContent === 'common.actions.save' ||
        button.textContent === 'common.actions.cancel'
      ) {
        button.click();
      }
    });
  });
}

function triggerQuickActionsDragInteractions(container: HTMLDivElement) {
  const moveDown = [...container.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.textContent === 'settings.collection.actions.moveDown'
  );
  act(() => moveDown?.click());
}

async function triggerConfirmDialog(container: HTMLDivElement) {
  await act(async () => {
    container
      .querySelector<HTMLButtonElement>(
        '[data-testid="confirm-dialog"] button[data-action="confirm"]'
      )
      ?.click();
    await Promise.resolve();
  });

  act(() => {
    container
      .querySelector<HTMLButtonElement>(
        '[data-testid="confirm-dialog"] button[data-action="cancel"]'
      )
      ?.click();
  });
}

function expectComposeHandlers(state: ReturnType<typeof createSectionState>) {
  expect(state.handleEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 'user-action' }));
  expect(state.setConfirmDelete).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'user-action' })
  );
  expect(state.handleToggleStatus).toHaveBeenCalledWith('user-action');
  expect(state.updateFormField).toHaveBeenCalledWith('status', false);
  expect(state.updateFormField).toHaveBeenCalledWith('exitAfterCapture', true);
  expect(state.handleCancelEdit).toHaveBeenCalled();
  expect(state.handleAdd).toHaveBeenCalled();
  expect(state.handleSaveEdit).toHaveBeenCalled();
  expect(state.handleDelete).toHaveBeenCalledWith('user-action');
  expect(state.handleMoveBefore).toHaveBeenCalledWith('user-action', null);
}

describe('QuickActionsSection compose tree', () => {
  it('renders the real compose tree and wires interaction seams', async () => {
    const state = createSectionState();
    useQuickActionsControllerSpy.mockReturnValue(state);

    await renderQuickActionsSection();

    const container = getQuickActionsContainer()!;
    expect(container.querySelector('[role="status"]')).toBeNull();
    expect(container.textContent).toContain('settings.collection.builtInBadge');
    expect(container.textContent).toContain('settings.quickActions.editTitle');
    expect(container.textContent).toContain('settings.quickActions.deleteActionTitle');
    expect(
      Array.from(container.querySelectorAll<HTMLButtonElement>('button')).filter(
        (button) => button.textContent === 'common.actions.save'
      )
    ).toHaveLength(1);

    updateEditorSelections(container, state);
    triggerQuickActionsButtons(container);
    triggerQuickActionsDragInteractions(container);
    await triggerConfirmDialog(container);

    expectComposeHandlers(state);
  });
});
