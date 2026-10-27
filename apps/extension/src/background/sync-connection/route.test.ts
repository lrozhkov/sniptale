import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { SyncConnectionMetadata } from '../../composition/persistence/remote-connection/model';
import type { SyncOriginPermissionRequest } from '../../contracts/messaging/contracts/runtime-message/sync-connection.types';
import { routeSyncConnectionOriginPermission } from './route';

vi.mock('@sniptale/platform/browser/runtime', async (original) => ({
  ...(await original<typeof import('@sniptale/platform/browser/runtime')>()),
  runtimeInfo: { getURL: (path: string) => `chrome-extension://test/${path}` },
}));
vi.mock('../../composition/persistence/remote-connection/store', () => ({
  loadSyncConnection: vi.fn(),
}));
const authorization = { incarnation: '11111111-1111-4111-8111-111111111111', revision: 2 };
const message: SyncOriginPermissionRequest = {
  type: MessageType.SYNC_CONNECTION_ORIGIN_PERMISSION,
  requestId: '22222222-2222-4222-8222-222222222222',
  authorization,
  origin: 'https://dav.example.test',
};
const sender = {
  id: 'test',
  url: 'chrome-extension://test/apps/extension/src/offscreen/offscreen.html?offscreenStartupId=live',
};
function connection(): SyncConnectionMetadata {
  return {
    version: 1,
    kind: 'sync-connection',
    key: 'connection',
    binding: {
      provider: 'webdav',
      rootUrl: `${message.origin}/root/`,
      accountId: 'alice',
      spaceId: 'space',
      connectionGeneration: 3,
      profileCreatedAt: 1,
    },
    identity: { ...authorization },
    phase: 'active',
    updateNonce: null,
    credentialId: '33333333-3333-4333-8333-333333333333',
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function setup() {
  const loadConnection = vi
    .fn<() => Promise<SyncConnectionMetadata | null>>()
    .mockResolvedValue(connection());
  const contains = vi
    .fn<(permissions: chrome.permissions.Permissions) => Promise<boolean>>()
    .mockResolvedValue(true);
  const query = (input: unknown = message, source: chrome.runtime.MessageSender = sender) => {
    const response = deferred<unknown>();
    const sendResponse = vi.fn((value: unknown) => response.resolve(value));
    const handled = routeSyncConnectionOriginPermission(input, source, sendResponse, {
      loadConnection,
      contains,
    });
    return { handled, response: response.promise, sendResponse };
  };
  return { loadConnection, contains, query };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('navigator', {
    locks: {
      request: vi.fn(() => {
        throw new Error('Permission query must not acquire a native lock');
      }),
    },
  });
});
afterEach(() => vi.unstubAllGlobals());

it('checks the exact HTTPS origin and durable identity on both sides of permission lookup', async () => {
  const f = setup();
  const query = f.query();
  expect(query.handled).toBe(true);
  expect(await query.response).toEqual({ success: true, allowed: true });
  expect(f.contains).toHaveBeenCalledExactlyOnceWith({ origins: ['https://dav.example.test/*'] });
  expect(f.loadConnection).toHaveBeenCalledTimes(2);
});
const tab: chrome.tabs.Tab = {
  id: 1,
  active: true,
  frozen: false,
  lastAccessed: 0,
  autoDiscardable: true,
  discarded: false,
  groupId: -1,
  highlighted: false,
  incognito: false,
  index: 0,
  pinned: false,
  selected: false,
  windowId: 1,
};
it.each([
  { url: 'https://page.example.test/', tab },
  { url: 'chrome-extension://test/apps/extension/src/settings/index.html' },
  { url: 'chrome-extension://test/apps/extension/src/popup/index.html' },
  { url: 'chrome-extension://other/apps/extension/src/offscreen/offscreen.html' },
  { url: 'chrome-extension://test/apps/extension/src/offscreen/offscreen.html.evil' },
  { url: 'chrome-extension://test/apps/extension/src/offscreen/offscreen.html', tab },
])('refuses non-offscreen sender $url before storage or permission access', async (source) => {
  const f = setup();
  expect(await f.query(message, source).response).toEqual({
    success: false,
    error: 'Sync origin permission query refused',
  });
  expect(f.loadConnection).not.toHaveBeenCalled();
  expect(f.contains).not.toHaveBeenCalled();
});
it.each([
  { origin: 'https://dav.example.test/root/' },
  { origin: 'http://dav.example.test' },
  { origin: 'https://dav.example.test:443' },
  { origin: 'https://dav.example.test@other.example.test' },
  { origin: 'https://other.example.test' },
  { requestId: 'not-a-uuid' },
  { authorization: { ...authorization, revision: 0 } },
])('never checks a malformed or foreign query $origin', async (change) => {
  const f = setup();
  const response = await f.query({ ...message, ...change }).response;
  expect(response).not.toEqual({ success: true, allowed: true });
  expect(f.contains).not.toHaveBeenCalled();
});
it.each(['missing', 'paused', 'reserved', 'stale'] as const)(
  'denies %s native authority before permission lookup',
  async (condition) => {
    const f = setup();
    const current = connection();
    if (condition === 'paused') current.phase = 'paused';
    if (condition === 'reserved') {
      current.phase = 'updating-auth';
      current.updateNonce = crypto.randomUUID();
    }
    if (condition === 'stale') current.identity.revision += 1;
    f.loadConnection.mockResolvedValue(condition === 'missing' ? null : current);
    expect(await f.query().response).toEqual({ success: true, allowed: false });
    expect(f.contains).not.toHaveBeenCalled();
  }
);
it.each(['pause', 'rotation', 'delete', 'recreation', 'binding-change'] as const)(
  'refuses %s while permission lookup is pending without holding a lock',
  async (change) => {
    const f = setup();
    const permission = deferred<boolean>();
    const entered = deferred<void>();
    f.contains.mockImplementation(async () => {
      entered.resolve();
      return permission.promise;
    });
    const query = f.query();
    await entered.promise;
    const updated = connection();
    if (change === 'pause') updated.phase = 'paused';
    if (change === 'rotation') updated.identity.revision += 1;
    if (change === 'recreation')
      updated.identity.incarnation = '44444444-4444-4444-8444-444444444444';
    if (change === 'binding-change') updated.binding.accountId = 'bob';
    f.loadConnection.mockResolvedValue(change === 'delete' ? null : updated);
    permission.resolve(true);
    expect(await query.response).toEqual({ success: true, allowed: false });
    expect(navigator.locks.request).not.toHaveBeenCalled();
  }
);
it('detaches caller authorization and origin before awaiting native state', async () => {
  const f = setup();
  const read = deferred<SyncConnectionMetadata>();
  f.loadConnection.mockReturnValueOnce(read.promise);
  const input = structuredClone(message);
  const query = f.query(input);
  input.authorization.revision += 10;
  input.origin = 'https://other.example.test';
  read.resolve(connection());
  expect(await query.response).toEqual({ success: true, allowed: true });
  expect(f.contains).toHaveBeenCalledExactlyOnceWith({ origins: ['https://dav.example.test/*'] });
});
it('denies missing host permission without a second durable read', async () => {
  const f = setup();
  f.contains.mockResolvedValue(false);
  expect(await f.query().response).toEqual({ success: true, allowed: false });
  expect(f.loadConnection).toHaveBeenCalledTimes(1);
});
it.each(['load', 'contains', 'reread'] as const)(
  'returns a fixed refusal after %s failure without leaking the payload',
  async (stage) => {
    const f = setup();
    const failure = new Error('synthetic-private-secret-and-root');
    if (stage === 'load') f.loadConnection.mockRejectedValueOnce(failure);
    if (stage === 'contains') f.contains.mockRejectedValueOnce(failure);
    if (stage === 'reread')
      f.loadConnection.mockResolvedValueOnce(connection()).mockRejectedValueOnce(failure);
    expect(await f.query().response).toEqual({
      success: false,
      error: 'Sync origin permission query refused',
    });
  }
);
it('leaves unrelated messages unhandled', () => {
  const f = setup();
  const query = f.query({ type: 'UNRELATED' });
  expect(query.handled).toBe(false);
  expect(query.sendResponse).not.toHaveBeenCalled();
  expect(f.loadConnection).not.toHaveBeenCalled();
});
