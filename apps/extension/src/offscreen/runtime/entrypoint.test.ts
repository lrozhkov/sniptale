import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  bootstrapOffscreenDocumentMock,
  getCurrentLocaleMock,
  registerOffscreenRuntimeMessageListenerMock,
  registerOffscreenVoiceInputMessageListenerMock,
  translateMock,
} = vi.hoisted(() => ({
  bootstrapOffscreenDocumentMock: vi.fn(),
  getCurrentLocaleMock: vi.fn(() => 'en'),
  registerOffscreenRuntimeMessageListenerMock: vi.fn(),
  registerOffscreenVoiceInputMessageListenerMock: vi.fn(),
  translateMock: vi.fn((key: string) => key),
}));

vi.mock('./bootstrap', () => ({
  bootstrapOffscreenDocument: bootstrapOffscreenDocumentMock,
  probeOffscreenRuntimeReadiness: vi.fn(),
}));

vi.mock('./index', () => ({
  registerOffscreenRuntimeMessageListener: registerOffscreenRuntimeMessageListenerMock,
}));

vi.mock('../voice-input/runtime', () => ({
  registerOffscreenVoiceInputMessageListener: registerOffscreenVoiceInputMessageListenerMock,
}));

vi.mock('../sync-connection/runtime', () => ({
  registerOffscreenSyncMessageListener: vi.fn(),
}));
vi.mock('../sync-connection/executor', async (importOriginal) => {
  const original = await importOriginal<typeof import('../sync-connection/executor')>();
  return {
    ...original,
    createSyncConnectionExecutor: vi.fn(original.createSyncConnectionExecutor),
  };
});
vi.mock('../sync-connection/execution', () => ({ createSyncQueueExecution: vi.fn() }));
vi.mock('../../platform/runtime-messaging', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../platform/runtime-messaging')>();
  return {
    ...original,
    createRuntimeMessagingTransport: vi.fn(original.createRuntimeMessagingTransport),
  };
});
import { createSyncConnectionExecutor } from '../sync-connection/executor';
import { createSyncQueueExecution } from '../sync-connection/execution';
import { registerOffscreenSyncMessageListener } from '../sync-connection/runtime';
import { createRuntimeMessagingTransport } from '../../platform/runtime-messaging';

vi.mock('../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/i18n')>()),
  getCurrentLocale: getCurrentLocaleMock,
  translate: translateMock,
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  vi.unstubAllGlobals();
  vi.stubGlobal('location', {
    href: 'chrome-extension://extension/apps/extension/src/offscreen/offscreen.html',
  });
});

