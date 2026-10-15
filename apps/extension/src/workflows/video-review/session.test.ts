import { expect, it, vi } from 'vitest';
import type { VideoWorkspaceSnapshot } from '../../composition/persistence/review-workspaces/contracts';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
import { createVideoReviewSession } from './session';
import type { ReviewOperation } from '../../features/video/review/types';
import { saveReviewSpeechTranscript } from './speech-publication';
import { parseVideoWorkspace } from '../../composition/persistence/review-workspaces/parser';

const annotation = { id: 'a', text: 'Comment', anchor: { kind: 'point' as const, time: 1 } };
it('reads an exact retained operation across Undo without writes; unavailable storage is not absence', async () => {
  const snapshot = initial();
  snapshot.workspace.history = [
    { id: 'retained', at: 1, target: 'annotation', before: null, after: annotation },
  ];
  const read = vi.fn(async (): Promise<VideoWorkspaceSnapshot | null> => snapshot);
  const write = vi.fn(async () => snapshot);
  const session = createVideoReviewSession(snapshot, {
    readVideoWorkspace: read,
    commitVideoWorkspace: write,
    moveVideoWorkspaceHistory: write,
    saveVideoWorkspaceAdvanced: write,
    saveVideoWorkspaceDraft: write,
    saveVideoWorkspaceSnapshot: write,
  });
  const operation = await session.readRetainedReviewOperation('retained');
  expect(operation?.id).toBe('retained');
  if (operation) operation.at = 999;
  expect(snapshot.workspace.history[0]?.at).toBe(1);
  expect(await session.readRetainedReviewOperation('absent')).toBeNull();
  read.mockResolvedValueOnce(null);
  await expect(session.readRetainedReviewOperation('retained')).rejects.toThrow('unavailable');
  read.mockRejectedValueOnce(new Error('storage inaccessible'));
  await expect(session.readRetainedReviewOperation('retained')).rejects.toThrow('inaccessible');
  expect(write).not.toHaveBeenCalled();
  expect(session.getSnapshot()).toMatchObject({ dirty: false, pending: 0 });
});
function initial(): VideoWorkspaceSnapshot {
  return {
    workspace: {
      aggregateId: 'recording:r',
      sourceAssetId: 'source',
      formatVersion: 1,
      source: { duration: 2, width: 640, height: 360, mimeType: 'video/webm', size: 5 },
      revision: 1,
      cursor: 0,
      history: [],
      advanced: createQuickEditAdvancedState(),
      createdAt: 1,
      updatedAt: 1,
    },
    draft: null,
  };
}

it('serializes draft then Save using the committed draft revision, without an extra history step', async () => {
  const snapshot = initial();
  const draft = { aggregateId: 'recording:r', annotation, before: null, revision: 4, updatedAt: 2 };
  const operation = {
    id: 'op',
    at: 2,
    target: 'annotation' as const,
    before: null,
    after: annotation,
  };
  const saved = {
    ...snapshot,
    workspace: { ...snapshot.workspace, revision: 2, cursor: 1, history: [operation] },
  };
  const deps = {
    saveVideoWorkspaceDraft: vi.fn(async () => ({ ...snapshot, draft })),
    saveVideoWorkspaceSnapshot: vi.fn(async () => structuredClone(snapshot)),
    saveVideoWorkspaceAdvanced: vi.fn(async () => snapshot),
    commitVideoWorkspace: vi.fn(async () => saved),
    readVideoWorkspace: vi.fn(async () => snapshot),
    moveVideoWorkspaceHistory: vi.fn(async () => snapshot),
  };
  const session = createVideoReviewSession(snapshot, deps);
  const listener = vi.fn();
  const unsubscribe = session.subscribe(listener);
  const pendingDraft = session.saveDraft(annotation, null);
  const pendingSave = session.commit(operation, true);
  expect(session.getSnapshot().pending).toBe(2);
  await Promise.all([pendingDraft, pendingSave]);
  expect(deps.commitVideoWorkspace).toHaveBeenCalledWith(
    expect.objectContaining({
      expectedRevision: 1,
      expectedSourceAssetId: 'source',
      consumeDraftRevision: 4,
    })
  );
  expect(session.getSnapshot().snapshot.workspace.history).toHaveLength(1);
  expect(session.getSnapshot().document.annotations).toEqual([annotation]);
  expect(session.getSnapshot().pending).toBe(0);
  expect(listener).toHaveBeenCalled();
  unsubscribe();
});

