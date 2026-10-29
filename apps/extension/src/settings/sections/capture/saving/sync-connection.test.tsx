// @vitest-environment jsdom
import { act, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const local = vi.hoisted(() => ({ plan: vi.fn(), switch: vi.fn() }));
vi.mock('../../../../workflows/sync-transfer/retained-library', () => ({
  RetainedLibraryNotReadyError: class extends Error {
    constructor(readonly code: string) {
      super(code);
    }
  },
  planRetainedLibrary: local.plan,
}));
vi.mock('../../../../workflows/sync-transfer/local-only', () => ({
  switchLibraryToLocalOnly: local.switch,
  LocalOnlySwitchError: class extends Error {
    constructor(readonly code: string) {
      super(code);
    }
  },
}));
vi.mock('../../../../platform/i18n/format-bytes', () => ({
  formatBytes: (bytes: number) => `${bytes} B`,
}));
const client = vi.hoisted(() => ({
  readStatus: vi.fn(),
  createWorkspace: vi.fn(),
  joinWorkspace: vi.fn(),
  retryWorkspace: vi.fn(),
  enrollWorkspace: vi.fn(),
  abandonWorkspace: vi.fn(),
  refreshCatalog: vi.fn(),
  waitForOperation: vi.fn(),
  subscribeToWorkspaceSettled: vi.fn(),
}));
const workspaceListeners = vi.hoisted(() => new Set<() => void>());
const permissions = vi.hoisted(() => ({ request: vi.fn(), contains: vi.fn() }));
vi.mock('@sniptale/platform/browser/permissions', () => ({ browserPermissions: permissions }));
vi.mock('../../../../platform/runtime-messaging/sync-product-client', () => ({
  createSyncProductClient: () => client,
}));
vi.mock('../../../../platform/i18n', () => ({
  translate: (key: string) => key,
  useAppLocale: () => 'en',
}));
import { SyncConnectionSection } from './sync-connection';

let container: HTMLDivElement;
let root: Root;
const source = { kind: 'join', identity: { incarnation: 'selected', revision: 1 } };
beforeEach(async () => {
  vi.useFakeTimers();
  vi.stubGlobal('__SNIPTALE_SECURITY_E2E__', true);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.resetAllMocks();
  local.plan.mockResolvedValue({
    binding: {},
    authorization: { incarnation: 'old', revision: 1 },
    missing: [],
    nativeRootCount: 2,
    remoteBytesUpperBound: 0,
  });
  local.switch.mockResolvedValue(undefined);
  workspaceListeners.clear();
  client.subscribeToWorkspaceSettled.mockImplementation((listener: () => void) => {
    workspaceListeners.add(listener);
    return () => workspaceListeners.delete(listener);
  });
  permissions.request.mockResolvedValue(true);
  client.readStatus.mockResolvedValue({
    kind: 'status',
    status: { connection: null, workspace: null, products: [], workspaceJob: null },
  });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<SyncConnectionSection />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
function input(name: string) {
  const label = [...container.querySelectorAll('label')].find((node) =>
    node.textContent?.endsWith(`.${name}`)
  );
  const target = label?.htmlFor
    ? container.querySelector<HTMLInputElement>(`[id="${label.htmlFor}"]`)
    : null;
  if (!target) throw new Error(`Missing input ${name}`);
  return target;
}
async function change(name: string, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(
      input(name),
      value
    );
    input(name).dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function submit() {
  await act(async () =>
    container
      .querySelector('form')
      ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  );
}
async function notifyWorkspaceSettled() {
  await act(async () => {
    for (const listener of workspaceListeners) listener();
  });
}
async function fill() {
  await change('rootUrl', 'https://dav.example/workspace/');
  await change('account', 'account-1');
  await change('username', 'user');
  await change('password', 'secret');
}
it('retains a failed JOIN draft, enrolls the verified workspace and refreshes catalog', async () => {
  await fill();
  client.joinWorkspace.mockRejectedValueOnce(new Error('refused'));
  await submit();
  expect(container.querySelector('[role="alert"]')?.textContent).toBe(
    'settings.syncConnection.failed'
  );
  expect(input('password').value).toBe('secret');
  client.joinWorkspace.mockResolvedValueOnce({ kind: 'accepted', requestId: 'join' });
  client.readStatus.mockResolvedValueOnce({
    kind: 'status',
    status: {
      connection: null,
      workspace: {
        source,
        phase: 'ready',
        rootUrl: 'https://dav.example/workspace/',
        accountId: 'account-1',
      },
      workspaceJob: { state: 'ready' },
    },
  });
  await submit();
  expect(client.joinWorkspace).toHaveBeenLastCalledWith({
    rootUrl: 'https://dav.example/workspace/',
    accountId: 'account-1',
    authentication: { kind: 'basic', username: 'user', password: 'secret' },
  });
  expect(client.enrollWorkspace).not.toHaveBeenCalled();
  expect(container.textContent).toContain('settings.syncConnection.enroll');
  client.enrollWorkspace.mockResolvedValueOnce({ kind: 'enrolled' });
  client.refreshCatalog.mockResolvedValueOnce({ kind: 'accepted', requestId: 'catalog' });
  client.waitForOperation.mockResolvedValue({
    kind: 'operation',
    job: { state: 'ready' },
    completion: { kind: 'catalog', count: 2 },
  });
  client.readStatus.mockResolvedValue({
    kind: 'status',
    status: {
      connection: {
        phase: 'active',
        rootUrl: 'https://dav.example/workspace/',
        accountId: 'account-1',
      },
      workspace: null,
      products: [],
      workspaceJob: null,
    },
  });
  await submit();
  expect(client.enrollWorkspace).toHaveBeenCalledWith({
    source,
    authentication: { kind: 'basic', username: 'user', password: 'secret' },
  });
  expect(client.refreshCatalog).toHaveBeenCalled();
  expect(container.querySelector('input[type="password"]')).toBeNull();
  expect(container.textContent).toContain('settings.syncConnection.refreshed');
});

it('selects CREATE independently and prevents duplicate connection submission while pending', async () => {
  const create = [...container.querySelectorAll('button')].find(
    (node) => node.textContent === 'settings.syncConnection.create'
  );
  await act(async () => create?.click());
  await change('parentUrl', 'https://dav.example/parent/');
  await change('account', 'account-1');
  await change('username', 'user');
  await change('password', 'secret');
  let finish: ((result: { kind: 'accepted'; requestId: string }) => void) | undefined;
  client.createWorkspace.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  await submit();
  await submit();
  expect(client.createWorkspace).toHaveBeenCalledTimes(1);
  expect(client.createWorkspace).toHaveBeenCalledWith({
    parentUrl: 'https://dav.example/parent/',
    accountId: 'account-1',
    authentication: { kind: 'basic', username: 'user', password: 'secret' },
  });
  expect(permissions.request).toHaveBeenCalledWith({ origins: ['https://dav.example/*'] });
  await act(async () => finish?.({ kind: 'accepted', requestId: 'allocation' }));
});

it('requests only the checked selected origin before JOIN and waits for the grant before mutation IPC', async () => {
  await fill();
  await change('rootUrl', 'https://dav.example:8443/workspace/');
  let grant: ((value: boolean) => void) | undefined;
  permissions.request.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        grant = resolve;
      })
  );
  client.joinWorkspace.mockResolvedValueOnce({ kind: 'accepted', requestId: 'join' });
  act(() => {
    container
      .querySelector('form')
      ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    expect(permissions.request).toHaveBeenCalledWith({ origins: ['https://dav.example:8443/*'] });
    expect(client.joinWorkspace).not.toHaveBeenCalled();
  });
  expect(permissions.request).toHaveBeenCalledWith({ origins: ['https://dav.example:8443/*'] });
  expect(permissions.contains).not.toHaveBeenCalled();
  expect(client.joinWorkspace).not.toHaveBeenCalled();
  await act(async () => grant?.(true));
  expect(client.joinWorkspace).toHaveBeenCalledWith(
    expect.objectContaining({ rootUrl: 'https://dav.example:8443/workspace/' })
  );
});

it('retains a denied connection draft and sends no CREATE, JOIN or enrollment command', async () => {
  await fill();
  permissions.request.mockResolvedValueOnce(false);
  await submit();
  expect(container.querySelector('[role="alert"]')?.textContent).toBe(
    'settings.syncConnection.permissionDenied'
  );
  expect(input('rootUrl').value).toBe('https://dav.example/workspace/');
  expect(input('username').value).toBe('user');
  expect(input('password').value).toBe('secret');
  expect(client.createWorkspace).not.toHaveBeenCalled();
  expect(client.joinWorkspace).not.toHaveBeenCalled();
  expect(client.enrollWorkspace).not.toHaveBeenCalled();
  expect(client.retryWorkspace).not.toHaveBeenCalled();
});

it.each([
  'http://dav.example/workspace/',
  'https://user:secret@dav.example/workspace/',
  'https://dav.example/workspace/?query=value',
  'https://dav.example/workspace/#fragment',
  'https://dav.example/workspace/?',
  'https://dav.example/workspace/#',
  'https://dav.example/workspace',
  'not-a-url',
])(
  'refuses invalid selected URL %s before requesting permission or starting a connection',
  async (value) => {
    await fill();
    await change('rootUrl', value);
    await submit();
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      'settings.syncConnection.invalidUrl'
    );
    expect(permissions.request).not.toHaveBeenCalled();
    expect(client.createWorkspace).not.toHaveBeenCalled();
    expect(client.joinWorkspace).not.toHaveBeenCalled();
    expect(input('rootUrl').value).toBe(value);
  }
);

