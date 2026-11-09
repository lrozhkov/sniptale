// @vitest-environment jsdom
import { act, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const local = vi.hoisted(() => ({ plan: vi.fn(), switch: vi.fn(), presence: vi.fn() }));
const protection = vi.hoisted(() => ({ summary: vi.fn() }));
vi.mock('../../../secret-protection/context', () => ({
  useSettingsSecretProtection: () => ({ ensureUnlocked: async () => undefined }),
  SettingsSecretProtectionParticipantSummary: (props: { participant: 'ai' | 'webdav' }) => {
    protection.summary(props);
    return <div data-testid="common-protection-summary">{props.participant}</div>;
  },
}));
vi.mock('../../../../workflows/sync-transfer/retained-library', () => ({
  RetainedLibraryNotReadyError: class extends Error {
    constructor(readonly code: string) {
      super(code);
    }
  },
  planRetainedLibrary: local.plan,
  readRetainedNativePresence: local.presence,
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
  updateConnectionAuthentication: vi.fn(),
  resumeConnection: vi.fn(),
  readStatus: vi.fn(),
  readCheckpointPolicy: vi.fn(),
  setCheckpointInterval: vi.fn(),
  flushCheckpoints: vi.fn(),
  discoverWorkspace: vi.fn(),
  cancel: vi.fn(),
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
import * as controllerOwner from './sync-connection-controller';

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
  local.presence.mockResolvedValue(false);
  workspaceListeners.clear();
  client.subscribeToWorkspaceSettled.mockImplementation((listener: () => void) => {
    workspaceListeners.add(listener);
    return () => workspaceListeners.delete(listener);
  });
  client.readCheckpointPolicy.mockResolvedValue({ kind: 'checkpoint-policy', intervalMs: 300000 });
  client.setCheckpointInterval.mockImplementation(async (intervalMs: number) => ({
    kind: 'checkpoint-policy',
    intervalMs,
  }));
  client.flushCheckpoints.mockResolvedValue({
    kind: 'checkpoint-flushed',
    updated: 1,
    alreadyDue: 0,
  });
  permissions.request.mockResolvedValue(true);
  client.cancel.mockResolvedValue({ kind: 'cancelled', outcome: 'cancelled' });
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
it('retains a failed search draft and explicitly selects, confirms policy, enrolls and refreshes catalog', async () => {
  await fill();
  client.discoverWorkspace.mockRejectedValueOnce(new Error('refused'));
  await submit();
  expect(container.querySelector('[role="alert"]')?.textContent).toBe(
    'settings.syncConnection.failed'
  );
  expect(input('password').value).toBe('secret');
  client.discoverWorkspace.mockResolvedValueOnce({ kind: 'accepted', requestId: 'discovery' });
  client.readStatus.mockResolvedValue(discoveredStatus());
  await submit();
  expect(client.joinWorkspace).not.toHaveBeenCalled();
  await act(async () => container.querySelector<HTMLInputElement>('input[type="radio"]')?.click());
  client.joinWorkspace.mockResolvedValueOnce({ kind: 'accepted', requestId: 'join' });
  client.readStatus.mockResolvedValue({
    kind: 'status',
    status: {
      connection: null,
      products: [],
      workspace: {
        source,
        phase: 'ready',
        rootUrl: 'https://dav.example/workspace/',
        accountId: 'account-1',
      },
      workspaceJob: { state: 'ready' },
    },
  });
  await act(async () => connectionButton('selectWorkspace').click());
  expect(client.joinWorkspace).toHaveBeenCalledWith({
    source,
    prefix: 'first/',
    expected: markerA,
    authentication: { kind: 'basic', username: 'user', password: 'secret' },
  });
  expect(client.enrollWorkspace).not.toHaveBeenCalled();
  await act(async () => policyCheckbox().click());
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
        expected: { incarnation: '10000000-0000-4000-8000-000000000001', revision: 1 },
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
    storagePolicy: { version: 1, mode: 'on-demand' },
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

it(
  'requests only the checked selected origin before discovery and waits for the grant ' +
    'before mutation IPC',
  async () => {
    await fill();
    await change('rootUrl', 'https://dav.example:8443/workspace/');
    let grant: ((value: boolean) => void) | undefined;
    permissions.request.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          grant = resolve;
        })
    );
    client.discoverWorkspace.mockResolvedValueOnce({ kind: 'accepted', requestId: 'join' });
    act(() => {
      container
        .querySelector('form')
        ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      expect(permissions.request).toHaveBeenCalledWith({ origins: ['https://dav.example:8443/*'] });
      expect(client.discoverWorkspace).not.toHaveBeenCalled();
    });
    expect(permissions.request).toHaveBeenCalledWith({ origins: ['https://dav.example:8443/*'] });
    expect(permissions.contains).not.toHaveBeenCalled();
    expect(client.discoverWorkspace).not.toHaveBeenCalled();
    await act(async () => grant?.(true));
    expect(client.discoverWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({ rootUrl: 'https://dav.example:8443/workspace/' })
    );
  }
);

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
  expect(client.discoverWorkspace).not.toHaveBeenCalled();
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
    expect(client.discoverWorkspace).not.toHaveBeenCalled();
    expect(input('rootUrl').value).toBe(value);
  }
);

it('continues through the same permission request when the selected origin is already granted', async () => {
  await fill();
  permissions.request.mockResolvedValueOnce(true);
  client.discoverWorkspace.mockResolvedValueOnce({ kind: 'accepted', requestId: 'existing-grant' });
  await submit();
  expect(permissions.request).toHaveBeenCalledWith({ origins: ['https://dav.example/*'] });
  expect(client.discoverWorkspace).toHaveBeenCalledTimes(1);
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
    expect(container.textContent).toContain('settings.syncConnection.repeatSearch');
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
    if (phase === 'ready') {
      await act(async () => policyCheckbox().click());
      await submit();
    } else {
      const retry = [...container.querySelectorAll('button')].find(
        (node) => node.textContent === 'settings.syncConnection.repeatSearch'
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
    expect(input('rootUrl').disabled).toBe(false);
    expect(input('account').disabled).toBe(false);
    expect(connectionButton('create').disabled).toBe(false);
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
  client.discoverWorkspace.mockResolvedValueOnce({
    kind: 'accepted',
    requestId: 'running-workspace',
  });
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
        expected: { incarnation: '10000000-0000-4000-8000-000000000001', revision: 1 },
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
      connection: {
        expected: { incarnation: '10000000-0000-4000-8000-000000000001', revision: 1 },
        phase: 'active',
        rootUrl: 'https://dav.test/root/',
        accountId: 'user',
      },
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

function checkpointSelect() {
  const target = container.querySelector<HTMLButtonElement>(
    'button[aria-label="settings.syncConnection.checkpointInterval"]'
  );
  if (!target) throw new Error('Missing checkpoint interval select');
  return target;
}
async function chooseCheckpoint(name: string) {
  await act(async () => checkpointSelect().click());
  const option = [...document.body.querySelectorAll<HTMLButtonElement>('[role="option"]')].find(
    (node) => node.textContent?.includes(`settings.syncConnection.${name}`)
  );
  if (!option) throw new Error(`Missing checkpoint choice ${name}`);
  await act(async () => option.click());
}
it('reads the interval without writes, accepts a finite choice, and queues manual work explicitly', async () => {
  await connectedForLocalOnly();
  expect(checkpointSelect().textContent).toContain('checkpointFiveMinutes');
  expect(client.setCheckpointInterval).not.toHaveBeenCalled();
  expect(client.flushCheckpoints).not.toHaveBeenCalled();
  await chooseCheckpoint('checkpointMinute');
  expect(client.setCheckpointInterval).toHaveBeenCalledExactlyOnceWith(60000);
  expect(checkpointSelect().textContent).toContain('checkpointMinute');
  expect(container.querySelector('[role="status"]')?.textContent).toContain('checkpointSaved');
  await act(async () => connectionButton('checkpointSyncNow').click());
  expect(client.flushCheckpoints).toHaveBeenCalledOnce();
  expect(container.querySelector('[role="status"]')?.textContent).toContain('checkpointQueued');
  expect(client.refreshCatalog).not.toHaveBeenCalled();
});
it('keeps the accepted interval after a failed update and permits retry', async () => {
  await connectedForLocalOnly();
  client.setCheckpointInterval.mockRejectedValueOnce(new Error('Native write failed'));
  await chooseCheckpoint('checkpointHour');
  expect(checkpointSelect().textContent).toContain('checkpointFiveMinutes');
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('checkpointFailed');
  await chooseCheckpoint('checkpointHour');
  expect(checkpointSelect().textContent).toContain('checkpointHour');
  expect(client.setCheckpointInterval).toHaveBeenCalledTimes(2);
});
it('retries an unavailable policy through a read without catalog or upload effects', async () => {
  client.readCheckpointPolicy.mockRejectedValueOnce(new Error('Policy unavailable'));
  await connectedForLocalOnly();
  expect(checkpointSelect().disabled).toBe(true);
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('checkpointFailed');
  await act(async () => connectionButton('checkpointRetry').click());
  expect(checkpointSelect().disabled).toBe(false);
  expect(document.activeElement).toBe(checkpointSelect());
  expect(checkpointSelect().textContent).toContain('checkpointFiveMinutes');
  expect(client.refreshCatalog).not.toHaveBeenCalled();
  expect(client.flushCheckpoints).not.toHaveBeenCalled();
  expect(client.setCheckpointInterval).not.toHaveBeenCalled();
});
it('ignores an older policy response after an accepted interval change', async () => {
  await connectedForLocalOnly();
  let finish!: (value: { kind: 'checkpoint-policy'; intervalMs: number }) => void;
  client.readCheckpointPolicy.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    })
  );
  await act(async () => window.dispatchEvent(new Event('focus')));
  await chooseCheckpoint('checkpointMinute');
  await act(async () => finish({ kind: 'checkpoint-policy', intervalMs: 300000 }));
  expect(checkpointSelect().textContent).toContain('checkpointMinute');
});
it('admits one manual command while pending and preserves pause', async () => {
  await connectedForLocalOnly();
  let finish!: (value: { kind: 'checkpoint-flushed'; updated: number; alreadyDue: number }) => void;
  client.flushCheckpoints.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    })
  );
  await act(async () => {
    connectionButton('checkpointSyncNow').click();
    connectionButton('checkpointSyncNow').click();
    window.dispatchEvent(new Event('focus'));
  });
  expect(client.flushCheckpoints).toHaveBeenCalledOnce();
  expect(connectionButton('checkpointSyncNow').disabled).toBe(true);
  await act(async () => finish({ kind: 'checkpoint-flushed', updated: 1, alreadyDue: 0 }));
  client.readStatus.mockResolvedValue({
    kind: 'status',
    status: {
      connection: {
        expected: { incarnation: '10000000-0000-4000-8000-000000000001', revision: 1 },
        phase: 'paused',
        rootUrl: 'https://dav.test/root/',
        accountId: 'user',
      },
      workspace: null,
      products: [],
      workspaceJob: null,
    },
  });
  await act(async () => window.dispatchEvent(new Event('focus')));
  expect(connectionButton('checkpointSyncNow').disabled).toBe(true);
  expect(checkpointSelect().disabled).toBe(false);
  await act(async () => connectionButton('checkpointSyncNow').click());
  expect(client.flushCheckpoints).toHaveBeenCalledOnce();
});

