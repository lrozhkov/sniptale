import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createRuntimePortFixture } from '../../../../../tooling/test/support/chrome-runtime-port';
import { DESIGN_REVIEW_SESSION_PORT } from '../../contracts/design-review-session';
import {
  designReviewSessionSource,
  isCurrentDesignReviewDocument,
  registerDesignReviewSessionPorts,
} from './ports';
import { DesignReviewSessionService } from './service';
import { DesignReviewSessionStorage } from '../storage/design-review-session';
const mocks = vi.hoisted(() => ({
  listener: null as ((port: chrome.runtime.Port) => void) | null,
  frames: vi.fn(),
  committed: vi.fn(),
  removed: vi.fn(),
  updated: vi.fn(),
}));
vi.mock('@sniptale/platform/browser/runtime', () => ({
  browserRuntime: {
    getURL: () => 'chrome-extension://extension/',
    subscribeToConnections: (listener: (port: chrome.runtime.Port) => void) => {
      mocks.listener = listener;
      return vi.fn();
    },
  },
}));
vi.mock('@sniptale/platform/browser/web-navigation', () => ({
  browserWebNavigation: { getAllFrames: mocks.frames, subscribeToCommitted: mocks.committed },
}));
vi.mock('@sniptale/platform/browser/tabs', () => ({
  browserTabs: { subscribeToRemoved: mocks.removed, subscribeToUpdated: mocks.updated },
}));
function createTab(id: number): chrome.tabs.Tab {
  return {
    active: true,
    autoDiscardable: true,
    discarded: false,
    frozen: false,
    groupId: -1,
    highlighted: true,
    id,
    incognito: false,
    index: 0,
    lastAccessed: 0,
    pinned: false,
    selected: true,
    windowId: 1,
  };
}
const sender: chrome.runtime.MessageSender = {
  id: 'extension',
  frameId: 0,
  documentId: 'document',
  documentLifecycle: 'active',
  tab: createTab(1),
  url: 'https://example.test/',
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.committed.mockReturnValue(vi.fn());
  mocks.removed.mockReturnValue(vi.fn());
  mocks.updated.mockReturnValue(vi.fn());
});
afterEach(() => vi.unstubAllGlobals());
it('rejects foreign extension child frame non-active and non-web native senders', () => {
  const candidates: Array<chrome.runtime.MessageSender | undefined> = [
    undefined,
    { ...sender, id: 'foreign' },
    { ...sender, frameId: 1 },
    { ...sender, documentLifecycle: 'cached' },
    { ...sender, documentId: '' },
    { ...sender, tab: createTab(-1) },
    { ...sender, url: 'file:///private' },
    { ...sender, url: 'chrome-extension://extension/page.html' },
  ];
  for (const candidate of candidates) {
    expect(designReviewSessionSource(candidate)).toBeNull();
  }
  expect(designReviewSessionSource(sender)).toEqual({ tabId: 1, documentId: 'document' });
});
it('checks current native document after worker restart or missed navigation', async () => {
  const source = { tabId: 1, documentId: 'document' };
  mocks.frames.mockResolvedValue([
    { ...source, frameId: 0, url: sender.url, documentLifecycle: 'active' },
  ]);
  expect(await isCurrentDesignReviewDocument(source)).toBe(true);
  for (const frame of [
    { documentId: 'new' },
    { frameId: 1 },
    { documentLifecycle: 'cached' },
    { url: 'file:///private' },
  ]) {
    mocks.frames.mockResolvedValue([
      {
        frameId: 0,
        documentId: 'document',
        documentLifecycle: 'active',
        url: sender.url,
        ...frame,
      },
    ]);
    expect(await isCurrentDesignReviewDocument(source)).toBe(false);
  }
});
it('routes parsed requests only and binds native lifecycle without payload diagnostics', async () => {
  const area = { get: vi.fn(async () => ({})), set: vi.fn(), remove: vi.fn() };
  const service = new DesignReviewSessionService({
    storage: new DesignReviewSessionStorage(area, area),
    isCurrentDocument: async () => true,
  });
  const navigate = vi.spyOn(service, 'navigate');
  const forget = vi.spyOn(service, 'forgetTab');
  const stop = registerDesignReviewSessionPorts(service);
  const refused = createRuntimePortFixture({ name: DESIGN_REVIEW_SESSION_PORT });
  mocks.listener!(refused.port);
  expect(refused.disconnect).toHaveBeenCalledOnce();
  const fixture = createRuntimePortFixture({ name: DESIGN_REVIEW_SESSION_PORT, sender });
  mocks.listener!(fixture.port);
  const requestId = crypto.randomUUID();
  fixture.onMessage.emit({ kind: 'open', requestId });
  await vi.waitFor(() =>
    expect(fixture.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ requestId, status: 'ready', revision: 0 })
    )
  );
  fixture.onMessage.emit({ kind: 'open', requestId, tabId: 2 });
  expect(fixture.disconnect).toHaveBeenCalledOnce();
  mocks.committed.mock.calls[0]![0]({ frameId: 0, tabId: 1, documentId: 'new' });
  expect(navigate).toHaveBeenCalledWith(1, 'new');
  mocks.removed.mock.calls[0]![0](1);
  await vi.waitFor(() => expect(forget).toHaveBeenCalledWith(1));
  fixture.onDisconnect.emit(fixture.port);
  stop();
});

it('restores only enabled bound sessions after native tab completion', async () => {
  const area = { get: vi.fn(async () => ({})), set: vi.fn(), remove: vi.fn() };
  const service = new DesignReviewSessionService({
    storage: new DesignReviewSessionStorage(area, area),
    isCurrentDocument: async () => true,
  });
  const active = vi.spyOn(service, 'shouldRestore').mockResolvedValue(false);
  const restore = vi.fn(async (_tabId: number) => undefined);
  const stop = registerDesignReviewSessionPorts(service, restore);
  const updated = mocks.updated.mock.calls[0]![0];
  updated(1, { status: 'loading' });
  expect(active).not.toHaveBeenCalled();
  updated(1, { status: 'complete' });
  await vi.waitFor(() => expect(active).toHaveBeenCalledWith(1));
  expect(restore).not.toHaveBeenCalled();
  active.mockResolvedValue(true);
  updated(2, { status: 'complete' });
  await vi.waitFor(() => expect(restore).toHaveBeenCalledWith(2));
  expect(restore).toHaveBeenCalledOnce();
  stop();
});
