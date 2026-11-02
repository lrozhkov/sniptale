// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { SecretProtectionClient } from '../runtime/secret-protection';
import {
  useSecretProtectionController,
  type SecretProtectionState,
  type SecretProtectionStatus,
} from './controller';

let root: Root | null = null;
let state: SecretProtectionState;
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function status(ai: boolean, webdav: boolean, unlocked = false): SecretProtectionStatus {
  return {
    isEnabled: ai || webdav,
    isUnlocked: unlocked || (!ai && !webdav),
    mode: ai || webdav ? 'passphrase' : 'transparent',
    participants: { ai, webdav },
  };
}
function client(initial = status(true, true)) {
  return {
    readStatus: vi.fn().mockResolvedValue(initial),
    enable: vi.fn().mockResolvedValue(undefined),
    disable: vi.fn().mockResolvedValue(undefined),
    unlock: vi.fn().mockResolvedValue(undefined),
    change: vi.fn().mockResolvedValue(undefined),
    lock: vi.fn().mockResolvedValue(undefined),
    reset: vi.fn().mockResolvedValue(undefined),
  };
}
async function mount(runtime: SecretProtectionClient) {
  function Probe() {
    state = useSecretProtectionController(runtime);
    return null;
  }
  root = createRoot(document.createElement('div'));
  await act(async () => root?.render(<Probe />));
}
beforeEach(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true));
afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  vi.unstubAllGlobals();
});

