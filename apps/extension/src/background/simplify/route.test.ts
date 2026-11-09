import { afterEach, expect, it, vi } from 'vitest';
vi.mock('../offscreen-document/service', () => ({
  ensureOffscreenDocument: vi.fn(),
  waitForOffscreenReady: vi.fn(),
}));
vi.mock('../routing-contracts/runtime-messaging/services', () => ({
  getBackgroundRuntimeMessaging: () => ({ sendRuntimeMessage: vi.fn() }),
}));
vi.mock('@sniptale/platform/browser/runtime', () => ({
  runtimeInfo: { getURL: (path: string) => `chrome-extension://test/${path}` },
}));
import { createSimplifyRoute, getSimplifyCallerKey } from './route';
import { createDefaultSimplifySettings } from '../../features/simplify/settings';
import type { OffscreenSimplifyCommand } from '../../contracts/messaging/contracts/runtime-message/simplify.types';
const png =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
afterEach(() => vi.useRealTimers());
function setup() {
  let counter = 0;
  const send = vi.fn(async (command: OffscreenSimplifyCommand) =>
    command.operation === 'dispose' || command.operation === 'cancel'
      ? { success: true, result: 'disposed' }
      : {
          success: true,
          sessionId: command.sessionId,
          width: 1,
          height: 1,
          version: 'v1',
          ...(command.operation === 'render' ? { dataUrl: png } : {}),
        }
  );
  return {
    route: createSimplifyRoute({
      createId: () => `session-${++counter}`,
      ensureDocument: async () => undefined,
      send,
    }),
    send,
  };
}
it('derives browser caller identities and refuses spoofed extensions, missing documents and subframes', () => {
  const sender = {
    id: 'test',
    frameId: 0,
    documentId: 'doc',
    tab: {
      id: 1,
      index: 0,
      pinned: false,
      highlighted: true,
      windowId: 1,
      active: true,
      frozen: false,
      incognito: false,
      selected: true,
      discarded: false,
      autoDiscardable: true,
      groupId: -1,
      lastAccessed: 0,
    },
    url: 'https://example.com/',
  };
  expect(getSimplifyCallerKey(sender)).toContain('doc');
  expect(getSimplifyCallerKey({ ...sender, frameId: 1 })).toBeNull();
  expect(getSimplifyCallerKey({ ...sender, documentId: '' })).toBeNull();
  expect(getSimplifyCallerKey({ ...sender, id: 'other' })).toBeNull();
  expect(
    getSimplifyCallerKey({
      ...sender,
      url: 'chrome-extension://other/apps/extension/src/editor/index.html',
    })
  ).toBeNull();
  expect(
    getSimplifyCallerKey({
      ...sender,
      tab: { ...sender.tab, url: 'https://example.com/' },
      url: 'chrome-extension://test/apps/extension/src/settings/index.html',
    })
  ).toBeNull();
  expect(
    getSimplifyCallerKey({
      ...sender,
      url: 'chrome-extension://test/apps/extension/src/editor/index.html',
    })
  ).toContain('extension');
});
it('admits embedded owned editors and isolates their sessions by frame and document', async () => {
  vi.useFakeTimers();
  const embedded: chrome.runtime.MessageSender = {
    id: 'test',
    frameId: 2,
    documentId: 'editor-document',
    url: 'chrome-extension://test/apps/extension/src/editor/index.html?session=example',
  };
  const caller = getSimplifyCallerKey(embedded);
  const parent = getSimplifyCallerKey({ ...embedded, frameId: 0 });
  const otherDocument = getSimplifyCallerKey({ ...embedded, documentId: 'other-editor-document' });
  expect(caller).not.toBeNull();
  expect(parent).not.toBe(caller);
  expect(otherDocument).not.toBe(caller);
  for (const frameId of [-1, 0.5, Number.NaN])
    expect(getSimplifyCallerKey({ ...embedded, frameId })).toBeNull();
  if (!caller || !parent || !otherDocument) throw new Error('Owned editor fixture was rejected');
  const { route } = setup();
  await route.execute({ operation: 'prepare', dataUrl: png }, caller);
  await expect(
    route.execute({ operation: 'dispose', sessionId: 'session-1' }, parent)
  ).rejects.toThrow('unavailable');
  await expect(
    route.execute({ operation: 'dispose', sessionId: 'session-1' }, otherDocument)
  ).rejects.toThrow('unavailable');
  await expect(
    route.execute({ operation: 'dispose', sessionId: 'session-1' }, caller)
  ).resolves.toMatchObject({ success: true, result: 'disposed' });
  route.dispose();
});
it('rejects foreign renders/cancellation and expires owner authority', async () => {
  vi.useFakeTimers();
  const { route, send } = setup();
  await route.execute({ operation: 'prepare', dataUrl: png }, 'owner');
  const render = {
    operation: 'render' as const,
    sessionId: 'session-1',
    settings: createDefaultSimplifySettings(),
    region: { x: 0, y: 0, width: 1, height: 1, rotation: 15 },
  };
  await expect(route.execute(render, 'foreign')).rejects.toThrow('unavailable');
  await expect(
    route.execute({ operation: 'cancel', sessionId: 'session-1' }, 'foreign')
  ).rejects.toThrow('unavailable');
  expect(send).toHaveBeenCalledTimes(1);
  await expect(route.execute(render, 'owner')).resolves.toMatchObject({
    success: true,
    dataUrl: png,
  });
  expect(send).toHaveBeenLastCalledWith(
    expect.objectContaining({ operation: 'render', region: render.region })
  );
  await vi.advanceTimersByTimeAsync(120_000);
  await expect(route.execute(render, 'owner')).rejects.toThrow('unavailable');
  expect(send).toHaveBeenLastCalledWith({ operation: 'dispose', sessionId: 'session-1' });
  route.dispose();
});
it('reserves capacity before asynchronous preparation and releases failed preparations for retry', async () => {
  vi.useFakeTimers();
  const { route, send } = setup();
  send.mockRejectedValueOnce(new Error('worker failed'));
  await expect(route.execute({ operation: 'prepare', dataUrl: png }, 'owner')).rejects.toThrow();
  await expect(
    route.execute({ operation: 'prepare', dataUrl: png }, 'owner')
  ).resolves.toMatchObject({ success: true, sessionId: 'session-2' });
  await route.execute({ operation: 'prepare', dataUrl: png }, 'owner');
  await expect(route.execute({ operation: 'prepare', dataUrl: png }, 'owner')).rejects.toThrow(
    'capacity'
  );
  route.dispose();
});