it('does not report new queued edits when manual sync finds no pending checkpoint', async () => {
  await connectedForLocalOnly();
  client.flushCheckpoints.mockResolvedValueOnce({
    kind: 'checkpoint-flushed',
    updated: 0,
    alreadyDue: 0,
  });
  await act(async () => connectionButton('checkpointSyncNow').click());
  expect(container.querySelector('[role="status"]')?.textContent).toContain('checkpointChecked');
  expect(container.textContent).not.toContain('checkpointQueued');
});

it('keeps unavailable connection status distinct from confirmed unconfigured and retries by reading', async () => {
  client.readStatus.mockRejectedValueOnce(new Error('Native status unavailable'));
  await act(async () => root.render(<SyncConnectionSection key="unavailable-connection" />));
  expect(container.textContent).toContain('statusUnavailable');
  expect(container.textContent).not.toContain('syncConnection.unconfigured');
  expect(container.querySelector('form')).toBeNull();
  expect(
    container.querySelector('[data-ui="settings.sync-connection"]')?.getAttribute('data-state')
  ).toBe('unavailable');
  await act(async () => connectionButton('statusRetry').click());
  expect(container.textContent).toContain('syncConnection.unconfigured');
  expect(container.querySelector('form')).not.toBeNull();
  expect(client.createWorkspace).not.toHaveBeenCalled();
  expect(client.refreshCatalog).not.toHaveBeenCalled();
});