it('durably commits an explicit recording save while autosave stays disabled', async () => {
  const snapshot = initial();
  const operation = {
    id: 'voice-1',
    at: 2,
    target: 'annotation' as const,
    before: null,
    after: annotation,
  };
  const buffered = { ...snapshot, workspace: { ...snapshot.workspace, revision: 2 } };
  const committed = {
    ...buffered,
    workspace: { ...buffered.workspace, revision: 3, cursor: 1, history: [operation] },
  };
  const deps = {
    saveVideoWorkspaceDraft: vi.fn(async () => snapshot),
    saveVideoWorkspaceSnapshot: vi.fn(async () => buffered),
    saveVideoWorkspaceAdvanced: vi.fn(async () => snapshot),
    commitVideoWorkspace: vi.fn(async () => committed),
    readVideoWorkspace: vi.fn(async () => committed),
    moveVideoWorkspaceHistory: vi.fn(async () => committed),
  };
  const session = createVideoReviewSession(snapshot, deps);
  session.setAutosaveEnabled(false);
  await session.saveAdvanced(snapshot.workspace.advanced);
  expect(deps.saveVideoWorkspaceSnapshot).not.toHaveBeenCalled();
  await session.commitDurable(operation);
  expect(deps.saveVideoWorkspaceSnapshot).toHaveBeenCalledOnce();
  expect(deps.commitVideoWorkspace).toHaveBeenCalledWith(
    expect.objectContaining({ expectedRevision: 2, operation })
  );
  expect(session.getSnapshot()).toMatchObject({ autosaveEnabled: false, dirty: false });
});

it('keeps recovery and committed state after failed Save and exposes reload explicitly', async () => {
  const snapshot = initial();
  snapshot.draft = {
    aggregateId: 'recording:r',
    revision: 1,
    annotation,
    before: null,
    updatedAt: 2,
  };
  const deps = {
    saveVideoWorkspaceDraft: vi.fn(async () => snapshot),
    saveVideoWorkspaceSnapshot: vi.fn(async () => structuredClone(snapshot)),
    saveVideoWorkspaceAdvanced: vi.fn(async () => snapshot),
    commitVideoWorkspace: vi.fn(async () => {
      throw { code: 'conflict' };
    }),
    readVideoWorkspace: vi.fn(async () => snapshot),
    moveVideoWorkspaceHistory: vi.fn(async () => snapshot),
  };
  const session = createVideoReviewSession(snapshot, deps);
  await expect(
    session.commit({ id: 'op', at: 2, target: 'annotation', before: null, after: annotation }, true)
  ).rejects.toEqual({ code: 'conflict' });
  expect(session.getSnapshot()).toMatchObject({ error: 'conflict', pending: 0, snapshot });
  await expect(session.flush()).rejects.toThrow();
  await session.reload();
  await session.history('undo');
  expect(session.getSnapshot().error).toBeNull();
  expect(session.getSnapshot().snapshot.draft?.annotation.text).toBe('Comment');
});

it('saves advanced state through the revisioned queue and reports failures as codes', async () => {
  const snapshot = initial();
  const advanced = {
    ...createQuickEditAdvancedState(),
    ui: {
      mode: 'advanced' as const,
      tracks: { actions: true, zoom: true, audio: false },
      overlaysVisible: true,
    },
  };
  const saved = {
    ...snapshot,
    workspace: { ...snapshot.workspace, revision: 2, advanced },
  };
  const deps = {
    saveVideoWorkspaceDraft: vi.fn(async () => snapshot),
    saveVideoWorkspaceSnapshot: vi.fn(async () => structuredClone(snapshot)),
    saveVideoWorkspaceAdvanced: vi.fn(async () => saved),
    commitVideoWorkspace: vi.fn(async () => snapshot),
    readVideoWorkspace: vi.fn(async () => snapshot),
    moveVideoWorkspaceHistory: vi.fn(async () => snapshot),
  };
  const session = createVideoReviewSession(snapshot, deps);
  await session.saveAdvanced(advanced);
  expect(deps.saveVideoWorkspaceAdvanced).toHaveBeenCalledWith(
    expect.objectContaining({
      aggregateId: 'recording:r',
      expectedRevision: 1,
      expectedSourceAssetId: 'source',
      advanced,
    })
  );
  expect(session.getSnapshot().snapshot.workspace.advanced).toEqual(advanced);
  expect(session.getSnapshot().error).toBeNull();
});

