// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { AiSecretProtectionDialogMode } from '../controller/types';
import { SecretProtectionDialog } from './secret-protection-dialog';
import { createMockSecretProtectionState } from './test-support';

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

const TITLE_BY_MODE: Record<AiSecretProtectionDialogMode, string> = {
  change: 'settings.aiProviders.secretProtectionChangeTitle',
  disable: 'settings.aiProviders.secretProtectionDisableTitle',
  enable: 'settings.aiProviders.secretProtectionEnableTitle',
  reset: 'settings.aiProviders.secretProtectionResetTitle',
  unlock: 'settings.aiProviders.secretProtectionUnlockTitle',
};

function createState(
  mode: AiSecretProtectionDialogMode,
  overrides: { error?: string | null; isSubmitting?: boolean } = {}
) {
  return {
    ...createMockSecretProtectionState(),
    dialog: {
      error: overrides.error ?? null,
      isSubmitting: overrides.isSubmitting ?? false,
      mode,
    },
  };
}

function renderDialog(state: ReturnType<typeof createState>): void {
  container = document.createElement('div');
  root = createRoot(container);
  act(() => root?.render(<SecretProtectionDialog state={state} />));
}

function setInputValues(values: string[]): void {
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  const inputs = Array.from(container?.querySelectorAll('input') ?? []);
  act(() => {
    inputs.forEach((input, index) => {
      valueSetter?.call(input, values[index] ?? '');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  });
}

async function submitDialog(): Promise<void> {
  await act(async () => {
    container
      ?.querySelector('form')
      ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
}

function expectModeSubmission(
  mode: AiSecretProtectionDialogMode,
  state: ReturnType<typeof createState>
): void {
  if (mode === 'enable') {
    expect(state.handleEnableSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        confirmPassphrase: 'confirm',
        passphrase: 'passphrase',
      })
    );
  } else if (mode === 'unlock') {
    expect(state.handleUnlockSubmit).toHaveBeenCalledWith('passphrase');
  } else if (mode === 'disable') {
    expect(state.handleDisableSubmit).toHaveBeenCalledWith('passphrase');
  } else if (mode === 'change') {
    expect(state.handleChangeSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        confirmPassphrase: 'confirm',
        currentPassphrase: 'current',
        nextPassphrase: 'next',
      })
    );
  } else {
    expect(state.handleResetConfirm).toHaveBeenCalledOnce();
  }
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container = null;
  vi.unstubAllGlobals();
});

it.each([
  { mode: 'enable' as const, values: ['passphrase', 'confirm'] },
  { mode: 'unlock' as const, values: ['passphrase'] },
  { mode: 'disable' as const, values: ['passphrase'] },
  { mode: 'change' as const, values: ['current', 'next', 'confirm'] },
  { mode: 'reset' as const, values: [] },
])('renders and submits the $mode dialog', async ({ mode, values }) => {
  const state = createState(mode);
  renderDialog(state);

  expect(container?.textContent).toContain(TITLE_BY_MODE[mode]);
  setInputValues(values);
  await submitDialog();
  expectModeSubmission(mode, state);
});

it('returns no dialog without state and locks error dialog actions while submitting', () => {
  const hiddenState = createMockSecretProtectionState();
  container = document.createElement('div');
  root = createRoot(container);
  act(() => root?.render(<SecretProtectionDialog state={hiddenState} />));
  expect(container.innerHTML).toBe('');

  const state = createState('reset', { error: 'Reset failed', isSubmitting: true });
  act(() => root?.render(<SecretProtectionDialog state={state} />));

  expect(container.textContent).toContain('settings.aiProviders.secretProtectionResetDescription');
  expect(container.textContent).toContain('Reset failed');
  expect(Array.from(container.querySelectorAll('button')).every((button) => button.disabled)).toBe(
    true
  );
  act(() => container?.querySelector<HTMLElement>('.sniptale-modal-backdrop')?.click());
  expect(state.handleCloseDialog).not.toHaveBeenCalled();
});

it('routes cancel and backdrop close actions while the dialog is interactive', () => {
  const state = createState('unlock');
  renderDialog(state);

  const cancelButton = Array.from(container?.querySelectorAll('button') ?? []).find((button) =>
    button.textContent?.includes('common.actions.cancel')
  );
  act(() => {
    cancelButton?.click();
    container?.querySelector<HTMLElement>('.sniptale-modal-backdrop')?.click();
  });

  expect(state.handleCloseDialog).toHaveBeenCalledTimes(2);
});