it('composes common protection for the WebDAV participant without taking over its controller', () => {
  expect(container.querySelectorAll('[data-testid="common-protection-summary"]')).toHaveLength(1);
  expect(container.querySelector('[data-testid="common-protection-summary"]')?.textContent).toBe(
    'webdav'
  );
  expect(protection.summary).toHaveBeenCalledWith({ participant: 'webdav' });
  expect(protection.summary.mock.calls.every(([props]) => props.participant === 'webdav')).toBe(
    true
  );
  expect(client.createWorkspace).not.toHaveBeenCalled();
  expect(client.joinWorkspace).not.toHaveBeenCalled();
});

const markerA = { spaceId: 'space-a', bootstrapId: 'bootstrap-a', fingerprint: 'sha256:a' };
const markerB = { spaceId: 'space-b', bootstrapId: 'bootstrap-b', fingerprint: 'sha256:b' };
function discoveredStatus(
  options: {
    complete?: boolean;
    candidates?: { prefix: string; identity: typeof markerA }[];
    issues?: { prefix: string; code: string }[];
  } = {}
) {
  return {
    kind: 'status',
    status: {
      connection: null,
      products: [],
      workspace: {
        source,
        phase: 'checking',
        rootUrl: 'https://dav.example/workspace/',
        accountId: 'account-1',
      },
      workspaceJob: {
        requestId: 'discovery',
        state: 'discovered',
        sourceKind: 'join',
        selectionIncarnation: source.identity.incarnation,
        selectionRevision: source.identity.revision,
        failureCode: null,
        discovery: {
          source,
          scope: 'children',
          complete: options.complete ?? true,
          candidates: options.candidates ?? [
            { prefix: 'first/', identity: markerA },
            { prefix: 'second/', identity: markerB },
          ],
          issues: options.issues ?? [],
        },
      },
    },
  };
}
async function searchResults(options?: Parameters<typeof discoveredStatus>[0]) {
  await fill();
  client.discoverWorkspace.mockResolvedValueOnce({ kind: 'accepted', requestId: 'discovery' });
  client.readStatus.mockResolvedValue(discoveredStatus(options));
  await submit();
}
function policyCheckbox() {
  const target = container.querySelector<HTMLInputElement>('input[type="checkbox"]');
  if (!target) throw new Error('Missing on-demand policy confirmation');
  return target;
}
it('searches then requires an explicit workspace choice with its observed marker fingerprint', async () => {
  await searchResults();
  expect(client.discoverWorkspace).toHaveBeenCalledWith({
    rootUrl: 'https://dav.example/workspace/',
    accountId: 'account-1',
    authentication: { kind: 'basic', username: 'user', password: 'secret' },
    previous: null,
  });
  expect(client.joinWorkspace).not.toHaveBeenCalled();
  expect(client.createWorkspace).not.toHaveBeenCalled();
  expect(container.querySelectorAll('input[type="radio"]')).toHaveLength(2);
  expect(connectionButton('selectWorkspace').disabled).toBe(true);
  await act(async () =>
    container.querySelectorAll<HTMLInputElement>('input[type="radio"]')[1]?.click()
  );
  client.joinWorkspace.mockResolvedValueOnce({ kind: 'accepted', requestId: 'selected' });
  await act(async () => connectionButton('selectWorkspace').click());
  expect(client.joinWorkspace).toHaveBeenCalledWith({
    source,
    prefix: 'second/',
    expected: markerB,
    authentication: { kind: 'basic', username: 'user', password: 'secret' },
  });
  expect(client.enrollWorkspace).not.toHaveBeenCalled();
});
it.each([
  [true, 'discoveryEmpty'],
  [false, 'discoveryPartial'],
] as const)(
  'keeps empty and partial discovery distinct without creating workspace (%s)',
  async (complete, key) => {
    await searchResults({
      complete,
      candidates: [],
      issues: complete ? [] : [{ prefix: 'private/', code: 'access-denied' }],
    });
    expect(container.textContent).toContain(`settings.syncConnection.${key}`);
    expect(client.createWorkspace).not.toHaveBeenCalled();
    expect(client.joinWorkspace).not.toHaveBeenCalled();
    expect(client.enrollWorkspace).not.toHaveBeenCalled();
  }
);
it('permits a checked candidate from partial discovery without inferring a complete empty result', async () => {
  await searchResults({ complete: false, issues: [{ prefix: 'private/', code: 'access-denied' }] });
  expect(container.textContent).toContain('settings.syncConnection.discoveryPartial');
  expect(container.querySelectorAll('input[type="radio"]')).toHaveLength(2);
});
it('requires on-demand confirmation before native enrollment and clears the credential after success', async () => {
  await restoredSetup('ready', 'failed');
  await change('username', 'user');
  await change('password', 'secret');
  expect(connectionButton('enroll').disabled).toBe(true);
  await submit();
  expect(client.enrollWorkspace).not.toHaveBeenCalled();
  await act(async () => policyCheckbox().click());
  client.enrollWorkspace.mockResolvedValueOnce({ kind: 'enrolled' });
  client.refreshCatalog.mockResolvedValueOnce({ kind: 'accepted', requestId: 'catalog' });
  client.waitForOperation.mockResolvedValueOnce({
    kind: 'operation',
    job: { state: 'ready' },
    completion: { kind: 'catalog', count: 0 },
  });
  client.readStatus.mockResolvedValue(emptyStatus);
  await submit();
  expect(client.enrollWorkspace).toHaveBeenCalledWith({
    source: allocationSource,
    authentication: { kind: 'basic', username: 'user', password: 'secret' },
    storagePolicy: { version: 1, mode: 'on-demand' },
  });
  expect(input('password').value).toBe('');
});
it('clears policy confirmation on credential edits without discarding a native ready source', async () => {
  await restoredSetup('ready');
  await change('username', 'user');
  await change('password', 'secret');
  await act(async () => policyCheckbox().click());
  expect(policyCheckbox().checked).toBe(true);
  await change('password', 'replacement');
  expect(policyCheckbox().checked).toBe(false);
  expect(client.abandonWorkspace).not.toHaveBeenCalled();
  expect(container.textContent).toContain('https://selected.example/unknown-folder/');
});
it('requires an explicit repeated search after restored checking loses discovery observations', async () => {
  await restoredSetup('checking', 'interrupted');
  await change('username', 'user');
  await change('password', 'secret');
  expect(container.textContent).toContain('settings.syncConnection.repeatSearch');
  expect(container.textContent).not.toContain('settings.syncConnection.retry');
  client.discoverWorkspace.mockResolvedValueOnce({ kind: 'accepted', requestId: 'repeat' });
  await submit();
  expect(client.discoverWorkspace).toHaveBeenCalledWith(
    expect.objectContaining({
      rootUrl: 'https://selected.example/unknown-folder/',
      accountId: 'native-account',
      previous: source,
    })
  );
  expect(client.retryWorkspace).not.toHaveBeenCalled();
  expect(client.enrollWorkspace).not.toHaveBeenCalled();
});
it('separates CREATE from discovered selection through confirmed abandonment and an explicit parent URL', async () => {
  await searchResults();
  client.abandonWorkspace.mockResolvedValueOnce({ kind: 'cancelled', outcome: 'cancelled' });
  client.readStatus.mockResolvedValue(emptyStatus);
  await act(async () => connectionButton('create').click());
  expect(client.abandonWorkspace).toHaveBeenCalledWith(source);
  expect(client.createWorkspace).not.toHaveBeenCalled();
  expect(input('parentUrl').value).toBe('');
  await change('parentUrl', 'https://new.example/explicit-parent/');
  client.createWorkspace.mockResolvedValueOnce({ kind: 'accepted', requestId: 'create' });
  await submit();
  expect(client.createWorkspace).toHaveBeenCalledWith(
    expect.objectContaining({ parentUrl: 'https://new.example/explicit-parent/' })
  );
});
it('invalidates a delayed search on endpoint edit and cancels its accepted old run', async () => {
  await fill();
  let finish: ((value: { kind: 'accepted'; requestId: string }) => void) | undefined;
  client.discoverWorkspace.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  client.cancel.mockResolvedValueOnce({ kind: 'cancelled', outcome: 'cancelled' });
  await submit();
  await change('rootUrl', 'https://new.example/search/');
  await act(async () => finish?.({ kind: 'accepted', requestId: 'old-search' }));
  expect(client.cancel).toHaveBeenCalledWith('old-search');
  expect(client.joinWorkspace).not.toHaveBeenCalled();
  expect(container.querySelectorAll('input[type="radio"]')).toHaveLength(0);
  expect(input('rootUrl').value).toBe('https://new.example/search/');
});
it('discards stale discovery choices on authentication edits and clears drafts on unmount', async () => {
  await searchResults();
  await change('password', 'replacement-secret');
  expect(container.querySelectorAll('input[type="radio"]')).toHaveLength(0);
  await notifyWorkspaceSettled();
  expect(container.querySelectorAll('input[type="radio"]')).toHaveLength(0);
  await act(async () => root.render(<div />));
  await act(async () => root.render(<SyncConnectionSection />));
  expect(input('password').value).toBe('');
  expect(container.textContent).not.toContain('replacement-secret');
});