it('propagates an advanced save failure as a session error', async () => {
  const snapshot = initial();
  const deps = {
    saveVideoWorkspaceDraft: vi.fn(async () => snapshot),
    saveVideoWorkspaceSnapshot: vi.fn(async () => structuredClone(snapshot)),
    saveVideoWorkspaceAdvanced: vi.fn(async () => {
      throw { code: 'invalid' };
    }),
    commitVideoWorkspace: vi.fn(async () => snapshot),
    readVideoWorkspace: vi.fn(async () => snapshot),
    moveVideoWorkspaceHistory: vi.fn(async () => snapshot),
  };
  const session = createVideoReviewSession(snapshot, deps);
  await expect(session.saveAdvanced({ broken: true })).rejects.toMatchObject({ code: 'invalid' });
  expect(session.getSnapshot()).toMatchObject({ error: 'invalid', pending: 0 });
});

it('keeps paused draft, history and advanced edits local, then atomically resumes', async () => {
  const snapshot = initial();
  const deps = {
    saveVideoWorkspaceDraft: vi.fn(),
    saveVideoWorkspaceAdvanced: vi.fn(),
    commitVideoWorkspace: vi.fn(),
    moveVideoWorkspaceHistory: vi.fn(),
    readVideoWorkspace: vi.fn(async () => snapshot),
    saveVideoWorkspaceSnapshot: vi.fn(async (args: { workspace: unknown; draft: unknown }) => {
      const { parseVideoWorkspace } =
        await import('../../composition/persistence/review-workspaces/parser');
      const workspace = parseVideoWorkspace(args.workspace)!;
      return { workspace: { ...workspace, revision: 2 }, draft: null };
    }),
  };
  const session = createVideoReviewSession(snapshot, deps);
  session.setAutosaveEnabled(false);
  await session.saveDraft(annotation, null);
  await session.commit(
    { id: 'paused', at: 2, target: 'annotation', before: null, after: annotation },
    true
  );
  await session.history('undo');
  expect(session.getSnapshot().document.annotations).toEqual([]);
  await session.history('redo');
  await session.saveAdvanced({
    ...snapshot.workspace.advanced,
    ui: { ...snapshot.workspace.advanced.ui, mode: 'advanced' },
  });
  await session.flush();
  expect(session.getSnapshot()).toMatchObject({ dirty: true, autosaveEnabled: false });
  for (const fn of [
    deps.saveVideoWorkspaceDraft,
    deps.commitVideoWorkspace,
    deps.moveVideoWorkspaceHistory,
    deps.saveVideoWorkspaceAdvanced,
    deps.saveVideoWorkspaceSnapshot,
  ])
    expect(fn).not.toHaveBeenCalled();
  session.setAutosaveEnabled(true);
  await session.flush();
  expect(deps.saveVideoWorkspaceSnapshot).toHaveBeenCalledWith(
    expect.objectContaining({ expectedRevision: 1, expectedDraftRevision: null, draft: null })
  );
  expect(session.getSnapshot()).toMatchObject({ dirty: false, autosaveEnabled: true });
  expect(session.getSnapshot().document.annotations).toEqual([annotation]);
});

it.each(['conflict', 'storage'])('retains the paused buffer after %s on resume', async (code) => {
  const snapshot = initial();
  const deps = {
    saveVideoWorkspaceDraft: vi.fn(),
    saveVideoWorkspaceAdvanced: vi.fn(),
    commitVideoWorkspace: vi.fn(),
    moveVideoWorkspaceHistory: vi.fn(),
    readVideoWorkspace: vi.fn(async () => snapshot),
    saveVideoWorkspaceSnapshot: vi.fn(async () => {
      throw { code };
    }),
  };
  const session = createVideoReviewSession(snapshot, deps);
  session.setAutosaveEnabled(false);
  await session.saveDraft(annotation, null);
  session.setAutosaveEnabled(true);
  await expect(session.flush()).rejects.toThrow();
  expect(session.getSnapshot()).toMatchObject({
    dirty: true,
    error: code,
    snapshot: { draft: { annotation } },
  });
  await session.reload();
  expect(session.getSnapshot()).toMatchObject({ dirty: false, error: null, snapshot });
});

