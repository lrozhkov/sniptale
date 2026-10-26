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
  useSettingsStoreSpy,
} from './test-helpers';

function updateEditorSelections(
  container: HTMLDivElement,
  state: ReturnType<typeof createSectionState>
) {
  const navigate = (label: string) =>
    act(() => container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!.click());
  setSelectValue(container.querySelector<HTMLSelectElement>('select')!, 'copy');
  navigate('settings.quickActions.appearanceCapture');
  const selects = Array.from(container.querySelectorAll<HTMLSelectElement>('select'));
  setSelectValue(selects[0]!, 'selection');
  setSelectValue(selects[1]!, 'desktop-1440');
  setSelectValue(selects[2]!, '5');
  setSelectValue(selects[3]!, 'jpeg');
  setSelectValue(selects[4]!, '90');
  navigate('settings.quickActions.appearanceAction');

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
    container.querySelectorAll<HTMLButtonElement>('[data-testid="settings-switch"]')[3]?.click();
    container
      .querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
      .forEach((input) => input.click());
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
  expect(state.updateFormField).not.toHaveBeenCalledWith('status', false);
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

  it('offers per-row restore for customized factory actions without deletion', async () => {
    const baseState = createSectionState();
    const bundledAction = {
      ...baseState.actions[1]!,
      bundledId: 'default-selection-download' as const,
      customized: true,
      id: 'default-selection-download',
    };
    const state = createSectionState({
      actions: [bundledAction],
      confirmDelete: null,
      editForm: null,
      editingId: null,
    });
    useQuickActionsControllerSpy.mockReturnValue(state);
    await renderQuickActionsSection();
    const container = getQuickActionsContainer()!;

    act(() => {
      container
        .querySelector<HTMLButtonElement>('button[aria-label="settings.collection.actions.menu"]')
        ?.click();
    });
    const reset = container.querySelector<HTMLButtonElement>(
      'button[aria-label="settings.quickActions.resetAction"]'
    );
    expect(reset).not.toBeNull();
    expect(
      container.querySelector('button[aria-label="settings.collection.actions.delete"]')
    ).toBeNull();

    act(() => reset?.click());
    expect(state.handleReset).toHaveBeenCalledWith('default-selection-download');
  });
});

it('keeps placement controls disabled until load and serializes writes with failure and explicit retry', async () => {
  const state = createSectionState();
  useQuickActionsControllerSpy.mockReturnValue(state);
  const updateSettings = vi.fn();
  const store = { settings: { viewportPresets: [] }, hasLoaded: false, updateSettings };
  useSettingsStoreSpy.mockReturnValue(store);
  await renderQuickActionsSection();
  const container = getQuickActionsContainer();
  if (!container) throw new Error('Missing quick-actions section harness');
  const controls = () =>
    [...container.querySelectorAll<HTMLButtonElement>('[data-testid="settings-switch"]')].slice(
      0,
      3
    );
  expect(controls().every((control) => control.disabled)).toBe(true);
  store.hasLoaded = true;
  await renderQuickActionsSection();
  expect(controls().map((control) => control.dataset['checked'])).toEqual([
    'true',
    'false',
    'false',
  ]);
  let reject!: (error: Error) => void;
  updateSettings.mockImplementationOnce(
    () =>
      new Promise<void>((_, fail) => {
        reject = fail;
      })
  );
  await act(async () => controls()[1]!.click());
  expect(controls().every((control) => control.disabled)).toBe(true);
  controls()[2]!.click();
  expect(updateSettings).toHaveBeenCalledOnce();
  await act(async () => reject(new Error('write refused')));
  expect(container.querySelector('[role="alert"]')).not.toBeNull();
  expect(controls()[1]!.dataset['checked']).toBe('false');
  updateSettings.mockResolvedValue(undefined);
  await act(async () => controls()[1]!.click());
  expect(updateSettings).toHaveBeenLastCalledWith({ pageLaunch: { quickActionsCorner: true } });
  expect(container.querySelector('[role="alert"]')).toBeNull();
  await act(async () => controls()[2]!.click());
  expect(updateSettings).toHaveBeenLastCalledWith({ pageLaunch: { quickActionsToolbar: true } });
  await act(async () => controls()[0]!.click());
  expect(updateSettings).toHaveBeenLastCalledWith({ pageLaunch: { quickActionsPopup: false } });
});
