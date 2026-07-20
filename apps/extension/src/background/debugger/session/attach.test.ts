import { beforeEach, expect, it, vi } from 'vitest';
import type { DebuggerClient } from './index';

const {
  ensureHttpUrl,
  fetchDebuggerTargets,
  rejectExtensionConflict,
  resolveTabInfo,
  selectPageTarget,
  sendDevtoolsConflictToast,
  waitForTabReady,
  attachToPageTarget,
} = vi.hoisted(() => ({
  ensureHttpUrl: vi.fn(),
  fetchDebuggerTargets: vi.fn(),
  rejectExtensionConflict: vi.fn(),
  resolveTabInfo: vi.fn(),
  selectPageTarget: vi.fn(),
  sendDevtoolsConflictToast: vi.fn(),
  waitForTabReady: vi.fn(),
  attachToPageTarget: vi.fn(),
}));

vi.mock('./targets', () => ({
  DebuggerTarget: undefined,
  ensureHttpUrl,
  fetchDebuggerTargets,
  rejectExtensionConflict,
  resolveTabInfo,
  selectPageTarget,
  sendDevtoolsConflictToast,
  waitForTabReady,
}));

vi.mock('./attach-request', () => ({
  attachToPageTarget,
}));

import { attachDebugger, attachDebuggerSafe } from './attach';
import { armDebuggerActivation, resetDebuggerActivationsForTests } from './activation';
import {
  getDebuggerSessionSnapshotForTests,
  resetDebuggerSessionStateForTests,
  seedDebuggerSessionStateForTests,
} from './index';

const resolvedTab = {
  id: 5,
  status: 'complete',
  url: 'https://example.com',
} satisfies Partial<chrome.tabs.Tab>;

const pageTarget = {
  id: 'target-1',
  tabId: 5,
  type: 'page',
  url: 'https://example.com',
  attached: false,
};

function setExistingClients(tabId: number, clients: DebuggerClient[], targetId?: string) {
  seedDebuggerSessionStateForTests(tabId, clients, targetId);
}

function createProof(client: DebuggerClient = 'screenshot') {
  return armDebuggerActivation({ client, reason: 'test', tabId: 5 });
}

beforeEach(() => {
  vi.clearAllMocks();
  resetDebuggerSessionStateForTests();
  resetDebuggerActivationsForTests();

  resolveTabInfo.mockResolvedValue(resolvedTab);
  waitForTabReady.mockResolvedValue(undefined);
  ensureHttpUrl.mockImplementation(() => undefined);
  fetchDebuggerTargets.mockResolvedValue({
    targets: [pageTarget],
    tabTargets: [pageTarget],
  });
  rejectExtensionConflict.mockResolvedValue(undefined);
  selectPageTarget.mockReturnValue(pageTarget);
  attachToPageTarget.mockResolvedValue(undefined);
  sendDevtoolsConflictToast.mockResolvedValue(undefined);
});

it('returns an existing target for a client that is already attached', async () => {
  setExistingClients(5, ['screenshot'], 'existing-target');

  await expect(attachDebugger(5, 'screenshot', createProof())).resolves.toBe('existing-target');

  expect(resolveTabInfo).not.toHaveBeenCalled();
  expect(attachToPageTarget).not.toHaveBeenCalled();
  expect(getDebuggerSessionSnapshotForTests(5)).toEqual({
    clients: ['screenshot'],
    targetId: 'existing-target',
  });
});

it('attaches the first client and stores the resolved target id', async () => {
  await expect(attachDebugger(5, 'screenshot', createProof())).resolves.toBe('target-1');

  expect(resolveTabInfo).toHaveBeenCalledWith(5);
  expect(waitForTabReady).toHaveBeenCalledWith(5, resolvedTab);
  expect(ensureHttpUrl).toHaveBeenCalledWith(resolvedTab);
  expect(rejectExtensionConflict).toHaveBeenCalledWith(true, [pageTarget]);
  expect(selectPageTarget).toHaveBeenCalledWith(5, [pageTarget], [pageTarget]);
  expect(attachToPageTarget).toHaveBeenCalledWith('target-1');
  expect(getDebuggerSessionSnapshotForTests(5)).toEqual({
    clients: ['screenshot'],
    targetId: 'target-1',
  });
});

it('reuses the debugger target for non-first clients without reattaching the page target', async () => {
  setExistingClients(5, ['diagnostics'], 'existing-target');

  await expect(attachDebugger(5, 'screenshot', createProof())).resolves.toBe('target-1');

  expect(rejectExtensionConflict).toHaveBeenCalledWith(false, [pageTarget]);
  expect(attachToPageTarget).not.toHaveBeenCalled();
  expect(getDebuggerSessionSnapshotForTests(5)).toEqual({
    clients: ['diagnostics', 'screenshot'],
    targetId: 'target-1',
  });
});

it('returns false and shows a toast when attach hits a devtools conflict', async () => {
  resolveTabInfo.mockRejectedValue(new Error('Another client is already attached'));

  await expect(attachDebuggerSafe(5, 'screenshot', createProof())).resolves.toBe(false);

  expect(sendDevtoolsConflictToast).toHaveBeenCalledWith(5);
});

it('swallows toast delivery failures when reporting a devtools conflict', async () => {
  resolveTabInfo.mockRejectedValue(new Error('Cannot attach debugger'));
  sendDevtoolsConflictToast.mockRejectedValue(new Error('toast failed'));

  await expect(attachDebuggerSafe(5, 'screenshot', createProof())).resolves.toBe(false);
});

it('rethrows non-conflict errors from attachDebuggerSafe', async () => {
  resolveTabInfo.mockRejectedValue(new Error('tab lookup failed'));

  await expect(attachDebuggerSafe(5, 'screenshot', createProof())).rejects.toThrow(
    'tab lookup failed'
  );
});

it('rejects attach before tab lookup when activation proof is missing', async () => {
  await expect(attachDebugger(5, 'screenshot', { token: 'missing' })).rejects.toThrow(
    'activation proof'
  );
  expect(resolveTabInfo).not.toHaveBeenCalled();
});