it('cancels queued resume when paused again before its write starts', async () => {
  const snapshot = initial();
  const deps = {
    saveVideoWorkspaceDraft: vi.fn(),
    saveVideoWorkspaceAdvanced: vi.fn(),
    commitVideoWorkspace: vi.fn(),
    moveVideoWorkspaceHistory: vi.fn(),
    readVideoWorkspace: vi.fn(async () => snapshot),
    saveVideoWorkspaceSnapshot: vi.fn(),
  };
  const session = createVideoReviewSession(snapshot, deps);
  session.setAutosaveEnabled(false);
  await session.saveDraft(annotation, null);
  session.setAutosaveEnabled(true);
  session.setAutosaveEnabled(false);
  await session.flush();
  expect(deps.saveVideoWorkspaceSnapshot).not.toHaveBeenCalled();
  expect(session.getSnapshot().dirty).toBe(true);
});

it('keeps an existing conflict visible when autosave is toggled without a local buffer', async () => {
  const snapshot = initial();
  const deps = {
    saveVideoWorkspaceDraft: vi.fn(async () => {
      throw { code: 'conflict' };
    }),
    saveVideoWorkspaceAdvanced: vi.fn(),
    commitVideoWorkspace: vi.fn(),
    moveVideoWorkspaceHistory: vi.fn(),
    readVideoWorkspace: vi.fn(),
    saveVideoWorkspaceSnapshot: vi.fn(),
  };
  const session = createVideoReviewSession(snapshot, deps);
  await expect(session.saveDraft(annotation, null)).rejects.toEqual({ code: 'conflict' });
  session.setAutosaveEnabled(false);
  session.setAutosaveEnabled(true);
  expect(session.getSnapshot().error).toBe('conflict');
  expect(deps.saveVideoWorkspaceSnapshot).not.toHaveBeenCalled();
});

it('retries the same failed speech save using fresh queued history and durable revision', async () => {
  const snapshot = initial();
  snapshot.workspace.advanced.audio.voiceover = [
    {
      id: 'voice',
      assetId: 'project-asset:original',
      timelineStart: 0,
      sourceOffset: 0,
      duration: 2,
      volume: 1,
      muted: false,
      fadeIn: 0,
      fadeOut: 0,
    },
  ];
  let stored = snapshot;
  const commitVideoWorkspace = vi.fn(
    async (
      args: Parameters<
        typeof import('../../composition/persistence/review-workspaces/store').commitVideoWorkspace
      >[0]
    ) => {
      stored = {
        ...stored,
        workspace: {
          ...stored.workspace,
          revision: stored.workspace.revision + 1,
          history: [...stored.workspace.history, args.operation as ReviewOperation],
          cursor: stored.workspace.cursor + 1,
        },
      };
      return stored;
    }
  );
  commitVideoWorkspace.mockRejectedValueOnce(new Error('storage failed'));
  const deps = {
    saveVideoWorkspaceDraft: vi.fn(async () => stored),
    saveVideoWorkspaceSnapshot: vi.fn(async () => stored),
    saveVideoWorkspaceAdvanced: vi.fn(async () => stored),
    commitVideoWorkspace,
    readVideoWorkspace: vi.fn(async () => stored),
    moveVideoWorkspaceHistory: vi.fn(async () => stored),
  };
  const session = createVideoReviewSession(snapshot, deps);
  const transcript = {
    version: 1 as const,
    phrases: [],
    replacements: [],
    profile: { modelId: 'model', voiceId: 'voice', responseFormat: 'wav' as const },
  };
  await expect(
    saveReviewSpeechTranscript(session, { kind: 'voiceover', clipId: 'voice' }, transcript)
  ).rejects.toThrow('storage failed');
  await expect(session.flush()).rejects.toThrow('storage');
  await saveReviewSpeechTranscript(session, { kind: 'voiceover', clipId: 'voice' }, transcript);
  await expect(session.flush()).resolves.toBeUndefined();
  expect(session.getSnapshot().document.advancedContent.audio.voiceover[0]?.transcript).toEqual(
    transcript
  );
  expect(commitVideoWorkspace).toHaveBeenCalledTimes(2);
  expect(commitVideoWorkspace.mock.calls[1]?.[0].expectedRevision).toBe(1);
  expect(stored.workspace.history).toHaveLength(1);
  await saveReviewSpeechTranscript(
    session,
    { kind: 'voiceover', clipId: 'voice' },
    structuredClone(transcript)
  );
  await saveReviewSpeechTranscript(
    session,
    { kind: 'voiceover', clipId: 'voice' },
    {
      ...transcript,
      profile: { responseFormat: 'wav', voiceId: 'voice', modelId: 'model' },
    }
  );
  expect(commitVideoWorkspace).toHaveBeenCalledTimes(2);
  expect(stored.workspace.history).toHaveLength(1);
  deps.moveVideoWorkspaceHistory.mockRejectedValueOnce(new Error('history failed'));
  await expect(session.history('undo')).rejects.toThrow('history failed');
  await expect(
    saveReviewSpeechTranscript(session, { kind: 'voiceover', clipId: 'voice' }, transcript)
  ).rejects.toThrow('storage');
  await expect(
    saveReviewSpeechTranscript(session, { kind: 'voiceover', clipId: 'voice' }, transcript)
  ).rejects.toThrow('storage');
  expect(commitVideoWorkspace).toHaveBeenCalledTimes(2);
});