it('continues through the same permission request when the selected origin is already granted', async () => {
  await fill();
  permissions.request.mockResolvedValueOnce(true);
  client.joinWorkspace.mockResolvedValueOnce({ kind: 'accepted', requestId: 'existing-grant' });
  await submit();
  expect(permissions.request).toHaveBeenCalledWith({ origins: ['https://dav.example/*'] });
  expect(client.joinWorkspace).toHaveBeenCalledTimes(1);
});

it.each([
  ['failed', 'temporary', 'workspaceTemporary'],
  ['failed', 'authentication', 'failed'],
  ['interrupted', 'interrupted', 'workspaceInterrupted'],
])(
  'shows fixed recovery feedback for workspace state %s and failure %s',
  async (state, failureCode, messageKey) => {
    client.readStatus.mockResolvedValue({
      kind: 'status',
      status: {
        connection: null,
        workspace: {
          source,
          phase: 'checking',
          rootUrl: 'https://selected.example/workspace/',
          accountId: 'account-1',
        },
        workspaceJob: { state, failureCode },
      },
    });
    await notifyWorkspaceSettled();
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      `settings.syncConnection.${messageKey}`
    );
    expect(container.textContent).toContain('settings.syncConnection.retry');
    expect(client.retryWorkspace).not.toHaveBeenCalled();
  }
);