it('repeats a partial search explicitly with the exact contained previous source', async () => {
  await searchResults({
    complete: false,
    candidates: [],
    issues: [{ prefix: 'denied/', code: 'access-denied' }],
  });
  client.discoverWorkspace.mockResolvedValueOnce({ kind: 'accepted', requestId: 'repeated' });
  await act(async () => connectionButton('repeatSearch').click());
  expect(client.discoverWorkspace).toHaveBeenLastCalledWith(
    expect.objectContaining({ previous: source, rootUrl: 'https://dav.example/workspace/' })
  );
  expect(client.createWorkspace).not.toHaveBeenCalled();
});
it('preserves a still-valid candidate choice across an identical safe status refresh', async () => {
  await searchResults();
  await act(async () => container.querySelector<HTMLInputElement>('input[type="radio"]')?.click());
  client.readStatus.mockResolvedValue(discoveredStatus());
  await notifyWorkspaceSettled();
  expect(container.querySelector<HTMLInputElement>('input[type="radio"]')?.checked).toBe(true);
});
it('does not submit a discovery after its permission wait is invalidated by an endpoint edit', async () => {
  await fill();
  let grant: ((value: boolean) => void) | undefined;
  permissions.request.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        grant = resolve;
      })
  );
  await submit();
  await change('rootUrl', 'https://replacement.example/folder/');
  await act(async () => grant?.(true));
  expect(client.discoverWorkspace).not.toHaveBeenCalled();
  expect(client.createWorkspace).not.toHaveBeenCalled();
});
it('does not select stale results after credentials change during the selection permission wait', async () => {
  await searchResults();
  await act(async () => container.querySelector<HTMLInputElement>('input[type="radio"]')?.click());
  let grant: ((value: boolean) => void) | undefined;
  permissions.request.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        grant = resolve;
      })
  );
  await act(async () => connectionButton('selectWorkspace').click());
  await change('password', 'new-password');
  await act(async () => grant?.(true));
  expect(client.joinWorkspace).not.toHaveBeenCalled();
  expect(container.querySelectorAll('input[type="radio"]')).toHaveLength(0);
});
it('contains the exact running setup on a draft edit before admitting a replacement search', async () => {
  await restoredSetup('checking', 'running');
  let finish: ((value: { kind: 'cancelled'; outcome: 'cancelled' }) => void) | undefined;
  client.abandonWorkspace.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  await change('rootUrl', 'https://replacement.example/');
  expect(client.abandonWorkspace).toHaveBeenCalledWith(source);
  await change('account', 'replacement-account');
  await change('username', 'user');
  await change('password', 'secret');
  await submit();
  expect(client.discoverWorkspace).not.toHaveBeenCalled();
  client.readStatus.mockResolvedValue(emptyStatus);
  await act(async () => finish?.({ kind: 'cancelled', outcome: 'cancelled' }));
  client.discoverWorkspace.mockResolvedValueOnce({ kind: 'accepted', requestId: 'replacement' });
  await submit();
  expect(client.discoverWorkspace).toHaveBeenCalledWith(
    expect.objectContaining({ rootUrl: 'https://replacement.example/', previous: null })
  );
});
it('blocks replacement after old-run cancel refusal and permits explicit cancellation retry', async () => {
  await fill();
  let finish: ((value: { kind: 'accepted'; requestId: string }) => void) | undefined;
  client.discoverWorkspace.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  await submit();
  await change('rootUrl', 'https://replacement.example/');
  client.cancel.mockResolvedValueOnce({ kind: 'cancelled', outcome: 'refused' });
  await act(async () => finish?.({ kind: 'accepted', requestId: 'old-search' }));
  expect(container.textContent).toContain('settings.syncConnection.abandonFailed');
  await submit();
  expect(client.discoverWorkspace).toHaveBeenCalledTimes(1);
  client.readStatus.mockResolvedValue(emptyStatus);
  await act(async () => connectionButton('abandon').click());
  expect(client.cancel).toHaveBeenLastCalledWith('old-search');
  client.discoverWorkspace.mockResolvedValueOnce({ kind: 'accepted', requestId: 'new-search' });
  await submit();
  expect(client.discoverWorkspace).toHaveBeenCalledTimes(2);
});
it('does not promote an invalidated search to ready after a later status observation', async () => {
  await searchResults();
  await change('rootUrl', 'https://replacement.example/');
  client.readStatus.mockResolvedValue({
    kind: 'status',
    status: {
      ...discoveredStatus().status,
      workspace: {
        source,
        phase: 'ready',
        rootUrl: 'https://dav.example/workspace/',
        accountId: 'account-1',
      },
      workspaceJob: { state: 'ready' },
    },
  });
  await notifyWorkspaceSettled();
  expect(container.querySelector('input[type="checkbox"]')).toBeNull();
  await submit();
  expect(client.enrollWorkspace).not.toHaveBeenCalled();
});
it('cancels an accepted setup that arrives after its form was disposed', async () => {
  await fill();
  let finish: ((value: { kind: 'accepted'; requestId: string }) => void) | undefined;
  client.discoverWorkspace.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  await submit();
  await act(async () => root.render(<div />));
  await act(async () => finish?.({ kind: 'accepted', requestId: 'late-disposed' }));
  expect(client.cancel).toHaveBeenCalledWith('late-disposed');
  await act(async () => root.render(<SyncConnectionSection />));
  expect(input('password').value).toBe('');
});