it('queues original transcript saves with latest manual gain and preserves history-only accepted speech', async () => {
  const { reviewSpeechTextSignature } =
    await import('../../features/video/review/speech-transcript');
  const snapshot = initial();
  snapshot.workspace.advanced.audio.original.volume = 0.4;
  let stored = structuredClone(snapshot);
  const commitVideoWorkspace = vi.fn(
    async (
      args: Parameters<
        typeof import('../../composition/persistence/review-workspaces/store').commitVideoWorkspace
      >[0]
    ) => {
      stored = {
        ...stored,
        workspace: {
          ...stored.workspace,
          revision: stored.workspace.revision + 1,
          cursor: stored.workspace.cursor + 1,
          history: [...stored.workspace.history, args.operation as ReviewOperation],
        },
      };
      return stored;
    }
  );
  const deps = {
    saveVideoWorkspaceDraft: vi.fn(async () => stored),
    saveVideoWorkspaceSnapshot: vi.fn(async () => stored),
    saveVideoWorkspaceAdvanced: vi.fn(async () => stored),
    commitVideoWorkspace,
    readVideoWorkspace: vi.fn(async () => stored),
    moveVideoWorkspaceHistory: vi.fn(async () => stored),
  };
  const session = createVideoReviewSession(snapshot, deps);
  const profile = { modelId: 'm', voiceId: 'v', responseFormat: 'wav' as const };
  const replacement = {
    id: 'replacement',
    assetId: 'project-asset:generated',
    phraseId: 'phrase',
    revision: 0,
    start: 0,
    end: 1,
    duration: 0.8,
    text: 'word',
    profile,
    textSignature: reviewSpeechTextSignature('word', profile),
    enabled: false,
    originalVolume: 0.25,
  };
  const transcript = { version: 1 as const, phrases: [], replacements: [replacement] };
  await session.saveSpeechTranscript({ kind: 'original' }, 'source', transcript);
  expect(commitVideoWorkspace).toHaveBeenCalledTimes(1);
  expect(session.getSnapshot().document.advancedContent.audio.original.volume).toBe(0.4);
  expect(
    session.getSnapshot().document.advancedContent.audio.originalSpeech?.transcript.replacements
  ).toEqual([replacement]);
  await session.saveSpeechTranscript({ kind: 'original' }, 'source', {
    ...transcript,
    replacements: [],
  });
  expect(
    await session.hasDurableSpeechAsset(
      { kind: 'original' },
      'replacement',
      'project-asset:generated'
    )
  ).toBe(true);
  expect(
    await session.hasDurableSpeechAsset({ kind: 'original' }, 'other', 'project-asset:generated')
  ).toBe(false);
  await expect(
    session.saveSpeechTranscript({ kind: 'original' }, 'other', transcript)
  ).rejects.toThrow('changed');
});