describe('offscreen entrypoint', () => {
  it('owns document metadata and delegates runtime startup', async () => {
    const statusText = { textContent: '' };
    vi.stubGlobal('document', {
      documentElement: { lang: 'ru' },
      getElementById: vi.fn(() => statusText),
      title: 'initial',
    });

    await import('../offscreen');

    expect(getCurrentLocaleMock).toHaveBeenCalledOnce();
    expect(translateMock).toHaveBeenCalledWith('background.runtime.offscreenDocumentTitle', 'en');
    expect(translateMock).toHaveBeenCalledWith('popup.labels.statusReady', 'en');
    expect((document as { documentElement: { lang: string } }).documentElement.lang).toBe('en');
    expect((document as { title: string }).title).toBe('background.runtime.offscreenDocumentTitle');
    expect(statusText.textContent).toBe('popup.labels.statusReady');
    expect(bootstrapOffscreenDocumentMock).toHaveBeenCalledOnce();
    expect(registerOffscreenRuntimeMessageListenerMock.mock.invocationCallOrder[0]).toBeLessThan(
      bootstrapOffscreenDocumentMock.mock.invocationCallOrder[0]!
    );
    expect(registerOffscreenVoiceInputMessageListenerMock.mock.invocationCallOrder[0]).toBeLessThan(
      bootstrapOffscreenDocumentMock.mock.invocationCallOrder[0]!
    );
    expect(registerOffscreenRuntimeMessageListenerMock).toHaveBeenCalledOnce();
    expect(registerOffscreenVoiceInputMessageListenerMock).toHaveBeenCalledOnce();
  });

  it('updates document metadata when the optional status node is missing', async () => {
    vi.stubGlobal('document', {
      documentElement: { lang: 'ru' },
      getElementById: vi.fn(() => null),
      title: 'initial',
    });

    await import('../offscreen');

    expect((document as { documentElement: { lang: string } }).documentElement.lang).toBe('en');
    expect((document as { title: string }).title).toBe('background.runtime.offscreenDocumentTitle');
  });

  it('still delegates runtime startup without document globals', async () => {
    await import('../offscreen');

    expect(getCurrentLocaleMock).not.toHaveBeenCalled();
    expect(bootstrapOffscreenDocumentMock).toHaveBeenCalledOnce();
    expect(registerOffscreenRuntimeMessageListenerMock.mock.invocationCallOrder[0]).toBeLessThan(
      bootstrapOffscreenDocumentMock.mock.invocationCallOrder[0]!
    );
    expect(registerOffscreenVoiceInputMessageListenerMock.mock.invocationCallOrder[0]).toBeLessThan(
      bootstrapOffscreenDocumentMock.mock.invocationCallOrder[0]!
    );
    expect(registerOffscreenRuntimeMessageListenerMock).toHaveBeenCalledOnce();
    expect(registerOffscreenVoiceInputMessageListenerMock).toHaveBeenCalledOnce();
  });
});

it('installs sync before READY and keeps credentials outside the permission query', async () => {
  const startup = '11111111-1111-4111-8111-111111111111';
  vi.stubGlobal('location', {
    href:
      'chrome-extension://extension/apps/extension/src/offscreen/offscreen.html?offscreenStartupId=' +
      startup,
  });
  const send = vi.fn(async (_message: unknown) => ({ success: true, allowed: true }));
  const transport = createRuntimeMessagingTransport({
    runtimeSendMessage: send,
    tabSendMessage: vi.fn(),
  });
  vi.mocked(createRuntimeMessagingTransport).mockReturnValue(transport);
  await import('../offscreen');
  expect(registerOffscreenSyncMessageListener).toHaveBeenCalledBefore(
    bootstrapOffscreenDocumentMock
  );
  const ports = vi.mocked(createSyncConnectionExecutor).mock.calls[0]?.[0];
  if (!ports) throw new Error('Sync executor was not composed.');
  const authorization = { incarnation: '22222222-2222-4222-8222-222222222222', revision: 2 };
  ports.createExecution({
    scope: { spaceId: 'space', connectionGeneration: 1, profileCreatedAt: 1 },
    authorization,
    operationId: 'operation',
    expectedRevision: 1,
    signal: new AbortController().signal,
    onProgress: () => {},
  });
  const query = vi.mocked(createSyncQueueExecution).mock.calls[0]?.[1];
  if (!query) throw new Error('Origin query was not injected.');
  expect(await query('https://dav.example')).toBe(true);
  expect(send).toHaveBeenCalledWith(
    expect.objectContaining({
      type: 'SYNC_CONNECTION_ORIGIN_PERMISSION',
      requestId: expect.any(String),
      authorization,
      origin: 'https://dav.example',
    })
  );
  send.mockResolvedValue({ success: true, allowed: false });
  expect(await query('https://dav.example')).toBe(false);
});
it('does not install a sync executor in the privacy-only document', async () => {
  const url = new URL('chrome-extension://extension/apps/extension/src/offscreen/offscreen.html');
  url.searchParams.set('offscreenStartupId', '11111111-1111-4111-8111-111111111111');
  url.searchParams.set('privacyErasure', '1');
  vi.stubGlobal('location', { href: url.href });
  await import('../offscreen');
  expect(createSyncConnectionExecutor).not.toHaveBeenCalled();
  expect(registerOffscreenSyncMessageListener).not.toHaveBeenCalled();
  expect(bootstrapOffscreenDocumentMock).toHaveBeenCalledOnce();
});
