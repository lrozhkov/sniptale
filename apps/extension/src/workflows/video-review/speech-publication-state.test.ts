import { expect, it } from 'vitest';
import { createRecognitionFixture } from './recognition.test-support';
import { reviewSpeechPublicationBasis } from './speech-publication-state';

function publication(session: ReturnType<typeof createRecognitionFixture>['session']) {
  const state = session.getSnapshot();
  const target = { kind: 'original' as const };
  return [
    {
      target,
      ...reviewSpeechPublicationBasis(state.snapshot, state.document, target),
      transcript: {
        version: 1 as const,
        phrases: [
          {
            id: 'phrase',
            start: 0,
            end: 1,
            originalText: 'Synthetic.',
            text: 'Synthetic.',
            revision: 0,
            alignment: 'range' as const,
          },
        ],
        replacements: [],
      },
    },
  ];
}

it('recovers a lost commit acknowledgement without appending a second speech action', async () => {
  const { session, deps } = createRecognitionFixture(2);
  const changes = publication(session);
  const receipt = session.createSpeechPublicationReceipt();
  const commit = deps.commitVideoWorkspace.getMockImplementation()!;
  deps.commitVideoWorkspace.mockImplementationOnce(async (request) => {
    await commit(request);
    throw new Error('lost acknowledgement');
  });
  await expect(session.publishSpeechTranscripts(changes, receipt)).rejects.toThrow(
    'lost acknowledgement'
  );
  await session.publishSpeechTranscripts(changes, receipt);
  expect(deps.commitVideoWorkspace).toHaveBeenCalledOnce();
  expect(session.getSnapshot().snapshot.workspace.history.map((op) => op.id)).toEqual([receipt.id]);
  expect(session.getSnapshot().error).toBeNull();
  expect(session.getSnapshot().pending).toBe(0);
});

it('rebases only unrelated buffered changes after recovering the accepted publication', async () => {
  const { session, deps } = createRecognitionFixture(2);
  const changes = publication(session);
  const receipt = session.createSpeechPublicationReceipt();
  const commit = deps.commitVideoWorkspace.getMockImplementation()!;
  deps.commitVideoWorkspace.mockImplementationOnce(async (request) => {
    await commit(request);
    throw new Error('lost acknowledgement');
  });
  await expect(session.publishSpeechTranscripts(changes, receipt)).rejects.toThrow();
  await session.commit({
    id: 'own-gain',
    at: 2,
    target: 'sourceAudio',
    before: { muted: false, volume: 1 },
    after: { muted: false, volume: 0.5 },
  });
  await session.publishSpeechTranscripts(changes, receipt);
  expect(session.getSnapshot().dirty).toBe(true);
  expect(session.getSnapshot().document.advancedContent.audio.original.volume).toBe(0.5);
  expect(
    session.getSnapshot().document.advancedContent.audio.originalSpeech?.transcript.phrases
  ).toHaveLength(1);
  await session.saveBuffered();
  expect(deps.saveVideoWorkspaceSnapshot.mock.lastCall?.[0].expectedRevision).toBe(2);
  expect(session.getSnapshot().snapshot.workspace.history.map((op) => op.id)).toEqual([
    receipt.id,
    'own-gain',
  ]);
  await session.history('undo');
  expect(session.getSnapshot().document.advancedContent.audio.original.volume).toBe(1);
  expect(
    session.getSnapshot().document.advancedContent.audio.originalSpeech?.transcript.phrases
  ).toHaveLength(1);
});

it('retains a conflicting local timing draft instead of acknowledging over it', async () => {
  const { session, deps } = createRecognitionFixture(2);
  const changes = publication(session);
  const receipt = session.createSpeechPublicationReceipt();
  const commit = deps.commitVideoWorkspace.getMockImplementation()!;
  deps.commitVideoWorkspace.mockImplementationOnce(async (request) => {
    await commit(request);
    throw new Error('lost acknowledgement');
  });
  await expect(session.publishSpeechTranscripts(changes, receipt)).rejects.toThrow();
  await session.commit({
    id: 'own-cut',
    at: 2,
    target: 'edit',
    before: null,
    after: { id: 'cut', kind: 'cut', start: 0.5, end: 1, requestedStart: 0.5, requestedEnd: 1 },
  });
  await expect(session.publishSpeechTranscripts(changes, receipt)).rejects.toThrow('conflicts');
  expect(session.getSnapshot().dirty).toBe(true);
  expect(session.getSnapshot().document.edits[0]?.id).toBe('cut');
  expect(deps.commitVideoWorkspace).toHaveBeenCalledOnce();
});