it('explicit buffer Save drains earlier edits without a synthetic operation or enabling autosave', async () => {
  const snapshot = initial();
  const saveSnapshot = vi.fn(async (args: { workspace: unknown; draft: unknown }) => {
    const { parseVideoWorkspace, parseVideoWorkspaceDraft } =
      await import('../../composition/persistence/review-workspaces/parser');
    const workspace = parseVideoWorkspace(args.workspace)!;
    return {
      workspace: { ...workspace, revision: 2 },
      draft: parseVideoWorkspaceDraft(args.draft, workspace.source.duration),
    };
  });
  const session = createVideoReviewSession(snapshot, {
    saveVideoWorkspaceSnapshot: saveSnapshot,
    saveVideoWorkspaceDraft: vi.fn(async () => snapshot),
    saveVideoWorkspaceAdvanced: vi.fn(async () => snapshot),
    commitVideoWorkspace: vi.fn(async () => snapshot),
    readVideoWorkspace: vi.fn(async () => snapshot),
    moveVideoWorkspaceHistory: vi.fn(async () => snapshot),
  });
  session.setAutosaveEnabled(false);
  const draft = session.saveDraft(annotation, null);
  const advanced = session.saveAdvanced({
    ...snapshot.workspace.advanced,
    ui: { ...snapshot.workspace.advanced.ui, mode: 'advanced' },
  });
  const saved = await session.saveBuffered();
  await Promise.all([draft, advanced]);
  expect(saveSnapshot).toHaveBeenCalledOnce();
  expect(saved.workspace).toMatchObject({ revision: 2, history: [], cursor: 0 });
  expect(saved.draft?.annotation).toEqual(annotation);
  expect(session.getSnapshot()).toMatchObject({ dirty: false, autosaveEnabled: false, pending: 0 });
  await session.saveBuffered();
  expect(saveSnapshot).toHaveBeenCalledOnce();
});

it('keeps source mute autosave payload independent of unchanged text and preserves replay on reopen', async () => {
  let stored = initial();
  stored.workspace.advanced.text = {
    version: 1,
    fragments: Array.from({ length: 200 }, (_, index) => ({
      id: `text-${index}`,
      start: index / 100,
      end: (index + 1) / 100,
      text: 'Synthetic unchanged content '.repeat(20),
      originalText: '',
      revision: 0,
      timingRevision: 0,
      timeDomain: 'result' as const,
      alignment: 'manual' as const,
      showInVideo: false,
    })),
  };
  const unchangedText = structuredClone(stored.workspace.advanced.text);
  const read = vi.fn(async () => structuredClone(stored));
  const commit = vi.fn(async (request: { operation: unknown; expectedRevision: number }) => {
    expect(request.expectedRevision).toBe(stored.workspace.revision);
    const workspace = parseVideoWorkspace({
      ...stored.workspace,
      history: [...stored.workspace.history.slice(0, stored.workspace.cursor), request.operation],
      cursor: stored.workspace.cursor + 1,
      revision: stored.workspace.revision + 1,
      updatedAt: Date.now(),
    });
    if (!workspace) throw new Error('Invalid committed test workspace');
    stored = { workspace, draft: stored.draft };
    return structuredClone(stored);
  });
  const deps = {
    readVideoWorkspace: read,
    commitVideoWorkspace: commit,
    moveVideoWorkspaceHistory: read,
    saveVideoWorkspaceAdvanced: read,
    saveVideoWorkspaceDraft: read,
    saveVideoWorkspaceSnapshot: read,
  };
  const session = createVideoReviewSession(stored, deps);
  const before = session.getSnapshot().document.advancedContent;
  const acknowledge = vi.fn();
  const fail = vi.fn();
  session.stageAutosave(
    'content',
    () => ({
      change: {
        kind: 'content',
        content: {
          ...before,
          audio: { ...before.audio, original: { ...before.audio.original, muted: true } },
        },
      },
      acknowledge,
      fail,
    }),
    { delay: 250 }
  );
  await session.flush();
  const operation = stored.workspace.history[0];
  expect(new TextEncoder().encode(JSON.stringify(operation)).byteLength).toBeLessThan(300);
  expect(operation).toMatchObject({
    target: 'sourceAudio',
    before: { muted: false, volume: 1 },
    after: { muted: true, volume: 1 },
  });
  expect(acknowledge).toHaveBeenCalledOnce();
  expect(fail).not.toHaveBeenCalled();
  const reopened = createVideoReviewSession(structuredClone(stored), deps);
  expect(reopened.getSnapshot().document.advancedContent.audio.original.muted).toBe(true);
  expect(reopened.getSnapshot().document.advancedContent.text).toEqual(unchangedText);
  expect(stored.workspace.history).toHaveLength(1);
});