it('keeps authentication out of every published controller view state', async () => {
  const original = controllerOwner.createSyncConnectionController;
  const states: controllerOwner.SyncConnectionViewState[] = [];
  const spy = vi
    .spyOn(controllerOwner, 'createSyncConnectionController')
    .mockImplementation((ports) =>
      original({
        ...ports,
        onChange: (state) => {
          states.push(state);
          ports.onChange(state);
        },
      })
    );
  try {
    await act(async () => root.render(<SyncConnectionSection key="published-state-proof" />));
    await fill();
    await change('password', 'private-password-canary');
    client.discoverWorkspace.mockResolvedValueOnce({
      kind: 'accepted',
      requestId: 'safe-discovery',
    });
    client.readStatus.mockResolvedValue(discoveredStatus());
    await submit();
    expect(states.length).toBeGreaterThan(0);
    expect(JSON.stringify(states)).not.toContain('private-password-canary');
    expect(JSON.stringify(states)).not.toContain('"password"');
    expect(JSON.stringify(states)).not.toContain('"authentication"');
  } finally {
    spy.mockRestore();
  }
});
it('preserves a replacement draft when CREATE abandonment completes after a newer edit', async () => {
  await searchResults();
  let finish: ((value: { kind: 'cancelled'; outcome: 'cancelled' }) => void) | undefined;
  client.abandonWorkspace.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  await act(async () => connectionButton('create').click());
  await change('rootUrl', 'https://replacement.example/keep-this/');
  client.readStatus.mockResolvedValue(emptyStatus);
  await act(async () => finish?.({ kind: 'cancelled', outcome: 'cancelled' }));
  expect(input('rootUrl').value).toBe('https://replacement.example/keep-this/');
  expect(client.createWorkspace).not.toHaveBeenCalled();
});