it.each(['ready', 'checking'])(
  'uses the selected native workspace origin for phase %s and preserves its intent after denial',
  async (phase) => {
    client.readStatus.mockResolvedValue({
      kind: 'status',
      status: {
        connection: null,
        workspace: {
          source,
          phase,
          rootUrl: 'https://selected.example/workspace/',
          accountId: 'account-1',
        },
        workspaceJob: {
          state: phase === 'ready' ? 'ready' : 'failed',
          failureCode: phase === 'ready' ? null : 'temporary',
        },
      },
    });
    await notifyWorkspaceSettled();
    await change('username', 'user');
    await change('password', 'secret');
    permissions.request.mockResolvedValueOnce(false);
    if (phase === 'ready') await submit();
    else {
      const retry = [...container.querySelectorAll('button')].find(
        (node) => node.textContent === 'settings.syncConnection.retry'
      );
      await act(async () => retry?.click());
    }
    expect(permissions.request).toHaveBeenCalledWith({ origins: ['https://selected.example/*'] });
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      'settings.syncConnection.permissionDenied'
    );
    expect(container.textContent).toContain('https://selected.example/workspace/');
    expect(input('password').value).toBe('secret');
    expect(client.createWorkspace).not.toHaveBeenCalled();
    expect(client.joinWorkspace).not.toHaveBeenCalled();
    expect(client.enrollWorkspace).not.toHaveBeenCalled();
    expect(client.retryWorkspace).not.toHaveBeenCalled();
  }
);