it('rebases both sides of an unrelated buffered content action without merging the speech intent', async () => {
  const { session, deps } = createRecognitionFixture(2);
  const changes = publication(session);
  const receipt = session.createSpeechPublicationReceipt();
  const commit = deps.commitVideoWorkspace.getMockImplementation()!;
  deps.commitVideoWorkspace.mockImplementationOnce(async (request) => {
    await commit(request);
    throw new Error('lost acknowledgement');
  });
  await expect(session.publishSpeechTranscripts(changes, receipt)).rejects.toThrow();
  const before = session.getSnapshot().document.advancedContent;
  await session.commit({
    id: 'own-content',
    at: 2,
    target: 'advancedContent',
    before,
    after: {
      ...before,
      audio: { ...before.audio, original: { ...before.audio.original, volume: 0.5 } },
    },
  });
  await session.publishSpeechTranscripts(changes, receipt);
  expect(session.getSnapshot().document.advancedContent.audio.original.volume).toBe(0.5);
  await session.saveBuffered();
  await session.history('undo');
  expect(session.getSnapshot().document.advancedContent.audio.original.volume).toBe(1);
  expect(
    session.getSnapshot().document.advancedContent.audio.originalSpeech?.transcript.phrases
  ).toHaveLength(1);
  await session.history('redo');
  expect(session.getSnapshot().document.advancedContent.audio.original.volume).toBe(0.5);
});

it('rejects an expired receipt absent from a changed canonical revision', async () => {
  const { session, deps } = createRecognitionFixture(2);
  const changes = publication(session);
  const receipt = session.createSpeechPublicationReceipt();
  deps.commitVideoWorkspace.mockRejectedValueOnce(new Error('ambiguous'));
  await expect(session.publishSpeechTranscripts(changes, receipt)).rejects.toThrow();
  const read = deps.readVideoWorkspace.getMockImplementation()!;
  deps.readVideoWorkspace.mockImplementationOnce(async () => {
    const stored = (await read())!;
    return {
      ...stored,
      workspace: { ...stored.workspace, revision: stored.workspace.revision + 2 },
    };
  });
  await expect(session.publishSpeechTranscripts(changes, receipt)).rejects.toThrow('stale');
  expect(deps.commitVideoWorkspace).toHaveBeenCalledOnce();
});

it('refuses to adopt a receipt retained under a different source generation', async () => {
  const { session, deps } = createRecognitionFixture(2);
  const changes = publication(session);
  const receipt = session.createSpeechPublicationReceipt();
  const commit = deps.commitVideoWorkspace.getMockImplementation()!;
  deps.commitVideoWorkspace.mockImplementationOnce(async (request) => {
    await commit(request);
    throw new Error('lost acknowledgement');
  });
  await expect(session.publishSpeechTranscripts(changes, receipt)).rejects.toThrow();
  const read = deps.readVideoWorkspace.getMockImplementation()!;
  deps.readVideoWorkspace.mockImplementationOnce(async () => {
    const canonical = (await read())!;
    return {
      ...canonical,
      workspace: { ...canonical.workspace, sourceAssetId: 'different-source' },
    };
  });
  await expect(session.publishSpeechTranscripts(changes, receipt)).rejects.toThrow('stale');
  expect(session.getSnapshot().snapshot.workspace.sourceAssetId).toBe('source');
  expect(deps.commitVideoWorkspace).toHaveBeenCalledOnce();
});

it('retries a proven uncommitted publication with the same action identity', async () => {
  const { session, deps } = createRecognitionFixture(2);
  const changes = publication(session);
  const receipt = session.createSpeechPublicationReceipt();
  deps.commitVideoWorkspace.mockRejectedValueOnce(new Error('disk-full'));
  await expect(session.publishSpeechTranscripts(changes, receipt)).rejects.toThrow('disk-full');
  await session.publishSpeechTranscripts(changes, receipt);
  expect(deps.commitVideoWorkspace).toHaveBeenCalledTimes(2);
  for (const [request] of deps.commitVideoWorkspace.mock.calls)
    expect(request.operation).toMatchObject({ id: receipt.id });
  expect(session.getSnapshot().snapshot.workspace.history).toHaveLength(1);
});

it('checks queued target edits and rejects foreign receipt objects', async () => {
  const { session, deps } = createRecognitionFixture(2);
  const changes = publication(session);
  const receipt = session.createSpeechPublicationReceipt();
  await session.commit({
    id: 'cut',
    at: 2,
    target: 'edit',
    before: null,
    after: { id: 'cut', kind: 'cut', start: 0.5, end: 1, requestedStart: 0.5, requestedEnd: 1 },
  });
  await expect(session.publishSpeechTranscripts(changes, receipt)).rejects.toThrow('stale');
  await expect(session.publishSpeechTranscripts(changes, { ...receipt })).rejects.toThrow(
    'receipt'
  );
  expect(deps.commitVideoWorkspace).not.toHaveBeenCalled();
});