it('does not silently reuse the old native endpoint after the user clears the search URL', async () => {
  await searchResults();
  await change('rootUrl', '');
  await submit();
  expect(client.discoverWorkspace).toHaveBeenCalledTimes(1);
  expect(container.textContent).toContain('settings.syncConnection.invalidUrl');
});

async function showReadyReview(identity = source.identity) {
  client.readStatus.mockResolvedValue({
    kind: 'status',
    status: {
      connection: null,
      products: [],
      workspace: {
        source: { kind: 'join', identity },
        phase: 'ready',
        rootUrl: 'https://dav.example/workspace/',
        accountId: 'account-1',
      },
      workspaceJob: { state: 'ready' },
    },
  });
  await notifyWorkspaceSettled();
}
it('shows retained local data and its preserved local to selected catalog disposition at ready review', async () => {
  local.presence.mockResolvedValueOnce(true);
  await showReadyReview();
  const review = container.querySelector('[data-ui="settings.sync-storage-policy"]');
  expect(review?.textContent).toContain('settings.syncConnection.localDataPresent');
  expect(review?.textContent).toContain('settings.syncConnection.localDataDisposition');
  expect(local.presence).toHaveBeenCalledOnce();
  expect(client.enrollWorkspace).not.toHaveBeenCalled();
});

