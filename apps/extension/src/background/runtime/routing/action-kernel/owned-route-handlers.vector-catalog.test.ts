import { beforeEach, expect, it, vi } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { createBackgroundRuntimeState } from '../../../application/runtime-state';
import { createActionContext } from './context';
const mocks = vi.hoisted(() => ({ readSettings: vi.fn(), contains: vi.fn(), fetch: vi.fn() }));
vi.mock('../../../../composition/persistence/vector-elements', async (original) => ({
  ...(await original<typeof import('../../../../composition/persistence/vector-elements')>()),
  readEditorVectorSettings: mocks.readSettings,
}));
vi.mock('@sniptale/platform/browser/permissions', () => ({
  browserPermissions: { contains: mocks.contains },
}));
vi.mock('@sniptale/platform/browser/runtime', async (original) => ({
  ...(await original<typeof import('@sniptale/platform/browser/runtime')>()),
  runtimeInfo: { getURL: (path: string) => `chrome-extension://test/${path}` },
}));
import { dispatchAction } from './dispatcher';
import { authorizeBackgroundOwnedRoute } from '../authorization/owned';
import { parseRuntimeRequestMessage } from '../../../../contracts/messaging/parsers/boundary';
const source = { sourceId: 'https://example.test/api/', incarnation: 'configured', generation: 1 };
const message = {
  type: MessageType.EDITOR_VECTOR_CATALOG_COMMAND,
  operation: 'search' as const,
  query: 'heart',
  requestId: 'registered',
  source,
};
const sender = {
  id: 'test',
  documentId: 'editor-document',
  frameId: 0,
  url: 'chrome-extension://test/apps/extension/src/editor/index.html',
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', mocks.fetch);
  mocks.readSettings.mockResolvedValue({
    key: 'settings',
    kind: 'settings',
    baseUrl: source.sourceId,
    incarnation: source.incarnation,
    sourceGeneration: 1,
    revision: 1,
    networkEnabled: true,
    disclosureAccepted: true,
  });
  mocks.contains.mockResolvedValue(true);
  mocks.fetch.mockImplementation(
    async () => new Response(JSON.stringify({ icons: ['mdi:heart'], limit: 64, start: 0 }))
  );
});
it('admits the canonical editor through the actual contract, authorization, registry, and network owner', async () => {
  parseRuntimeRequestMessage(message);
  expect(authorizeBackgroundOwnedRoute({ kind: 'background-owned', message, sender })).toEqual({
    authorized: true,
  });
  const sendResponse = vi.fn();
  const result = dispatchAction({
    actionKind: 'background-owned',
    message,
    routeName: `background-owned:${message.type}`,
    context: createActionContext({
      logger: { warn: vi.fn() },
      runtimeState: createBackgroundRuntimeState(),
      sender,
      sendResponse,
    }),
  });
  expect(result).toEqual({ handled: true, keepChannelOpen: true });
  await vi.waitFor(() =>
    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, operation: 'search' })
    )
  );
  expect(mocks.contains).toHaveBeenCalledWith({ origins: ['https://example.test/*'] });
  expect(mocks.fetch).toHaveBeenCalledOnce();
});
it.each([
  { ...sender, id: 'foreign' },
  { ...sender, url: 'https://example.test/' },
  { ...sender, url: 'chrome-extension://test/apps/extension/src/settings/index.html?aiUnlock=1' },
])(
  'rejects an unauthorized sender through both authorization and the registered handler',
  async (from) => {
    expect(
      authorizeBackgroundOwnedRoute({ kind: 'background-owned', message, sender: from })
    ).toEqual({ authorized: false, reason: 'unauthorized' });
    const sendResponse = vi.fn();
    dispatchAction({
      actionKind: 'background-owned',
      message,
      routeName: `background-owned:${message.type}`,
      context: createActionContext({
        logger: { warn: vi.fn() },
        runtimeState: createBackgroundRuntimeState(),
        sender: from,
        sendResponse,
      }),
    });
    expect(sendResponse).toHaveBeenCalledWith({ success: false, error: 'unauthorized' });
    expect(mocks.fetch).not.toHaveBeenCalled();
  }
);
