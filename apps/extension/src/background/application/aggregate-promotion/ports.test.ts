import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createRuntimePortFixture } from '../../../../../../tooling/test/support/chrome-runtime-port';

const browserMocks = vi.hoisted(() => ({
  connectionListener: null as ((port: chrome.runtime.Port) => void) | null,
  isOwnedExtensionPagePath: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/runtime', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sniptale/platform/browser/runtime')>();
  return {
    ...actual,
    browserRuntime: {
      ...actual.browserRuntime,
      subscribeToConnections: vi.fn((listener) => {
        browserMocks.connectionListener = listener;
        return () => undefined;
      }),
    },
  };
});
vi.mock('../../../platform/navigation/extension-pages/sender-url', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../platform/navigation/extension-pages/sender-url')
  >()),
  isOwnedExtensionPagePath: browserMocks.isOwnedExtensionPagePath,
}));

import {
  clearAggregateEditorPresenceForTests,
  listAggregateEditorPresence,
} from './presence-registry';
import { registerAggregateEditorPresencePorts } from './ports';

let stopPresencePorts: (() => void) | null = null;

function createPort(sender: chrome.runtime.MessageSender) {
  const fixture = createRuntimePortFixture({
    name: 'aggregate-editor-presence',
    sender,
  });
  return {
    ...fixture,
    emitDisconnect: () => fixture.onDisconnect.emit(fixture.port),
    emitMessage: (message: unknown) => fixture.onMessage.emit(message),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  clearAggregateEditorPresenceForTests();
  browserMocks.connectionListener = null;
  stopPresencePorts = registerAggregateEditorPresencePorts();
});

afterEach(() => {
  stopPresencePorts?.();
  stopPresencePorts = null;
});

it('binds presence to the exact authorized sender URL and document id', () => {
  browserMocks.isOwnedExtensionPagePath.mockReturnValue(true);
  const port = createPort({
    documentId: 'document-1',
    url: 'chrome-extension://id/editor.html?assetId=image-1',
  });
  browserMocks.connectionListener?.(port.port);
  port.emitMessage({ aggregate: { id: 'image-1', kind: 'image' }, type: 'register' });

  expect(listAggregateEditorPresence({ id: 'image-1', kind: 'image' })).toEqual([
    expect.objectContaining({ documentId: 'document-1', senderUrl: port.port.sender?.url }),
  ]);
  port.emitDisconnect();
  expect(listAggregateEditorPresence({ id: 'image-1', kind: 'image' })).toEqual([]);
});

it('disconnects a neighboring or kind-mismatched editor page', () => {
  browserMocks.isOwnedExtensionPagePath.mockReturnValue(false);
  const port = createPort({ documentId: 'document-1', url: 'chrome-extension://id/editor.html' });
  browserMocks.connectionListener?.(port.port);
  port.emitMessage({ aggregate: { id: 'scenario-1', kind: 'scenario' }, type: 'register' });

  expect(port.disconnect).toHaveBeenCalledOnce();
  expect(listAggregateEditorPresence({ id: 'scenario-1', kind: 'scenario' })).toEqual([]);
});

it('disconnects an authorized editor URL that names a different aggregate', () => {
  browserMocks.isOwnedExtensionPagePath.mockReturnValue(true);
  const port = createPort({
    documentId: 'document-1',
    url: 'chrome-extension://id/video-editor.html?project=video-2',
  });
  browserMocks.connectionListener?.(port.port);
  port.emitMessage({
    aggregate: { id: 'video-1', kind: 'video-project' },
    type: 'register',
  });

  expect(port.disconnect).toHaveBeenCalledOnce();
  expect(listAggregateEditorPresence({ id: 'video-1', kind: 'video-project' })).toEqual([]);
});

it('disconnects registered editors when the presence lifecycle stops', () => {
  browserMocks.isOwnedExtensionPagePath.mockReturnValue(true);
  const port = createPort({
    documentId: 'document-1',
    url: 'chrome-extension://id/editor.html?assetId=image-1',
  });
  browserMocks.connectionListener?.(port.port);
  port.emitMessage({ aggregate: { id: 'image-1', kind: 'image' }, type: 'register' });

  stopPresencePorts?.();
  stopPresencePorts = null;

  expect(port.disconnect).toHaveBeenCalledOnce();
  expect(listAggregateEditorPresence({ id: 'image-1', kind: 'image' })).toEqual([]);
});
