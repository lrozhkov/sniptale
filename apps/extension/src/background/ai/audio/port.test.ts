import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRuntimePortFixture } from '../../../../../../tooling/test/support/chrome-runtime-port';
import { isAudioJobSender } from './authorization';
import { createAudioJobService } from './service';
import { registerAudioJobPorts } from './port';
import { AUDIO_JOB_PORT_NAME, parseAudioJobClientMessage } from '../../../contracts/ai/audio';

const browser = vi.hoisted(() => ({
  listener: null as ((port: chrome.runtime.Port) => void) | null,
  unsubscribe: vi.fn(),
}));
vi.mock('@sniptale/platform/browser/runtime', async (importOriginal) => {
  const original = await importOriginal<typeof import('@sniptale/platform/browser/runtime')>();
  return {
    ...original,
    browserRuntime: {
      ...original.browserRuntime,
      subscribeToConnections(listener: (port: chrome.runtime.Port) => void) {
        browser.listener = listener;
        return browser.unsubscribe;
      },
    },
  };
});
vi.mock('../../../platform/navigation/extension-pages/sender-url', () => ({
  isOwnedExtensionPagePath: (url: string, path: string) =>
    url === `chrome-extension://extension/${path}`,
}));
const sender = {
  id: 'extension',
  documentId: 'document',
  frameId: 0,
  url: 'chrome-extension://extension/apps/extension/src/gallery/index.html',
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('chrome', { runtime: { id: 'extension' } });
});
afterEach(() => vi.unstubAllGlobals());

function connectedPort() {
  const service = createAudioJobService();
  const connection = { receive: vi.fn(), disconnect: vi.fn(async () => undefined) };
  const connect = vi.spyOn(service, 'connect').mockReturnValue(connection);
  const stop = registerAudioJobPorts(service);
  const fixture = createRuntimePortFixture({ name: AUDIO_JOB_PORT_NAME, sender });
  browser.listener?.(fixture.port);
  return { ...fixture, connection, connect, stop };
}

describe('Gallery audio ingress', () => {
  it('rejects missing identity, content frames and another extension document', () => {
    expect(isAudioJobSender(sender)).toBe(true);
    expect(isAudioJobSender(undefined)).toBe(false);
    expect(isAudioJobSender({ ...sender, id: 'other' })).toBe(false);
    expect(isAudioJobSender({ ...sender, url: 'https://example.test/' })).toBe(false);
    expect(isAudioJobSender({ ...sender, frameId: 1 })).toBe(false);
    expect(isAudioJobSender({ id: sender.id, frameId: 0, url: sender.url })).toBe(false);
  });
  it('ignores other channels and disconnects unauthorized Gallery channels before service access', () => {
    const service = createAudioJobService();
    const connect = vi.spyOn(service, 'connect');
    registerAudioJobPorts(service);
    const other = createRuntimePortFixture({ name: 'other', sender });
    browser.listener?.(other.port);
    expect(other.disconnect).not.toHaveBeenCalled();
    const unauthorized = createRuntimePortFixture({
      name: AUDIO_JOB_PORT_NAME,
      sender: { ...sender, id: 'other' },
    });
    browser.listener?.(unauthorized.port);
    expect(unauthorized.disconnect).toHaveBeenCalledOnce();
    expect(connect).not.toHaveBeenCalled();
  });
  it('parses messages, delivers fixed server frames and removes listeners on disconnect', async () => {
    const fixture = connectedPort();
    fixture.onMessage.emit({ type: 'cancel', requestId: 'r' });
    expect(fixture.connection.receive).toHaveBeenCalledExactlyOnceWith({
      type: 'cancel',
      requestId: 'r',
    });
    fixture.connect.mock.calls[0]?.[0]({ type: 'failure', requestId: 'r', code: 'cancelled' });
    expect(fixture.postMessage).toHaveBeenCalledWith({
      type: 'failure',
      requestId: 'r',
      code: 'cancelled',
    });
    fixture.onDisconnect.emit(fixture.port);
    await Promise.resolve();
    fixture.onMessage.emit({ type: 'cancel', requestId: 'later' });
    expect(fixture.connection.receive).toHaveBeenCalledTimes(1);
    expect(fixture.connection.disconnect).toHaveBeenCalledOnce();
    fixture.stop();
    expect(browser.unsubscribe).toHaveBeenCalledOnce();
  });
  it('disconnects malformed frames and aborts work when reply delivery fails', async () => {
    const fixture = connectedPort();
    fixture.onMessage.emit({ type: 'execute', requestId: 'r', ticket: '../escape' });
    expect(fixture.disconnect).toHaveBeenCalledOnce();
    expect(fixture.connection.disconnect).toHaveBeenCalledOnce();
    expect(fixture.connection.receive).not.toHaveBeenCalled();
    fixture.connection.disconnect.mockRejectedValueOnce(new Error('cleanup failed'));
    fixture.postMessage.mockImplementationOnce(() => {
      throw new Error('Port closed');
    });
    fixture.connect.mock.calls[0]?.[0]({ type: 'failure', requestId: 'r', code: 'cancelled' });
    await Promise.resolve();
    expect(fixture.connection.disconnect).toHaveBeenCalledTimes(2);
  });
  it('rejects a ticket under another staged identity', () => {
    expect(
      parseAudioJobClientMessage({
        type: 'execute',
        requestId: 'r',
        ticket: '12345678-1234-4234-8234-123456789abc',
        staged: { id: '12345678-1234-4234-8234-123456789abd', mimeType: 'audio/wav', size: 44 },
      })
    ).toBeNull();
  });
});
