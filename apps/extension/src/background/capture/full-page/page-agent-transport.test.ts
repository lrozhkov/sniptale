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