it.each([false, 'unavailable'] as const)(
  'shows local review presence %s without adding an enrollment gate',
  async (result) => {
    await fill();
    if (result === 'unavailable')
      local.presence.mockRejectedValueOnce(new Error('Local database unavailable'));
    else local.presence.mockResolvedValueOnce(false);
    await showReadyReview();
    expect(container.querySelector('[data-ui="settings.sync-local-presence"]')?.textContent).toBe(
      result === 'unavailable'
        ? 'settings.syncConnection.localDataUnavailable'
        : 'settings.syncConnection.localDataEmpty'
    );
    expect(container.textContent).toContain('settings.syncConnection.localDataDisposition');
    expect(input('password').value).toBe('secret');
    expect(connectionButton('enroll').disabled).toBe(true);
    await act(async () => policyCheckbox().click());
    expect(connectionButton('enroll').disabled).toBe(false);
    expect(client.enrollWorkspace).not.toHaveBeenCalled();
    expect(client.refreshCatalog).not.toHaveBeenCalled();
  }
);
it(
  'ignores stale local presence responses after workspace identity revision changes ' +
    'and does not reread an unchanged source',
  async () => {
    let finishOld!: (value: boolean) => void;
    local.presence.mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          finishOld = resolve;
        })
    );
    await showReadyReview();
    expect(container.querySelector('[data-ui="settings.sync-local-presence"]')?.textContent).toBe(
      'settings.syncConnection.localDataLoading'
    );
    local.presence.mockResolvedValueOnce(false);
    await showReadyReview({ ...source.identity, revision: 2 });
    expect(container.querySelector('[data-ui="settings.sync-local-presence"]')?.textContent).toBe(
      'settings.syncConnection.localDataEmpty'
    );
    await act(async () => finishOld(true));
    expect(container.querySelector('[data-ui="settings.sync-local-presence"]')?.textContent).toBe(
      'settings.syncConnection.localDataEmpty'
    );
    await showReadyReview({ ...source.identity, revision: 2 });
    expect(local.presence).toHaveBeenCalledTimes(2);
    expect(client.enrollWorkspace).not.toHaveBeenCalled();
  }
);
it('does not read local presence outside ready review or apply its result after the form unmounts', async () => {
  expect(local.presence).not.toHaveBeenCalled();
  client.readStatus.mockResolvedValue({
    kind: 'status',
    status: {
      connection: null,
      products: [],
      workspace: {
        source,
        phase: 'checking',
        rootUrl: 'https://dav.example/workspace/',
        accountId: 'account-1',
      },
      workspaceJob: { state: 'failed', failureCode: 'temporary' },
    },
  });
  await notifyWorkspaceSettled();
  expect(local.presence).not.toHaveBeenCalled();
  let finish!: (value: boolean) => void;
  local.presence.mockImplementationOnce(
    () =>
      new Promise<boolean>((resolve) => {
        finish = resolve;
      })
  );
  await showReadyReview();
  await act(async () => root.render(<div>Settings closed</div>));
  await act(async () => finish(true));
  expect(container.textContent).toBe('Settings closed');
  expect(client.enrollWorkspace).not.toHaveBeenCalled();
});