it('does not gate AI save on a WebDAV-only locked phrase', async () => {
  const runtime = client(status(false, true));
  await mount(runtime);
  await expect(state.ensureUnlocked('ai')).resolves.toBeUndefined();
  expect(state.dialog).toBeNull();
  expect(runtime.unlock).not.toHaveBeenCalled();
});
it('joins current unlock waiters and settles all on verified unlock', async () => {
  const runtime = client();
  await mount(runtime);
  let first!: Promise<void>;
  let second!: Promise<void>;
  act(() => {
    first = state.ensureUnlocked('ai');
    second = state.ensureUnlocked('webdav');
  });
  expect(state.dialog?.mode).toBe('unlock');
  runtime.readStatus.mockResolvedValue(status(true, true, true));
  await act(async () => state.handleUnlockSubmit('current phrase'));
  await expect(Promise.all([first, second])).resolves.toEqual([undefined, undefined]);
  expect(runtime.unlock).toHaveBeenCalledOnce();
  expect(state.dialog).toBeNull();
});
it.each(['close', 'replace', 'dispose'] as const)(
  'rejects every pending waiter on %s',
  async (action) => {
    await mount(client());
    let first!: Promise<string>;
    let second!: Promise<string>;
    act(() => {
      first = state.ensureUnlocked('ai').then(
        () => 'resolved',
        () => 'cancelled'
      );
      second = state.ensureUnlocked('webdav').then(
        () => 'resolved',
        () => 'cancelled'
      );
    });
    await act(async () => {
      if (action === 'close') state.handleCloseDialog();
      else if (action === 'replace') state.handleOpenResetDialog();
      else {
        root?.unmount();
        root = null;
      }
    });
    expect(await first).toBe('cancelled');
    expect(await second).toBe('cancelled');
  }
);
it('fails closed on loading, unavailable and legacy unknown participation, then retries', async () => {
  const response = deferred<SecretProtectionStatus>();
  const runtime = client();
  runtime.readStatus.mockReturnValueOnce(response.promise);
  await mount(runtime);
  expect(state.isLoading).toBe(true);
  await expect(state.ensureUnlocked('ai')).rejects.toThrow();
  await act(async () => response.reject(new Error('offline')));
  expect(state.error).not.toBeNull();
  runtime.readStatus.mockResolvedValue({ isEnabled: true, isUnlocked: true, mode: 'passphrase' });
  await act(async () => state.reloadStatus());
  await expect(state.ensureUnlocked('ai')).rejects.toThrow();
  runtime.readStatus.mockResolvedValue(status(false, true));
  await act(async () => state.reloadStatus());
  await expect(state.ensureUnlocked('ai')).resolves.toBeUndefined();
});
it.each([false, true])(
  'enrolls into existing profile without creating another phrase (unlocked=%s)',
  async (unlocked) => {
    const runtime = client(status(false, true, unlocked));
    await mount(runtime);
    act(() => state.handleOpenEnableDialog('ai'));
    expect(state.dialog?.createsProfile).toBe(false);
    expect(state.dialog?.requiresPassphrase).toBe(!unlocked);
    await act(async () =>
      state.handleEnableSubmit({ passphrase: unlocked ? '' : 'existing', confirmPassphrase: '' })
    );
    expect(runtime.enable).toHaveBeenCalledWith('ai', unlocked ? undefined : 'existing');
  }
);
it('validates first enrollment, change and locked opt-out; retries current failed submit', async () => {
  const runtime = client(status(false, false));
  await mount(runtime);
  act(() => state.handleOpenEnableDialog('webdav'));
  await act(async () => state.handleEnableSubmit({ passphrase: '', confirmPassphrase: '' }));
  expect(runtime.enable).not.toHaveBeenCalled();
  await act(async () => state.handleEnableSubmit({ passphrase: 'one', confirmPassphrase: 'two' }));
  expect(runtime.enable).not.toHaveBeenCalled();
  runtime.enable.mockRejectedValueOnce(new Error('refused'));
  await act(async () => state.handleEnableSubmit({ passphrase: 'one', confirmPassphrase: 'one' }));
  expect(state.dialog?.error).not.toBeNull();
  runtime.readStatus.mockResolvedValue(status(false, true));
  await act(async () => state.handleEnableSubmit({ passphrase: 'one', confirmPassphrase: 'one' }));
  expect(state.dialog).toBeNull();
  act(() => state.handleOpenDisableDialog('webdav'));
  await act(async () => state.handleDisableSubmit(''));
  expect(runtime.disable).not.toHaveBeenCalled();
  await act(async () => state.handleDisableSubmit('one'));
  expect(runtime.disable).toHaveBeenCalledWith('webdav', 'one');
  act(() => state.handleOpenChangeDialog());
  await act(async () =>
    state.handleChangeSubmit({
      currentPassphrase: '',
      nextPassphrase: 'next',
      confirmPassphrase: 'next',
    })
  );
  await act(async () =>
    state.handleChangeSubmit({
      currentPassphrase: 'one',
      nextPassphrase: 'next',
      confirmPassphrase: 'different',
    })
  );
  expect(runtime.change).not.toHaveBeenCalled();
  await act(async () =>
    state.handleChangeSubmit({
      currentPassphrase: 'one',
      nextPassphrase: 'next',
      confirmPassphrase: 'next',
    })
  );
  expect(runtime.change).toHaveBeenCalledWith({ currentPassphrase: 'one', nextPassphrase: 'next' });
});
it('does not acknowledge unlock when the refreshed native status remains locked', async () => {
  const runtime = client();
  await mount(runtime);
  let pending!: Promise<string>;
  act(() => {
    pending = state.ensureUnlocked('ai').then(
      () => 'resolved',
      () => 'cancelled'
    );
  });
  await act(async () => state.handleUnlockSubmit('phrase'));
  expect(state.dialog?.error).not.toBeNull();
  act(() => state.handleCloseDialog());
  expect(await pending).toBe('cancelled');
});
it('ignores late unlock completion after close and blocks overlapping native commands', async () => {
  const runtime = client();
  const ack = deferred<void>();
  runtime.unlock.mockReturnValue(ack.promise);
  await mount(runtime);
  let pending!: Promise<string>;
  act(() => {
    pending = state.ensureUnlocked('ai').then(
      () => 'resolved',
      () => 'cancelled'
    );
  });
  let operation!: Promise<void>;
  act(() => {
    operation = state.handleUnlockSubmit('phrase');
  });
  act(() => {
    state.handleCloseDialog();
    state.handleOpenResetDialog();
  });
  expect(state.dialog).toBeNull();
  expect(await pending).toBe('cancelled');
  runtime.readStatus.mockResolvedValue(status(true, true, true));
  await act(async () => {
    ack.resolve();
    await operation;
  });
  expect(state.dialog).toBeNull();
  expect(runtime.reset).not.toHaveBeenCalled();
  act(() => state.handleOpenResetDialog());
  await act(async () => state.handleResetConfirm());
  expect(runtime.reset).toHaveBeenCalledOnce();
});
it('ignores a stale status read after disposal and does not leak pending waiters', async () => {
  const runtime = client();
  await mount(runtime);
  const read = deferred<SecretProtectionStatus>();
  runtime.readStatus.mockReturnValue(read.promise);
  let refresh!: Promise<void>;
  act(() => {
    refresh = state.reloadStatus();
  });
  await act(async () => {
    root?.unmount();
    root = null;
    read.resolve(status(true, true, true));
    await refresh;
  });
  await expect(state.ensureUnlocked('ai')).rejects.toThrow();
});
it('locks the shared session and keeps unaffected participation on opt-out', async () => {
  const runtime = client(status(true, true, true));
  await mount(runtime);
  runtime.readStatus.mockResolvedValue(status(true, true));
  await act(async () => state.handleLockNow());
  expect(runtime.lock).toHaveBeenCalledOnce();
  act(() => state.handleOpenDisableDialog('ai'));
  runtime.readStatus.mockResolvedValue(status(false, true));
  await act(async () => state.handleDisableSubmit('phrase'));
  expect(runtime.disable).toHaveBeenCalledWith('ai', 'phrase');
  expect(state.status?.participants).toEqual({ ai: false, webdav: true });
});
it('does not borrow an unlocked status after a failed native status acknowledgement', async () => {
  const runtime = client(status(true, true, true));
  await mount(runtime);
  act(() => state.handleOpenChangeDialog());
  runtime.readStatus.mockRejectedValueOnce(new Error('status unavailable'));
  await act(async () =>
    state.handleChangeSubmit({
      currentPassphrase: 'old',
      nextPassphrase: 'new',
      confirmPassphrase: 'new',
    })
  );
  expect(state.status).toBeNull();
  await expect(state.ensureUnlocked('ai')).rejects.toThrow();
  expect(state.dialog?.error).not.toBeNull();
});
it('rejects pending waiters on explicit status replacement and ignores older read errors', async () => {
  const runtime = client();
  await mount(runtime);
  let pending!: Promise<string>;
  act(() => {
    pending = state.ensureUnlocked('ai').then(
      () => 'resolved',
      () => 'cancelled'
    );
  });
  const old = deferred<SecretProtectionStatus>();
  const latest = deferred<SecretProtectionStatus>();
  runtime.readStatus.mockReturnValueOnce(old.promise).mockReturnValueOnce(latest.promise);
  let first!: Promise<void>;
  let second!: Promise<void>;
  act(() => {
    first = state.reloadStatus();
    second = state.reloadStatus();
  });
  expect(await pending).toBe('cancelled');
  await act(async () => {
    latest.resolve(status(false, true));
    await second;
  });
  await act(async () => {
    old.reject(new Error('stale'));
    await first;
  });
  expect(state.status?.participants).toEqual({ ai: false, webdav: true });
  expect(state.error).toBeNull();
});
it('does not start native commands through disposed or replaced dialog callbacks', async () => {
  const runtime = client();
  await mount(runtime);
  act(() => state.handleOpenChangeDialog());
  const oldChange = state.handleChangeSubmit;
  act(() => state.handleOpenResetDialog());
  await act(async () =>
    oldChange({ currentPassphrase: '', nextPassphrase: '', confirmPassphrase: '' })
  );
  expect(state.dialog?.mode).toBe('reset');
  expect(state.dialog?.error).toBeNull();
  expect(runtime.change).not.toHaveBeenCalled();
  await act(async () => {
    root?.unmount();
    root = null;
  });
  await state.handleLockNow();
  await state.handleResetConfirm();
  state.handleOpenEnableDialog('ai');
  expect(runtime.lock).not.toHaveBeenCalled();
  expect(runtime.reset).not.toHaveBeenCalled();
});
it('refreshes a refused native action instead of trusting the cached unlocked session', async () => {
  const runtime = client(status(true, false, true));
  await mount(runtime);
  act(() => state.handleOpenDisableDialog('ai'));
  runtime.disable.mockRejectedValueOnce(new Error('native session locked'));
  runtime.readStatus.mockResolvedValue(status(true, false, false));
  await act(async () => state.handleDisableSubmit(''));
  expect(state.status?.isUnlocked).toBe(false);
  expect(state.dialog?.requiresPassphrase).toBe(true);
  expect(state.dialog?.error).not.toBeNull();
  let pending!: Promise<string>;
  act(() => {
    pending = state.ensureUnlocked('ai').then(
      () => 'bypassed',
      () => 'cancelled'
    );
  });
  expect(state.dialog?.mode).toBe('unlock');
  act(() => state.handleCloseDialog());
  expect(await pending).toBe('cancelled');
});
it.each(['enable', 'disable', 'change'] as const)(
  'retries only the current status acknowledgement after native %s has committed',
  async (mode) => {
    const runtime = client(mode === 'enable' ? status(false, false) : status(true, true, true));
    await mount(runtime);
    act(() => {
      if (mode === 'enable') state.handleOpenEnableDialog('ai');
      else if (mode === 'disable') state.handleOpenDisableDialog('ai');
      else state.handleOpenChangeDialog();
    });
    const submit = () =>
      mode === 'enable'
        ? state.handleEnableSubmit({ passphrase: 'phrase', confirmPassphrase: 'phrase' })
        : mode === 'disable'
          ? state.handleDisableSubmit('')
          : state.handleChangeSubmit({
              currentPassphrase: 'old',
              nextPassphrase: 'new',
              confirmPassphrase: 'new',
            });
    runtime.readStatus.mockRejectedValueOnce(new Error('ACK read unavailable'));
    await act(async () => submit());
    const id = state.dialog?.id;
    expect(state.dialog?.error).not.toBeNull();
    expect(state.status).toBeNull();
    await expect(state.ensureUnlocked('ai')).rejects.toThrow();
    const native =
      mode === 'enable' ? runtime.enable : mode === 'disable' ? runtime.disable : runtime.change;
    native.mockRejectedValueOnce(new Error('native operation must not be replayed'));
    runtime.readStatus.mockResolvedValue(
      mode === 'disable' ? status(false, true, true) : status(true, true, true)
    );
    expect(state.dialog?.id).toBe(id);
    await act(async () => submit());
    expect(native).toHaveBeenCalledOnce();
    expect(state.dialog).toBeNull();
    expect(state.status?.isUnlocked).toBe(true);
  }
);
it('keeps unknown status on failed native-failure refresh and restores the current dialog for retry', async () => {
  const runtime = client(status(true, false, true));
  await mount(runtime);
  act(() => state.handleOpenDisableDialog('ai'));
  runtime.disable.mockRejectedValueOnce(new Error('native session closed'));
  runtime.readStatus.mockRejectedValueOnce(new Error('read unavailable'));
  await act(async () => state.handleDisableSubmit(''));
  expect(state.status).toBeNull();
  expect(state.dialog?.requiresPassphrase).toBe(true);
  expect(state.dialog?.error).not.toBeNull();
  runtime.readStatus.mockResolvedValue(status(false, false));
  await act(async () => state.handleDisableSubmit('current phrase'));
  expect(runtime.disable).toHaveBeenLastCalledWith('ai', 'current phrase');
  expect(state.dialog).toBeNull();
});