const allocationSource = {
  kind: 'allocation',
  identity: { incarnation: 'selected-allocation', revision: 4 },
};
const emptyStatus = {
  kind: 'status',
  status: { connection: null, workspace: null, products: [], workspaceJob: null },
};
function connectionButton(name: string) {
  const button = [...container.querySelectorAll('button')].find(
    (node) => node.textContent === `settings.syncConnection.${name}`
  );
  if (!button) throw new Error(`Missing connection action ${name}`);
  return button;
}
async function restoredSetup(
  phase: 'allocating' | 'checking' | 'ready',
  jobState: 'running' | 'failed' | 'interrupted' | null = null
) {
  const selected = {
    kind: 'status',
    status: {
      connection: null,
      workspace: {
        source: phase === 'checking' ? source : allocationSource,
        phase,
        rootUrl: 'https://selected.example/unknown-folder/',
        accountId: 'native-account',
      },
      workspaceJob: jobState
        ? { state: jobState, failureCode: jobState === 'running' ? null : 'temporary' }
        : null,
    },
  };
  client.readStatus.mockResolvedValue(selected);
  await act(async () => root.render(<SyncConnectionSection key="restored-setup" />));
  return selected;
}

it('refuses uncertain setup retry and permits explicit local cancellation', async () => {
  await restoredSetup('allocating');
  await change('username', 'user');
  await change('password', 'secret');
  expect(connectionButton('retry').disabled).toBe(true);
  expect(connectionButton('abandon').disabled).toBe(false);
  await submit();
  expect(client.createWorkspace).not.toHaveBeenCalled();
  expect(client.joinWorkspace).not.toHaveBeenCalled();
  expect(client.retryWorkspace).not.toHaveBeenCalled();
  let finish: ((value: { kind: 'cancelled'; outcome: 'cancelled' }) => void) | undefined;
  client.abandonWorkspace.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  await act(async () => connectionButton('abandon').click());
  expect(connectionButton('abandon').disabled).toBe(true);
  await act(async () => connectionButton('abandon').click());
  expect(client.abandonWorkspace).toHaveBeenCalledExactlyOnceWith(allocationSource);
  expect(client.retryWorkspace).not.toHaveBeenCalled();
  expect(permissions.request).not.toHaveBeenCalled();
  client.readStatus.mockResolvedValue(emptyStatus);
  await act(async () => finish?.({ kind: 'cancelled', outcome: 'cancelled' }));
  expect(container.querySelector('[role="alert"]')).toBeNull();
  expect(input('rootUrl').disabled).toBe(false);
  expect(input('account').disabled).toBe(false);
});

it('cancels running setup without credentials or origin permission and permits a new selected connection', async () => {
  await restoredSetup('checking', 'running');
  expect(input('password').value).toBe('');
  expect(connectionButton('abandon').disabled).toBe(false);
  client.abandonWorkspace.mockResolvedValueOnce({ kind: 'cancelled', outcome: 'cancelled' });
  client.readStatus.mockResolvedValue({
    ...emptyStatus,
    status: {
      ...emptyStatus.status,
      workspaceJob: { state: 'interrupted', failureCode: 'interrupted' },
    },
  });
  await act(async () => connectionButton('abandon').click());
  expect(client.abandonWorkspace).toHaveBeenCalledExactlyOnceWith(source);
  expect(permissions.request).not.toHaveBeenCalled();
  expect(client.enrollWorkspace).not.toHaveBeenCalled();
  expect(client.retryWorkspace).not.toHaveBeenCalled();
  expect(container.querySelector('[role="alert"]')).toBeNull();
  expect(connectionButton('create').disabled).toBe(false);
  expect(connectionButton('join').disabled).toBe(false);
  await act(async () => connectionButton('create').click());
  await change('parentUrl', 'https://new.example/parent/');
  await change('account', 'new-account');
  await change('username', 'new-user');
  await change('password', 'new-password');
  client.createWorkspace.mockResolvedValueOnce({ kind: 'accepted', requestId: 'new-allocation' });
  await submit();
  expect(client.createWorkspace).toHaveBeenCalledExactlyOnceWith({
    parentUrl: 'https://new.example/parent/',
    accountId: 'new-account',
    authentication: { kind: 'basic', username: 'new-user', password: 'new-password' },
  });
  expect(permissions.request).toHaveBeenCalledExactlyOnceWith({
    origins: ['https://new.example/*'],
  });
});