it('releases closed tab owners across eight successive source preparations', async () => {
  vi.useFakeTimers();
  const { route, send } = setup();
  for (let tabId = 1; tabId <= 8; tabId += 1) {
    await expect(
      route.execute({ operation: 'prepare', dataUrl: png }, `owner-${tabId}`, tabId)
    ).resolves.toMatchObject({ success: true });
    route.retireTab(tabId);
    expect(send).toHaveBeenLastCalledWith({ operation: 'dispose', sessionId: `session-${tabId}` });
  }
  expect(vi.getTimerCount()).toBe(0);
  route.dispose();
});

it('keeps live caller and global capacity limits when another native tab closes', async () => {
  vi.useFakeTimers();
  const { route, send } = setup();
  for (let tabId = 1; tabId <= 3; tabId += 1) {
    await route.execute({ operation: 'prepare', dataUrl: png }, `owner-${tabId}`, tabId);
    await route.execute({ operation: 'prepare', dataUrl: png }, `owner-${tabId}`, tabId);
  }
  route.retireTab(99);
  await expect(
    route.execute({ operation: 'prepare', dataUrl: png }, 'new-owner', 4)
  ).rejects.toThrow('capacity');
  route.retireTab(1);
  expect(send).toHaveBeenCalledWith({ operation: 'dispose', sessionId: 'session-1' });
  expect(send).toHaveBeenCalledWith({ operation: 'dispose', sessionId: 'session-2' });
  await expect(route.execute({ operation: 'prepare', dataUrl: png }, 'owner-2', 2)).rejects.toThrow(
    'capacity'
  );
  await route.execute({ operation: 'prepare', dataUrl: png }, 'new-owner', 4);
  await route.execute({ operation: 'prepare', dataUrl: png }, 'new-owner', 4);
  await expect(
    route.execute({ operation: 'prepare', dataUrl: png }, 'fifth-owner', 5)
  ).rejects.toThrow('capacity');
  route.dispose();
});

it('refuses delayed preparation after tab close without restoring the retired session', async () => {
  vi.useFakeTimers();
  const { route, send } = setup();
  let complete!: (value: Awaited<ReturnType<typeof send>>) => void;
  send.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      })
  );
  const work = route.execute({ operation: 'prepare', dataUrl: png }, 'closed-owner', 7);
  const failure = expect(work).rejects.toThrow('unavailable');
  await Promise.resolve();
  expect(send).toHaveBeenCalledWith({ operation: 'prepare', dataUrl: png, sessionId: 'session-1' });
  route.retireTab(7);
  complete({ success: true, sessionId: 'session-1', width: 1, height: 1, version: 'v1' });
  await failure;
  await expect(
    route.execute(
      {
        operation: 'render',
        sessionId: 'session-1',
        settings: createDefaultSimplifySettings(),
        region: { x: 0, y: 0, width: 1, height: 1 },
      },
      'closed-owner',
      7
    )
  ).rejects.toThrow('unavailable');
  await expect(
    route.execute({ operation: 'prepare', dataUrl: png }, 'new-owner', 8)
  ).resolves.toMatchObject({ sessionId: 'session-2' });
  route.dispose();
});
