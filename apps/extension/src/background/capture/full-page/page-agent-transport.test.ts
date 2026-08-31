import { beforeEach, expect, it, vi } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';

const sendTabMessage = vi.hoisted(() => vi.fn());

import { createFullPagePageAgentTransport } from './page-agent-transport';

const identity = {
  jobId: 'job-1',
  ownerToken: 'owner-1',
  runtimeGeneration: 'generation-1',
};

beforeEach(() => {
  vi.clearAllMocks();
});

it('targets every page-agent effect at the preauthorized document id', async () => {
  const result = {
    actualX: 0,
    actualY: 0,
    frozenExtentWarning: false,
    geometry: {},
    layoutGeneration: 'layout-1',
    warnings: [],
  };
  sendTabMessage.mockResolvedValue({ result, success: true });
  const agent = createFullPagePageAgentTransport(
    { documentId: 'document-7', tabId: 7 },
    { sendTabMessage }
  );

  await agent.prepare(identity, {
    floatingElements: 'once',
    freezeMotion: true,
    preloadLazyContent: true,
  });
  await agent.heartbeat(identity);
  await agent.prepareTile({
    ...identity,
    column: 0,
    firstColumn: true,
    firstRow: true,
    lastColumn: true,
    lastRow: true,
    row: 0,
    targetX: 0,
    targetY: 0,
  });
  await agent.verifyTile(
    {
      ...identity,
      column: 0,
      firstColumn: true,
      firstRow: true,
      lastColumn: true,
      lastRow: true,
      row: 0,
      targetX: 0,
      targetY: 0,
    },
    'layout-1'
  );
  await agent.restore(identity);

  expect(sendTabMessage).toHaveBeenNthCalledWith(
    1,
    7,
    expect.objectContaining({ type: MessageType.PREPARE_FULL_PAGE_CAPTURE }),
    { documentId: 'document-7' }
  );
  expect(sendTabMessage).toHaveBeenNthCalledWith(
    5,
    7,
    { ...identity, type: MessageType.RESTORE_FULL_PAGE_CAPTURE },
    { documentId: 'document-7' }
  );
  expect(sendTabMessage).toHaveBeenNthCalledWith(
    2,
    7,
    { ...identity, type: MessageType.HEARTBEAT_FULL_PAGE_CAPTURE },
    { documentId: 'document-7' }
  );
});

it('fails closed when a document-targeted agent response is missing its result', async () => {
  sendTabMessage.mockResolvedValue({ error: 'document changed', success: false });
  const agent = createFullPagePageAgentTransport(
    { documentId: 'document-old', tabId: 7 },
    { sendTabMessage }
  );

  await expect(
    agent.prepare(identity, {
      floatingElements: 'once',
      freezeMotion: true,
      preloadLazyContent: true,
    })
  ).rejects.toThrow('document changed');
});

it('uses stage-specific fallback errors and rejects failed restore responses', async () => {
  sendTabMessage.mockResolvedValueOnce({ success: false });
  const agent = createFullPagePageAgentTransport(
    { documentId: 'document-old', tabId: 7 },
    { sendTabMessage }
  );

  await expect(
    agent.prepareTile({
      ...identity,
      column: 0,
      firstColumn: true,
      firstRow: true,
      lastColumn: true,
      lastRow: true,
      row: 0,
      targetX: 0,
      targetY: 0,
    })
  ).rejects.toThrow('tile preparation');

  sendTabMessage.mockResolvedValueOnce({ success: false });
  await expect(agent.restore(identity)).rejects.toThrow('page restore failed');
});

it('rejects an unresolved page-agent request when capture is cancelled', async () => {
  sendTabMessage.mockReturnValue(new Promise(() => undefined));
  const agent = createFullPagePageAgentTransport(
    { documentId: 'document-active', tabId: 7 },
    { sendTabMessage }
  );
  const controller = new AbortController();
  const pending = agent.prepare(
    identity,
    {
      floatingElements: 'once',
      freezeMotion: true,
      preloadLazyContent: true,
    },
    controller.signal
  );

  controller.abort(new Error('capture cancelled'));

  await expect(pending).rejects.toThrow('capture cancelled');
});

it('uses the canonical cancellation error when an already-aborted signal has no reason', async () => {
  const agent = createFullPagePageAgentTransport(
    { documentId: 'document-active', tabId: 7 },
    { sendTabMessage }
  );
  const controller = new AbortController();
  controller.abort();
  Object.defineProperty(controller.signal, 'reason', { value: undefined });

  await expect(
    agent.prepare(
      identity,
      {
        floatingElements: 'once',
        freezeMotion: true,
        preloadLazyContent: true,
      },
      controller.signal
    )
  ).rejects.toThrow('Full-page capture cancelled');
  expect(sendTabMessage).not.toHaveBeenCalled();
});

it('uses the canonical cancellation error when an active signal aborts without a reason', async () => {
  sendTabMessage.mockReturnValue(new Promise(() => undefined));
  const controller = new AbortController();
  Object.defineProperty(controller.signal, 'reason', { value: undefined });
  const removeEventListener = vi.spyOn(controller.signal, 'removeEventListener');
  const agent = createFullPagePageAgentTransport(
    { documentId: 'document-active', tabId: 7 },
    { sendTabMessage }
  );
  const pending = agent.prepare(
    identity,
    {
      floatingElements: 'once',
      freezeMotion: true,
      preloadLazyContent: true,
    },
    controller.signal
  );

  controller.abort();

  await expect(pending).rejects.toThrow('Full-page capture cancelled');
  expect(removeEventListener).toHaveBeenCalled();
});

it('propagates a page-agent transport rejection without leaving its timeout active', async () => {
  const failure = new Error('content script disconnected');
  sendTabMessage.mockRejectedValue(failure);
  const agent = createFullPagePageAgentTransport(
    { documentId: 'document-active', tabId: 7 },
    { sendTabMessage }
  );

  await expect(
    agent.prepare(identity, {
      floatingElements: 'once',
      freezeMotion: true,
      preloadLazyContent: true,
    })
  ).rejects.toBe(failure);
});

it('bounds an unresolved tile response by the page-agent operation timeout', async () => {
  vi.useFakeTimers();
  sendTabMessage.mockReturnValue(new Promise(() => undefined));
  const agent = createFullPagePageAgentTransport(
    { documentId: 'document-active', tabId: 7 },
    { sendTabMessage }
  );
  const pending = agent.prepareTile({
    ...identity,
    column: 0,
    firstColumn: true,
    firstRow: true,
    lastColumn: true,
    lastRow: true,
    row: 0,
    targetX: 0,
    targetY: 0,
  });
  const rejection = expect(pending).rejects.toThrow('timed out during tile preparation');

  await vi.advanceTimersByTimeAsync(5_001);

  await rejection;
  vi.useRealTimers();
});