it.each(['refused', 'failed'])(
  'retains the native setup and fixed feedback after %s abandonment',
  async (outcome) => {
    await restoredSetup('checking', 'failed');
    if (outcome === 'refused')
      client.abandonWorkspace.mockResolvedValueOnce({ kind: 'cancelled', outcome: 'refused' });
    else client.abandonWorkspace.mockRejectedValueOnce(new Error('private-provider-details'));
    await act(async () => connectionButton('abandon').click());
    expect(client.abandonWorkspace).toHaveBeenCalledExactlyOnceWith(source);
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      'settings.syncConnection.abandonFailed'
    );
    expect(container.textContent).not.toContain('private-provider-details');
    expect(container.textContent).toContain('https://selected.example/unknown-folder/');
    expect(input('rootUrl').disabled).toBe(true);
    expect(input('account').disabled).toBe(true);
    expect(connectionButton('create').disabled).toBe(true);
    expect(connectionButton('abandon').disabled).toBe(false);
    expect(permissions.request).not.toHaveBeenCalled();
    expect(client.createWorkspace).not.toHaveBeenCalled();
    expect(client.joinWorkspace).not.toHaveBeenCalled();
  }
);

it('does not restore cancelled setup from a focus status read issued before abandonment', async () => {
  const previous = await restoredSetup('allocating');
  let finishPoll: ((value: typeof previous) => void) | undefined;
  client.readStatus.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishPoll = resolve;
      })
  );
  await act(async () => {
    window.dispatchEvent(new Event('focus'));
  });
  client.abandonWorkspace.mockResolvedValueOnce({ kind: 'cancelled', outcome: 'cancelled' });
  client.readStatus.mockResolvedValue(emptyStatus);
  await act(async () => connectionButton('abandon').click());
  expect(input('rootUrl').disabled).toBe(false);
  await act(async () => finishPoll?.(previous));
  expect(input('rootUrl').disabled).toBe(false);
  expect(input('account').disabled).toBe(false);
  expect(container.textContent).not.toContain('https://selected.example/unknown-folder/');
  expect(container.textContent).not.toContain('settings.syncConnection.abandon');
});

