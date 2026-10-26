import { afterEach, expect, it, vi } from 'vitest';
import { createRuntimePortFixture } from '../../../../../../tooling/test/support/chrome-runtime-port';
import { PageRecoveryClient } from './client';
const peek = () => ({ kind: 'peek' as const, requestId: crypto.randomUUID() });
afterEach(() => vi.unstubAllGlobals());
it('matches admitted native replies without exposing or accepting caller-selected tab identity', async () => {
  const port = createRuntimePortFixture();
  const connect = vi.fn(() => port.port);
  const client = new PageRecoveryClient(vi.fn(), connect);
  const request = peek();
  const pending = client.request(request);
  const reply = {
    kind: 'result',
    requestId: request.requestId,
    status: 'ready',
    lease: crypto.randomUUID(),
    available: true,
  };
  port.onMessage.emit(reply);
  expect(await pending).toEqual(reply);
  expect(port.postMessage).toHaveBeenCalledWith(request);
  client.dispose();
});
it('cancels pending work on disconnect and reconnects only after a fresh admission request', async () => {
  vi.stubGlobal('chrome', { runtime: { lastError: undefined } });
  const first = createRuntimePortFixture();
  const second = createRuntimePortFixture();
  const connect = vi.fn().mockReturnValueOnce(first.port).mockReturnValueOnce(second.port);
  const unavailable = vi.fn();
  const client = new PageRecoveryClient(unavailable, connect);
  const pending = client.request(peek());
  const refusal = expect(pending).rejects.toThrow('unavailable');
  first.onDisconnect.emit(first.port);
  await refusal;
  expect(unavailable).toHaveBeenCalledOnce();
  await expect(
    client.request({
      kind: 'save',
      requestId: crypto.randomUUID(),
      lease: crypto.randomUUID(),
      payload: '{}',
      changedAt: 1000,
    })
  ).rejects.toThrow('admission');
  expect(connect).toHaveBeenCalledTimes(1);
  const request = peek();
  const opening = client.request(request);
  second.onMessage.emit({
    kind: 'result',
    requestId: request.requestId,
    status: 'ready',
    lease: crypto.randomUUID(),
    available: false,
  });
  expect((await opening).status).toBe('ready');
  expect(connect).toHaveBeenCalledTimes(2);
  client.dispose();
});
it('refuses malformed replies and cancels all pending requests on disposal', async () => {
  const port = createRuntimePortFixture();
  const client = new PageRecoveryClient(vi.fn(), () => port.port);
  const pending = client.request(peek());
  const refused = expect(pending).rejects.toThrow('unavailable');
  port.onMessage.emit({ kind: 'result', requestId: 'invalid', status: 'ready' });
  await refused;
  const next = client.request(peek());
  const cancelled = expect(next).rejects.toThrow('unavailable');
  client.dispose();
  await cancelled;
  await expect(client.request(peek())).rejects.toThrow('disposed');
});
