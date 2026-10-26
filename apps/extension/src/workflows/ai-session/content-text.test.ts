import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createRuntimePortFixture } from '../../../../../tooling/test/support/chrome-runtime-port';
import { runContentTextJob } from './content-text';
import {
  CONTENT_TEXT_KEEPALIVE_MS,
  CONTENT_TEXT_PORT_NAME,
  CONTENT_TEXT_TIMEOUT_MS,
  type ContentTextStart,
} from '../../contracts/ai/content-text';

const start: ContentTextStart = {
  type: 'start',
  requestId: 'bde5d973-b7d7-4c61-8ec9-784bdc7a4930',
  text: 'Selected words',
  prompt: 'Shorten',
  modelId: 'model',
  approvedProviderId: 'provider',
  approvedModelCode: 'code',
  approvedDestination: `sha256:${'a'.repeat(64)}`,
  llmSessionToken: 'token',
  privacyProof: {
    captureMode: 'selected_editable',
    createdAtEpochMs: 1,
    generation: 'test',
    payloadHash: `sha256:${'b'.repeat(64)}`,
    riskClass: 'safe_text',
    userInitiatedAiExtraction: true,
  },
};
function fixture() {
  const port = createRuntimePortFixture();
  const connect = vi.fn(() => port.port);
  vi.stubGlobal('chrome', { runtime: { connect } });
  return { ...port, connect };
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it('validates literal text, ignores another request and closes one connection without retry', async () => {
  const port = fixture();
  const promise = runContentTextJob(start, new AbortController().signal);
  expect(port.connect).toHaveBeenCalledWith({ name: CONTENT_TEXT_PORT_NAME });
  port.onMessage.emit({
    type: 'result',
    requestId: '073a6f84-d7a8-4d65-942e-644c3f6901c9',
    text: 'Other',
  });
  expect(port.disconnect).not.toHaveBeenCalled();
  port.onMessage.emit({ type: 'result', requestId: start.requestId, text: '<b>Literal words</b>' });
  await expect(promise).resolves.toBe('<b>Literal words</b>');
  expect(port.postMessage).toHaveBeenCalledExactlyOnceWith(start);
  expect(vi.getTimerCount()).toBe(0);
  port.onDisconnect.emit(port.port);
  expect(port.connect).toHaveBeenCalledOnce();
});
it('cancels before late output and opens no Port for an already aborted request', async () => {
  const port = fixture();
  const controller = new AbortController();
  const promise = runContentTextJob(start, controller.signal);
  const refused = expect(promise).rejects.toMatchObject({ name: 'AbortError' });
  controller.abort();
  await refused;
  expect(port.postMessage).toHaveBeenLastCalledWith({ type: 'cancel', requestId: start.requestId });
  port.onMessage.emit({ type: 'result', requestId: start.requestId, text: 'Late words' });
  expect(vi.getTimerCount()).toBe(0);
  expect(() => runContentTextJob(start, controller.signal)).toThrow();
  expect(port.connect).toHaveBeenCalledOnce();
});
it('keeps a pending worker alive and reports timeout or interruption without a paid retry', async () => {
  const port = fixture();
  const promise = runContentTextJob(start, new AbortController().signal);
  const refused = expect(promise).rejects.toThrow('timeout');
  await vi.advanceTimersByTimeAsync(CONTENT_TEXT_KEEPALIVE_MS);
  expect(port.postMessage).toHaveBeenLastCalledWith({
    type: 'keepalive',
    requestId: start.requestId,
  });
  await vi.advanceTimersByTimeAsync(CONTENT_TEXT_TIMEOUT_MS);
  await refused;
  expect(port.disconnect).toHaveBeenCalledOnce();
  expect(port.connect).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
  const interrupted = runContentTextJob(start, new AbortController().signal);
  port.onDisconnect.emit(port.port);
  await expect(interrupted).rejects.toThrow('interrupted');
  expect(port.connect).toHaveBeenCalledTimes(2);
});
it('refuses malformed server text before it can reach a DOM consumer', async () => {
  const port = fixture();
  const promise = runContentTextJob(start, new AbortController().signal);
  port.onMessage.emit({ type: 'result', requestId: start.requestId, text: { html: 'bad' } });
  await expect(promise).rejects.toThrow('invalid-response');
  expect(vi.getTimerCount()).toBe(0);
});

it.each(['start', 'keepalive'] as const)(
  'disposes content transport after a failed %s send without retry',
  async (phase) => {
    const port = fixture();
    if (phase === 'start')
      port.postMessage.mockImplementationOnce(() => {
        throw new Error('closed');
      });
    const promise = runContentTextJob(start, new AbortController().signal);
    const failed = expect(promise).rejects.toThrow('interrupted');
    if (phase === 'keepalive') {
      port.postMessage.mockImplementationOnce(() => {
        throw new Error('closed');
      });
      await vi.advanceTimersByTimeAsync(CONTENT_TEXT_KEEPALIVE_MS);
    }
    await failed;
    expect(port.disconnect).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
    port.onMessage.emit({ type: 'result', requestId: start.requestId, text: 'Late' });
    expect(port.connect).toHaveBeenCalledOnce();
  }
);