it('refreshes idle Settings on workspace, focus and visibility events without polling', async () => {
  const initialReads = client.readStatus.mock.calls.length;
  await act(async () => vi.advanceTimersByTimeAsync(180_000));
  expect(client.readStatus).toHaveBeenCalledTimes(initialReads);
  await notifyWorkspaceSettled();
  expect(client.readStatus).toHaveBeenCalledTimes(initialReads + 1);
  await act(async () => {
    window.dispatchEvent(new Event('focus'));
  });
  expect(client.readStatus).toHaveBeenCalledTimes(initialReads + 2);
  const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  await act(async () => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
  expect(client.readStatus).toHaveBeenCalledTimes(initialReads + 3);
  visibility.mockRestore();
  await act(async () => root.render(<div />));
  expect(workspaceListeners.size).toBe(0);
  await act(async () => {
    window.dispatchEvent(new Event('focus'));
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(180_000);
  });
  expect(client.readStatus).toHaveBeenCalledTimes(initialReads + 3);
});

it('uses a 30-second fallback during setup and stops on terminal notification', async () => {
  await fill();
  client.joinWorkspace.mockResolvedValueOnce({ kind: 'accepted', requestId: 'running-workspace' });
  client.readStatus.mockResolvedValue({
    kind: 'status',
    status: {
      connection: null,
      workspace: {
        source,
        phase: 'checking',
        rootUrl: 'https://dav.example/workspace/',
        accountId: 'account-1',
      },
      workspaceJob: { state: 'running', failureCode: null },
    },
  });
  await submit();
  const runningReads = client.readStatus.mock.calls.length;
  await act(async () => vi.advanceTimersByTimeAsync(29_999));
  expect(client.readStatus).toHaveBeenCalledTimes(runningReads);
  await act(async () => vi.advanceTimersByTimeAsync(1));
  expect(client.readStatus).toHaveBeenCalledTimes(runningReads + 1);
  client.readStatus.mockResolvedValue({
    kind: 'status',
    status: {
      connection: null,
      workspace: {
        source,
        phase: 'ready',
        rootUrl: 'https://dav.example/workspace/',
        accountId: 'account-1',
      },
      workspaceJob: { state: 'ready', failureCode: null },
    },
  });
  await notifyWorkspaceSettled();
  expect(container.textContent).toContain('settings.syncConnection.enroll');
  const terminalReads = client.readStatus.mock.calls.length;
  await act(async () => vi.advanceTimersByTimeAsync(180_000));
  expect(client.readStatus).toHaveBeenCalledTimes(terminalReads);
});

it('observes catalog once and aborts on unmount without polling or late updates', async () => {
  client.readStatus.mockResolvedValue({
    kind: 'status',
    status: {
      connection: {
        phase: 'active',
        rootUrl: 'https://dav.example/workspace/',
        accountId: 'account-1',
      },
      workspace: null,
      products: [],
      workspaceJob: null,
    },
  });
  await notifyWorkspaceSettled();
  client.refreshCatalog.mockResolvedValueOnce({ kind: 'accepted', requestId: 'slow-catalog' });
  let finish:
    | ((value: {
        kind: 'operation';
        job: { state: 'ready' };
        completion: { kind: 'catalog'; count: number };
      }) => void)
    | undefined;
  client.waitForOperation.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  await act(async () => connectionButton('refresh').click());
  expect(client.waitForOperation).toHaveBeenCalledTimes(1);
  const signal = client.waitForOperation.mock.calls[0]?.[1];
  expect(signal?.aborted).toBe(false);
  const reads = client.readStatus.mock.calls.length;
  await act(async () => vi.advanceTimersByTimeAsync(180_000));
  expect(client.waitForOperation).toHaveBeenCalledTimes(1);
  expect(client.readStatus).toHaveBeenCalledTimes(reads);
  await act(async () => root.render(<div />));
  expect(signal?.aborted).toBe(true);
  await act(async () =>
    finish?.({
      kind: 'operation',
      job: { state: 'ready' },
      completion: { kind: 'catalog', count: 2 },
    })
  );
  expect(workspaceListeners.size).toBe(0);
  expect(client.readStatus).toHaveBeenCalledTimes(reads);
});

it('rejects a status read from before effect cleanup and setup replay', async () => {
  const previous = {
    kind: 'status',
    status: {
      connection: null,
      workspace: {
        source,
        phase: 'ready',
        rootUrl: 'https://stale.example/workspace/',
        accountId: 'stale-account',
      },
      workspaceJob: { state: 'ready' },
    },
  };
  let finish: ((value: typeof previous) => void) | undefined;
  client.readStatus.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  await act(async () =>
    root.render(
      <StrictMode>
        <SyncConnectionSection key="effect-replay" />
      </StrictMode>
    )
  );
  expect(workspaceListeners.size).toBe(1);
  await act(async () => finish?.(previous));
  expect(container.textContent).not.toContain('https://stale.example/workspace/');
  expect(input('rootUrl').disabled).toBe(false);
  expect(connectionButton('create').disabled).toBe(false);
  expect(vi.getTimerCount()).toBe(0);
});

async function connectedForLocalOnly() {
  client.readStatus.mockResolvedValue({
    kind: 'status',
    status: {
      connection: { phase: 'active', rootUrl: 'https://dav.test/root/', accountId: 'user' },
      workspace: null,
      products: [],
      workspaceJob: null,
    },
  });
  await act(async () => window.dispatchEvent(new Event('focus')));
}
it('confirms the full local-only preparation before downloading or retiring a connection', async () => {
  await connectedForLocalOnly();
  await act(async () => connectionButton('localOnly').click());
  await vi.waitFor(() => expect(container.querySelector('[role="alertdialog"]')).not.toBeNull());
  expect(local.switch).not.toHaveBeenCalled();
  expect(container.textContent).toContain('settings.syncConnection.localOnlyQueueHint');
  client.readStatus.mockResolvedValue({
    kind: 'status',
    status: { connection: null, workspace: null, products: [], workspaceJob: null },
  });
  await act(async () => connectionButton('localOnlyConfirm').click());
  await vi.waitFor(() => expect(container.querySelector('[role="alertdialog"]')).toBeNull());
  expect(local.switch).toHaveBeenCalledWith(
    expect.objectContaining({ nativeRootCount: 2 }),
    expect.any(AbortSignal)
  );
  expect(container.textContent).toContain('settings.syncConnection.localOnlyReady');
  expect(connectionButton('create').disabled).toBe(false);
});
it('cancels confirmation without starting downloads', async () => {
  await connectedForLocalOnly();
  await act(async () => connectionButton('localOnly').click());
  await vi.waitFor(() => expect(container.querySelector('[role="alertdialog"]')).not.toBeNull());
  const cancel = [...container.querySelectorAll('button')].find((button) =>
    button.textContent?.includes('common.actions.cancel')
  );
  await act(async () => cancel?.click());
  expect(local.switch).not.toHaveBeenCalled();
  expect(container.querySelector('[role="alertdialog"]')).toBeNull();
});
it('keeps preparation visible while cancellation drains and preserves connection controls', async () => {
  let finish!: () => void;
  local.switch.mockImplementationOnce(
    (_plan, signal: AbortSignal) =>
      new Promise<void>((_resolve, reject) => {
        finish = () => reject(signal.reason);
      })
  );
  await connectedForLocalOnly();
  await act(async () => connectionButton('localOnly').click());
  await vi.waitFor(() => expect(container.querySelector('[role="alertdialog"]')).not.toBeNull());
  await act(async () => connectionButton('localOnlyConfirm').click());
  await vi.waitFor(() => expect(local.switch).toHaveBeenCalledOnce());
  const cancel = [...container.querySelectorAll('button')].find((button) =>
    button.textContent?.includes('common.actions.cancel')
  );
  await act(async () => cancel?.click());
  expect(local.switch.mock.calls[0]?.[1].aborted).toBe(true);
  expect(container.textContent).toContain('settings.syncConnection.localOnlyCancelling');
  expect(container.querySelector('[role="alertdialog"]')).not.toBeNull();
  await act(async () => finish());
  expect(container.querySelector('[role="alertdialog"]')).toBeNull();
  expect(container.textContent).toContain('settings.syncConnection.localOnlyCancelled');
  expect(container.textContent).not.toContain('settings.syncConnection.localOnlyReady');
});

it('restores focus to the local-only trigger after keyboard cancellation', async () => {
  await connectedForLocalOnly();
  const trigger = connectionButton('localOnly');
  await act(async () => {
    trigger.focus();
    trigger.click();
  });
  await vi.waitFor(() => expect(container.querySelector('[role="alertdialog"]')).not.toBeNull());
  await act(async () =>
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  );
  expect(container.querySelector('[role="alertdialog"]')).toBeNull();
  expect(document.activeElement).toBe(trigger);
  expect(local.switch).not.toHaveBeenCalled();
});

it('reports a completed local-only transition with incomplete earlier history', async () => {
  await connectedForLocalOnly();
  local.switch.mockResolvedValueOnce('incomplete');
  await act(async () => connectionButton('localOnly').click());
  await vi.waitFor(() => expect(container.querySelector('[role="alertdialog"]')).not.toBeNull());
  await act(async () => connectionButton('localOnlyConfirm').click());
  await vi.waitFor(() =>
    expect(container.textContent).toContain('settings.syncConnection.localOnlyReadyHistoryGap')
  );
  expect(container.querySelector('[role="alertdialog"]')).toBeNull();
});
