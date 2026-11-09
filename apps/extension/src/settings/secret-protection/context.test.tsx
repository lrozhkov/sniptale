// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { translate } from '../../platform/i18n';
import type { SecretProtectionState, SecretProtectionStatus } from './controller';
import {
  SettingsSecretProtectionProvider,
  SettingsSecretProtectionParticipantSummary,
  useSettingsSecretProtection,
} from './context';
const mocks = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock('../runtime/messaging', () => ({
  settingsRuntimeMessagingTransport: { sendRuntimeMessage: mocks.send },
}));
let state: SecretProtectionState;
let root: Root | null = null;
let container: HTMLDivElement;
function Probe() {
  state = useSettingsSecretProtection();
  return (
    <>
      <SettingsSecretProtectionParticipantSummary participant="ai" />
      <SettingsSecretProtectionParticipantSummary participant="webdav" />
    </>
  );
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  mocks.send.mockReset();
  mocks.send.mockResolvedValue({
    success: true,
    secretProtectionStatus: {
      isEnabled: true,
      isUnlocked: false,
      mode: 'passphrase',
      participants: { ai: true, webdav: true },
    },
  });
});
afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  container.remove();
  vi.unstubAllGlobals();
});
async function render(open = vi.fn()) {
  root = createRoot(container);
  await act(async () =>
    root?.render(
      <SettingsSecretProtectionProvider onOpenConfiguration={open}>
        <Probe />
      </SettingsSecretProtectionProvider>
    )
  );
  return open;
}
it('composes one shared controller and dialog for AI and WebDAV, using injected Settings transport', async () => {
  const open = await render();
  expect(mocks.send).toHaveBeenCalledWith(
    expect.objectContaining({ operation: 'read-secret-protection-status' })
  );
  let first!: Promise<string>;
  let second!: Promise<string>;
  act(() => {
    first = state.ensureUnlocked('ai').then(
      () => 'ok',
      () => 'cancelled'
    );
    second = state.ensureUnlocked('webdav').then(
      () => 'ok',
      () => 'cancelled'
    );
  });
  expect(container.querySelectorAll('[role="dialog"]')).toHaveLength(1);
  act(() => state.handleCloseDialog());
  expect(await first).toBe('cancelled');
  expect(await second).toBe('cancelled');
  const button = Array.from(container.querySelectorAll('button')).find(
    (b) => b.textContent === translate('settings.secretProtection.openSettingsAction')
  );
  act(() => button?.click());
  expect(open).toHaveBeenCalledOnce();
});
it('asks truthful global reset consent and focuses Cancel before any destructive command', async () => {
  await render();
  act(() => state.handleOpenResetDialog());
  expect(container.textContent).toContain(translate('settings.secretProtection.resetDescription'));
  const cancel = Array.from(container.querySelectorAll('button')).find(
    (b) => b.textContent === translate('common.actions.cancel')
  );
  expect(document.activeElement).toBe(cancel);
  act(() => cancel?.click());
  expect(container.querySelector('[role="dialog"]')).toBeNull();
  expect(mocks.send).not.toHaveBeenCalledWith(
    expect.objectContaining({ operation: 'reset-secret-passphrase-protection' })
  );
});
it('retains failed current phrase for retry but clears it when a same-mode successor opens', async () => {
  await render();
  act(() => state.handleOpenUnlockDialog());
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  const input = container.querySelector('input');
  act(() => {
    setter?.call(input, 'retry phrase');
    input?.dispatchEvent(new Event('input', { bubbles: true }));
  });
  mocks.send.mockResolvedValueOnce({ success: false, error: 'refused' });
  await act(async () =>
    container
      .querySelector('form')
      ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  );
  expect(container.querySelector('input')?.value).toBe('retry phrase');
  act(() => {
    state.handleCloseDialog();
    state.handleOpenUnlockDialog();
  });
  expect(container.querySelector('input')?.value).toBe('');
});
it('does not enable either switch while protection status is unknown', async () => {
  mocks.send.mockResolvedValue({
    success: true,
    secretProtectionStatus: {
      isEnabled: true,
      isUnlocked: true,
      mode: 'passphrase',
    } satisfies SecretProtectionStatus,
  });
  await render();
  expect(
    Array.from(container.querySelectorAll<HTMLButtonElement>('[role="switch"]')).every(
      (b) => b.disabled
    )
  ).toBe(true);
});
it('retires pending form continuations synchronously when the Settings route commits', async () => {
  root = createRoot(container);
  await act(async () =>
    root?.render(
      <SettingsSecretProtectionProvider
        route={{ section: 'ai-connections', view: 'integrations' }}
        onOpenConfiguration={vi.fn()}
      >
        <Probe />
      </SettingsSecretProtectionProvider>
    )
  );
  let resolveNative!: (response: { success: boolean }) => void;
  const native = new Promise<{ success: boolean }>((resolve) => {
    resolveNative = resolve;
  });
  mocks.send.mockImplementation((message: { operation: string }) =>
    message.operation === 'unlock-secret-passphrase-protection'
      ? native
      : Promise.resolve({
          success: true,
          secretProtectionStatus: {
            isEnabled: true,
            isUnlocked: true,
            mode: 'passphrase',
            participants: { ai: true, webdav: true },
          },
        })
  );
  let pending!: Promise<string>;
  act(() => {
    pending = state.ensureUnlocked('ai').then(
      () => 'resumed abandoned form',
      () => 'cancelled'
    );
  });
  let operation!: Promise<void>;
  act(() => {
    operation = state.handleUnlockSubmit('phrase');
  });
  await act(async () =>
    root?.render(
      <SettingsSecretProtectionProvider
        route={{ section: 'access-data', view: 'secret-protection' }}
        onOpenConfiguration={vi.fn()}
      >
        <Probe />
      </SettingsSecretProtectionProvider>
    )
  );
  expect(await pending).toBe('cancelled');
  expect(state.status).toBeNull();
  expect(state.isLoading).toBe(true);
  expect(mocks.send).toHaveBeenCalledTimes(2);
  expect(container.querySelector('[role="dialog"]')).toBeNull();
  await act(async () => {
    resolveNative({ success: true });
    await operation;
  });
  expect(state.dialog).toBeNull();
  expect(state.status?.isUnlocked).toBe(true);
  expect(mocks.send).toHaveBeenCalledTimes(3);
});
it('refreshes native membership and lock state on route re-entry without a duplicate initial read', async () => {
  mocks.send.mockResolvedValue({
    success: true,
    secretProtectionStatus: {
      isEnabled: true,
      isUnlocked: true,
      mode: 'passphrase',
      participants: { ai: true, webdav: false },
    },
  });
  root = createRoot(container);
  const renderRoute = (
    route:
      | { section: 'ai-connections'; view: 'integrations' }
      | { section: 'access-data'; view: 'secret-protection' }
  ) => (
    <SettingsSecretProtectionProvider route={route} onOpenConfiguration={vi.fn()}>
      <Probe />
    </SettingsSecretProtectionProvider>
  );
  await act(async () =>
    root?.render(renderRoute({ section: 'ai-connections', view: 'integrations' }))
  );
  expect(mocks.send).toHaveBeenCalledTimes(1);
  let resolveFresh!: (response: unknown) => void;
  const fresh = new Promise((resolve) => {
    resolveFresh = resolve;
  });
  mocks.send.mockReturnValueOnce(fresh);
  await act(async () =>
    root?.render(renderRoute({ section: 'access-data', view: 'secret-protection' }))
  );
  expect(mocks.send).toHaveBeenCalledTimes(2);
  expect(state.status).toBeNull();
  expect(state.isLoading).toBe(true);
  await expect(state.ensureUnlocked('ai')).rejects.toThrow();
  await act(async () =>
    resolveFresh({
      success: true,
      secretProtectionStatus: {
        isEnabled: true,
        isUnlocked: false,
        mode: 'passphrase',
        participants: { ai: false, webdav: true },
      },
    })
  );
  expect(state.status?.isUnlocked).toBe(false);
  expect(state.status?.participants).toEqual({ ai: false, webdav: true });
  await expect(state.ensureUnlocked('ai')).resolves.toBeUndefined();
});
