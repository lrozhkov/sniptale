import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRuntimePortFixture } from '../../../../../tooling/test/support/chrome-runtime-port';
import { runReviewTextJob } from './text-rewrite-client';
import {
  REVIEW_TEXT_KEEPALIVE_MS,
  REVIEW_TEXT_PORT_NAME,
  REVIEW_TEXT_TIMEOUT_MS,
  type ReviewTextStart,
} from '../../contracts/ai/review-text';

const start: ReviewTextStart = {
  type: 'start',
  requestId: 'bde5d973-b7d7-4c61-8ec9-784bdc7a4930',
  modelId: 'model',
  approvedProviderId: 'provider',
  approvedDestination: `sha256:${'a'.repeat(64)}`,
  approvedModelCode: 'code',
  llmSessionToken: 'token',
  scope: { workspaceId: 'workspace', workspaceRevision: 1 },
  context: {
    version: 1,
    prompt: 'Shorten',
    mode: 'phrases',
    wholeDocument: false,
    changeIntervals: false,
    resegment: false,
    window: { start: 1, end: 2 },
    fragments: [{ id: 'text', text: 'Words', start: 1, end: 2 }],
  },
};
const proposal = { version: 1, fragments: [{ fromIds: ['text'], text: 'Edited' }] };
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
function fixture() {
  const port = createRuntimePortFixture();
  const connect = vi.fn(() => port.port);
  vi.stubGlobal('chrome', { runtime: { connect } });
  return { ...port, connect };
}
describe('review text page Port lifetime', () => {
  it('validates final proposal, ignores another request and closes one connection without replay', async () => {
    const port = fixture();
    const promise = runReviewTextJob(start, new AbortController().signal);
    expect(port.connect).toHaveBeenCalledWith({ name: REVIEW_TEXT_PORT_NAME });
    port.onMessage.emit({
      type: 'proposal',
      requestId: '073a6f84-d7a8-4d65-942e-644c3f6901c9',
      proposal,
    });
    expect(port.disconnect).not.toHaveBeenCalled();
    port.onMessage.emit({ type: 'proposal', requestId: start.requestId, proposal });
    await expect(promise).resolves.toEqual(proposal);
    expect(port.postMessage).toHaveBeenCalledExactlyOnceWith(start);
    expect(vi.getTimerCount()).toBe(0);
    port.onDisconnect.emit(port.port);
    expect(port.connect).toHaveBeenCalledOnce();
  });
  it('cancels and detaches listeners before late output; an already aborted start opens no Port', async () => {
    const port = fixture();
    const controller = new AbortController();
    const promise = runReviewTextJob(start, controller.signal);
    const refusal = expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    await refusal;
    expect(port.postMessage).toHaveBeenLastCalledWith({
      type: 'cancel',
      requestId: start.requestId,
    });
    port.onMessage.emit({ type: 'proposal', requestId: start.requestId, proposal });
    expect(vi.getTimerCount()).toBe(0);
    expect(() => runReviewTextJob(start, controller.signal)).toThrow();
    expect(port.connect).toHaveBeenCalledOnce();
  });
  it('keeps a pending worker alive, reports deadline and interruption without automatically retrying', async () => {
    const port = fixture();
    const promise = runReviewTextJob(start, new AbortController().signal);
    const refusal = expect(promise).rejects.toThrow('timeout');
    await vi.advanceTimersByTimeAsync(REVIEW_TEXT_KEEPALIVE_MS);
    expect(port.postMessage).toHaveBeenLastCalledWith({
      type: 'keepalive',
      requestId: start.requestId,
    });
    await vi.advanceTimersByTimeAsync(REVIEW_TEXT_TIMEOUT_MS);
    await refusal;
    expect(port.disconnect).toHaveBeenCalledOnce();
    expect(port.connect).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
    const interrupted = runReviewTextJob(start, new AbortController().signal);
    port.onDisconnect.emit(port.port);
    await expect(interrupted).rejects.toThrow('interrupted');
    expect(port.connect).toHaveBeenCalledTimes(2);
  });
  it('refuses a typed but out-of-scope response at the page receiver', async () => {
    const port = fixture();
    const promise = runReviewTextJob(start, new AbortController().signal);
    port.onMessage.emit({
      type: 'proposal',
      requestId: start.requestId,
      proposal: { ...proposal, fragments: [{ fromIds: ['unknown'], text: 'Unrelated' }] },
    });
    await expect(promise).rejects.toThrow('invalid-response');
    expect(vi.getTimerCount()).toBe(0);
  });
});
