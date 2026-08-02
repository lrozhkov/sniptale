import { beforeEach, expect, it, vi } from 'vitest';

const { readCompletionOutboxMock, sendRuntimeMessageMock } = vi.hoisted(() => ({
  readCompletionOutboxMock: vi.fn(),
  sendRuntimeMessageMock: vi.fn(),
}));

vi.mock('../../composition/persistence/recordings/completion-outbox', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../composition/persistence/recordings/completion-outbox')
  >()),
  readVideoRecordingCompletionOutbox: readCompletionOutboxMock,
}));

vi.mock('../../platform/runtime-messaging', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/runtime-messaging')>()),
  sendRuntimeMessage: sendRuntimeMessageMock,
}));

import {
  discardPendingPostRecordResult,
  hasPendingPostRecordResult,
  PostRecordPublicationError,
  retryPendingPostRecordResult,
  stageAndPublishPostRecordResult,
} from './post-record-publication';

const RESULT = {
  primaryRecordingId: 'rec-1-window-1',
  projectId: 'project-1',
  recordingId: 'rec-1',
};
const MESSAGING = { sendRuntimeMessage: sendRuntimeMessageMock };

beforeEach(() => {
  vi.clearAllMocks();
  readCompletionOutboxMock.mockResolvedValue(RESULT);
  discardPendingPostRecordResult('rec-1');
  discardPendingPostRecordResult('rec-2');
});

it('retains an exact saved result after rejection and republishes it without rewriting media', async () => {
  sendRuntimeMessageMock
    .mockResolvedValueOnce({ success: false, error: 'session storage failed' })
    .mockResolvedValueOnce({ success: true, result: 'accepted' });

  await expect(stageAndPublishPostRecordResult(RESULT, MESSAGING)).rejects.toBeInstanceOf(
    PostRecordPublicationError
  );
  expect(hasPendingPostRecordResult('rec-1')).toBe(true);

  await expect(retryPendingPostRecordResult('rec-1', MESSAGING)).resolves.toBe(true);
  expect(hasPendingPostRecordResult('rec-1')).toBe(false);
  expect(sendRuntimeMessageMock).toHaveBeenCalledTimes(2);
});

it('rehydrates publication from the durable outbox after module-memory loss', async () => {
  sendRuntimeMessageMock
    .mockRejectedValueOnce(new Error('offscreen terminated'))
    .mockResolvedValueOnce({ success: true, result: 'accepted' });

  await expect(stageAndPublishPostRecordResult(RESULT, MESSAGING)).rejects.toBeInstanceOf(
    PostRecordPublicationError
  );
  expect(discardPendingPostRecordResult('rec-1')).toBe(true);
  expect(hasPendingPostRecordResult('rec-1')).toBe(false);

  await expect(retryPendingPostRecordResult('rec-1', MESSAGING)).resolves.toBe(true);
  expect(readCompletionOutboxMock).toHaveBeenCalled();
});

it.each([
  { success: true },
  { success: true, result: 'stale' },
  { success: true, result: 'invented' },
])('retains the pending result when the success response is not exact: %o', async (response) => {
  sendRuntimeMessageMock.mockResolvedValueOnce(response);

  await expect(stageAndPublishPostRecordResult(RESULT, MESSAGING)).rejects.toBeInstanceOf(
    PostRecordPublicationError
  );
  expect(hasPendingPostRecordResult('rec-1')).toBe(true);
});

it.each(['discarded'] as const)(
  'retires a pending result after the background explicitly reports %s',
  async (result) => {
    sendRuntimeMessageMock.mockResolvedValueOnce({ success: true, result });

    await expect(stageAndPublishPostRecordResult(RESULT, MESSAGING)).resolves.toBeUndefined();
    expect(hasPendingPostRecordResult('rec-1')).toBe(false);
  }
);

it('retains the durable result when the background reports it as superseded', async () => {
  sendRuntimeMessageMock.mockResolvedValueOnce({ success: true, result: 'superseded' });

  await expect(stageAndPublishPostRecordResult(RESULT, MESSAGING)).rejects.toBeInstanceOf(
    PostRecordPublicationError
  );
  expect(hasPendingPostRecordResult('rec-1')).toBe(true);
});

it('converges after the background consumes the outbox but its accepted response is lost', async () => {
  sendRuntimeMessageMock.mockRejectedValueOnce(new Error('response channel closed'));

  await expect(stageAndPublishPostRecordResult(RESULT, MESSAGING)).rejects.toBeInstanceOf(
    PostRecordPublicationError
  );
  expect(hasPendingPostRecordResult('rec-1')).toBe(true);

  readCompletionOutboxMock.mockResolvedValueOnce(null);
  await expect(retryPendingPostRecordResult('rec-1', MESSAGING)).resolves.toBe(true);
  expect(sendRuntimeMessageMock).toHaveBeenCalledOnce();
  expect(hasPendingPostRecordResult('rec-1')).toBe(false);
});

it('shares one in-flight publication for replayed requests', async () => {
  let resolvePublication!: (value: { success: true; result: string }) => void;
  sendRuntimeMessageMock.mockReturnValueOnce(
    new Promise((resolve) => {
      resolvePublication = resolve;
    })
  );

  const first = stageAndPublishPostRecordResult(RESULT, MESSAGING);
  const replay = stageAndPublishPostRecordResult(RESULT, MESSAGING);
  await vi.waitFor(() => expect(sendRuntimeMessageMock).toHaveBeenCalledOnce());

  resolvePublication({ success: true, result: 'accepted' });
  await expect(Promise.all([first, replay])).resolves.toEqual([undefined, undefined]);
  expect(hasPendingPostRecordResult('rec-1')).toBe(false);
});

it('reports the same retryable error to every caller sharing a failed publication', async () => {
  sendRuntimeMessageMock.mockRejectedValueOnce(new Error('response channel closed'));

  const first = stageAndPublishPostRecordResult(RESULT, MESSAGING);
  const replay = stageAndPublishPostRecordResult(RESULT, MESSAGING);

  await expect(first).rejects.toBeInstanceOf(PostRecordPublicationError);
  await expect(replay).rejects.toBeInstanceOf(PostRecordPublicationError);
  expect(hasPendingPostRecordResult('rec-1')).toBe(true);
});

it('does not replace an unacknowledged result with another recording', async () => {
  sendRuntimeMessageMock.mockResolvedValueOnce({ success: false, error: 'storage failed' });
  await expect(stageAndPublishPostRecordResult(RESULT, MESSAGING)).rejects.toBeInstanceOf(
    PostRecordPublicationError
  );

  expect(() =>
    stageAndPublishPostRecordResult(
      {
        primaryRecordingId: 'rec-2',
        projectId: null,
        recordingId: 'rec-2',
      },
      MESSAGING
    )
  ).toThrow('Another post-record result');
  expect(discardPendingPostRecordResult('rec-1')).toBe(true);
});