it('offers transient credential repair for the existing account and explicit origin permission repair', async () => {
  const connection = {
    expected: { incarnation: '10000000-0000-4000-8000-000000000001', revision: 1 },
    phase: 'active',
    rootUrl: 'https://dav.test/root/',
    accountId: 'user',
  };
  const status = { connection, workspace: null, workspaceJob: null, products: [] };
  client.readStatus.mockResolvedValue({ kind: 'status', status });
  client.updateConnectionAuthentication.mockResolvedValue({ kind: 'status', status });
  await act(async () => window.dispatchEvent(new Event('focus')));
  const button = (key: string) =>
    [...container.querySelectorAll('button')].find((node) => node.textContent === key)!;
  expect(permissions.request).not.toHaveBeenCalled();
  await act(async () => button('settings.syncConnection.updateCredentials').click());
  expect(input('username').value).toBe('user');
  expect(input('username').readOnly).toBe(true);
  expect(input('password').value).toBe('');
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
      input('password'),
      'replacement'
    );
    input('password').dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () =>
    container
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  );
  expect(client.updateConnectionAuthentication).toHaveBeenCalledExactlyOnceWith({
    expected: connection.expected,
    authentication: { kind: 'basic', username: 'user', password: 'replacement' },
  });
  expect(container.querySelector('input[type="password"]')).toBeNull();
  await act(async () => button('settings.syncConnection.grantServerAccess').click());
  expect(permissions.request).toHaveBeenCalledExactlyOnceWith({ origins: ['https://dav.test/*'] });
});

it('explicitly resumes native connection after grant without changing separate queue pause', async () => {
  const connection = {
    expected: { incarnation: '10000000-0000-4000-8000-000000000001', revision: 2 },
    phase: 'paused',
    rootUrl: 'https://dav.test/root/',
    accountId: 'user',
  };
  const status = { connection, workspace: null, workspaceJob: null, products: [] };
  client.readStatus.mockResolvedValue({ kind: 'status', status });
  client.resumeConnection.mockResolvedValue({
    kind: 'status',
    status: { ...status, connection: { ...connection, phase: 'active' } },
  });
  await act(async () => window.dispatchEvent(new Event('focus')));
  const button = (key: string) =>
    [...container.querySelectorAll('button')].find((node) => node.textContent === key)!;
  await act(async () => button('settings.syncConnection.grantServerAccess').click());
  expect(client.resumeConnection).not.toHaveBeenCalled();
  expect(button('settings.syncConnection.resumeConnection')).toBeDefined();
  await act(async () => button('settings.syncConnection.resumeConnection').click());
  expect(client.resumeConnection).toHaveBeenCalledExactlyOnceWith(connection.expected);
  expect(container.textContent).not.toContain('settings.syncConnection.paused');
});
