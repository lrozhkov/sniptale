import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { createBackgroundRuntimeState } from '../../../application/runtime-state';
import type { SimplifyCommand } from '../../../../contracts/messaging/contracts/runtime-message/simplify.types';
import { createActionContext } from './context';

const mocks = vi.hoisted(() => ({
  ensureDocument: vi.fn(),
  waitForReady: vi.fn(),
  send: vi.fn(),
}));
vi.mock('../../../offscreen-document/service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../offscreen-document/service')>()),
  ensureOffscreenDocument: mocks.ensureDocument,
  waitForOffscreenReady: mocks.waitForReady,
}));
vi.mock('../../../routing-contracts/runtime-messaging/services', () => ({
  getBackgroundRuntimeMessaging: () => ({ sendRuntimeMessage: mocks.send }),
}));
vi.mock('@sniptale/platform/browser/runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/runtime')>()),
  runtimeInfo: { getURL: (path: string) => `chrome-extension://test/${path}` },
}));

import { dispatchBackgroundOwnedRoute } from './owned-route-handlers';
import { authorizeBackgroundOwnedRoute } from '../authorization/owned';

const png =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
const sender = {
  id: 'test',
  documentId: 'editor-document',
  frameId: 0,
  url: 'chrome-extension://test/apps/extension/src/editor/index.html',
};
function dispatch(command: SimplifyCommand, from = sender) {
  const sendResponse = vi.fn();
  const message = { ...command, type: MessageType.SIMPLIFY_COMMAND };
  const result = dispatchBackgroundOwnedRoute(
    {
      actionKind: 'background-owned',
      message,
      routeName: `background-owned:${message.type}`,
      context: createActionContext({
        logger: { warn: vi.fn() },
        runtimeState: createBackgroundRuntimeState(),
        sender: from,
        sendResponse,
      }),
    },
    null
  );
  expect(result).toEqual({ handled: true, keepChannelOpen: true });
  return sendResponse;
}

beforeEach(() => {
  vi.resetAllMocks();
});
afterEach(() => {
  vi.useRealTimers();
});

it('waits for a ready offscreen document before forwarding a capability-bound source', async () => {
  vi.useFakeTimers();
  let ready!: () => void;
  mocks.waitForReady.mockReturnValue(
    new Promise<void>((resolve) => {
      ready = resolve;
    })
  );
  mocks.send.mockImplementation(async (command) =>
    command.operation === 'dispose'
      ? { success: true, result: 'disposed' }
      : { success: true, sessionId: command.sessionId, width: 1, height: 1, version: 'v1' }
  );
  const response = dispatch({ operation: 'prepare', dataUrl: png });
  await vi.waitFor(() => expect(mocks.waitForReady).toHaveBeenCalledOnce());
  expect(mocks.ensureDocument).toHaveBeenCalledOnce();
  expect(mocks.send).not.toHaveBeenCalled();
  expect(response).not.toHaveBeenCalled();
  ready();
  await vi.waitFor(() =>
    expect(response).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, width: 1, height: 1 })
    )
  );
  const command = mocks.send.mock.calls[0]?.[0];
  expect(command).toMatchObject({
    type: MessageType.OFFSCREEN_SIMPLIFY_COMMAND,
    operation: 'prepare',
    dataUrl: png,
    capabilityToken: expect.any(String),
  });
  const disposed = dispatch({ operation: 'dispose', sessionId: command.sessionId });
  await vi.waitFor(() =>
    expect(disposed).toHaveBeenCalledWith({ success: true, result: 'disposed' })
  );
});

it('reports setup failure and retires the failed source instead of sending it for computation', async () => {
  vi.useFakeTimers();
  mocks.ensureDocument.mockRejectedValueOnce(new Error('offscreen unavailable'));
  mocks.send.mockResolvedValue({ success: true, result: 'disposed' });
  const response = dispatch({ operation: 'prepare', dataUrl: png });
  await vi.waitFor(() =>
    expect(response).toHaveBeenCalledWith({ success: false, error: 'Simplify computation failed' })
  );
  expect(mocks.waitForReady).not.toHaveBeenCalled();
  expect(mocks.send).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ operation: 'dispose', type: MessageType.OFFSCREEN_SIMPLIFY_COMMAND })
  );
});

it('admits the owned editor and refuses an extension identity mismatch before computation', () => {
  const message = { type: MessageType.SIMPLIFY_COMMAND, operation: 'prepare', dataUrl: png };
  expect(authorizeBackgroundOwnedRoute({ kind: 'background-owned', message, sender })).toEqual({
    authorized: true,
  });
  const foreign = { ...sender, id: 'foreign' };
  expect(
    authorizeBackgroundOwnedRoute({ kind: 'background-owned', message, sender: foreign })
  ).toEqual({ authorized: false, reason: 'Unauthorized simplify sender' });
  expect(dispatch({ operation: 'prepare', dataUrl: png }, foreign)).toHaveBeenCalledWith({
    success: false,
    error: 'Unauthorized simplify sender',
  });
  expect(mocks.ensureDocument).not.toHaveBeenCalled();
  expect(mocks.send).not.toHaveBeenCalled();
});