it.each([true, false])(
  'refuses locked lane commands before writes and keeps Notes usable (autosave %s)',
  async (autosave) => {
    const snapshot = initial();
    snapshot.workspace.advanced.ui.lockedTracks = { source: true, originalAudio: true };
    const write = vi.fn(async () => snapshot);
    const session = createVideoReviewSession(snapshot, {
      readVideoWorkspace: async () => snapshot,
      commitVideoWorkspace: write,
      saveVideoWorkspaceAdvanced: write,
      saveVideoWorkspaceDraft: write,
      saveVideoWorkspaceSnapshot: write,
      moveVideoWorkspaceHistory: write,
    });
    session.setAutosaveEnabled(autosave);
    const audio: ReviewOperation = {
      id: 'gain',
      at: 2,
      target: 'sourceAudio',
      before: { muted: false, volume: 1 },
      after: { muted: true, volume: 1 },
    };
    await expect(session.commit(audio)).rejects.toThrow('originalAudio');
    const attempted = vi.fn();
    await expect(session.commitDurable(audio, attempted)).rejects.toThrow('originalAudio');
    expect(attempted).not.toHaveBeenCalled();
    const before = session.getSnapshot().document.advancedContent;
    await expect(
      session.commit({
        id: 'compound',
        at: 3,
        target: 'advancedContent',
        before,
        after: {
          ...before,
          actionsEnabled: false,
          audio: { ...before.audio, original: { ...before.audio.original, volume: 0.5 } },
        },
      })
    ).rejects.toThrow('originalAudio');
    expect(session.getSnapshot().document.advancedContent).toEqual(before);
    expect(write).not.toHaveBeenCalled();
    expect(session.getSnapshot()).toMatchObject({ error: null, pending: 0, dirty: false });
    await session.commit({
      id: 'note',
      at: 3,
      target: 'annotation',
      before: null,
      after: annotation,
    });
    expect(session.getSnapshot().error).toBeNull();
    if (!autosave) expect(session.getSnapshot().document.annotations).toEqual([annotation]);
    await session.flush();
  }
);

it('changes a master atomically while content Undo preserves lane membership', async () => {
  const snapshot = initial();
  snapshot.workspace.advanced.ui.mode = 'advanced';
  const write = vi.fn(async () => snapshot);
  const session = createVideoReviewSession(snapshot, {
    readVideoWorkspace: async () => snapshot,
    commitVideoWorkspace: write,
    saveVideoWorkspaceAdvanced: write,
    saveVideoWorkspaceDraft: write,
    saveVideoWorkspaceSnapshot: write,
    moveVideoWorkspaceHistory: write,
  });
  session.setAutosaveEnabled(false);
  await session.setTrackControl('actions', { locked: true });
  await session.setTrackControl('actions', { enabled: false });
  expect(session.getSnapshot().snapshot.workspace.advanced.ui).toMatchObject({
    lockedTracks: { actions: true },
    tracks: { actions: false },
  });
  expect(session.getSnapshot().document.advancedContent.actionsEnabled).toBe(false);
  await session.setTrackControl('actions', { enabled: true });
  expect(session.getSnapshot().document.advancedContent.actionsEnabled).toBe(true);
  await session.history('undo');
  expect(session.getSnapshot().document.advancedContent.actionsEnabled).toBe(false);
  expect(session.getSnapshot().snapshot.workspace.advanced.ui.tracks.actions).toBe(true);
  await session.history('redo');
  expect(session.getSnapshot().snapshot.workspace.advanced.ui.tracks.actions).toBe(true);
  expect(session.getSnapshot().document.advancedContent.actionsEnabled).toBe(true);
  expect(session.getSnapshot().snapshot.workspace.advanced.ui.lockedTracks?.actions).toBe(true);
  expect(write).not.toHaveBeenCalled();
});
