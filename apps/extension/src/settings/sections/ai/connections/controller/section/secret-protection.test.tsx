// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, expect, it, vi } from 'vitest';

const mutations = vi.hoisted(() => ({
  change: vi.fn(),
  disable: vi.fn(),
  enable: vi.fn(),
  lock: vi.fn(),
  reset: vi.fn(),
  unlock: vi.fn(),
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('../../../../../runtime/ai-settings/mutations', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../runtime/ai-settings/mutations')>()),
  changeAISecretPassphraseProtection: mutations.change,
  disableAISecretPassphraseProtection: mutations.disable,
  enableAISecretPassphraseProtection: mutations.enable,
  lockAISecretPassphraseProtection: mutations.lock,
  resetAISecretPassphraseProtection: mutations.reset,
  unlockAISecretPassphraseProtection: mutations.unlock,
}));
vi.mock('@sniptale/ui/product-feedback/toast-service', () => ({ toast }));
import { useAiProvidersSecretProtectionState } from './secret-protection';

type HookState = ReturnType<typeof useAiProvidersSecretProtectionState>;
let latest: HookState | undefined;
const reloadData = vi.fn(async () => undefined);

function Harness(props: { enabled?: boolean; unlocked?: boolean }) {
  latest = useAiProvidersSecretProtectionState({
    reloadData,
    status: {
      isEnabled: props.enabled ?? true,
      isUnlocked: props.unlocked ?? false,
      mode: props.enabled === false ? 'transparent' : 'passphrase',
    },
  });
  return null;
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const mutation of Object.values(mutations)) mutation.mockResolvedValue(undefined);
});

it('owns dialog validation, unlock cancellation, and successful lifecycle actions', async () => {
  const root = createRoot(document.createElement('div'));
  act(() => root.render(<Harness />));
  act(() => latest?.handleOpenEnableDialog());
  await act(async () => latest?.handleEnableSubmit({ passphrase: '', confirmPassphrase: '' }));
  expect(latest?.dialog?.error).toBeTruthy();
  act(() => latest?.handleOpenUnlockDialog());
  await act(async () => latest?.handleUnlockSubmit('secret'));
  expect(mutations.unlock).toHaveBeenCalledWith('secret');
  expect(reloadData).toHaveBeenCalled();

  await act(async () =>
    latest?.handleEnableSubmit({ passphrase: 'new', confirmPassphrase: 'new' })
  );
  await act(async () =>
    latest?.handleChangeSubmit({
      currentPassphrase: 'old',
      nextPassphrase: 'new',
      confirmPassphrase: 'new',
    })
  );
  await act(async () => latest?.handleDisableSubmit('secret'));
  await act(async () => latest?.handleResetConfirm());
  await act(async () => latest?.handleLockNow());
  expect(mutations.enable).toHaveBeenCalledWith('new');
  expect(mutations.change).toHaveBeenCalledOnce();
  expect(mutations.disable).toHaveBeenCalledWith('secret');
  expect(mutations.reset).toHaveBeenCalledOnce();
  expect(mutations.lock).toHaveBeenCalledOnce();
  expect(toast.success).not.toHaveBeenCalled();

  let cancelled: Error | undefined;
  act(() => {
    void latest?.ensureUnlocked().catch((error: Error) => {
      cancelled = error;
    });
  });
  act(() => latest?.handleCloseDialog());
  await act(async () => Promise.resolve());
  expect(cancelled?.message).toBeTruthy();
  act(() => root.unmount());
});

it('surfaces mutation failures and bypasses unlock when protection is inactive', async () => {
  mutations.lock.mockRejectedValueOnce(new Error('lock failed'));
  mutations.enable.mockRejectedValueOnce(new Error('enable failed'));
  const root = createRoot(document.createElement('div'));
  act(() => root.render(<Harness enabled={false} unlocked />));
  await expect(latest?.ensureUnlocked()).resolves.toBeUndefined();
  act(() => latest?.handleOpenEnableDialog());
  await act(async () =>
    latest?.handleEnableSubmit({ passphrase: 'new', confirmPassphrase: 'new' })
  );
  expect(latest?.dialog?.error).toContain('Sniptale');
  expect(latest?.dialog?.error).not.toContain('enable failed');
  await act(async () => latest?.handleLockNow());
  expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Sniptale'));
  expect(toast.error).not.toHaveBeenCalledWith(expect.stringContaining('lock failed'));
  act(() => root.unmount());
});
