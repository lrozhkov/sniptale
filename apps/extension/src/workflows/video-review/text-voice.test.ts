import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  applyReviewTextVoice,
  cleanupReviewTextVoicePreview,
  generateReviewTextVoice,
  prepareReviewTextVoiceBatch,
} from './text-voice';
import { createVideoReviewSession } from './session';
import type { VideoWorkspaceSnapshot } from '../../composition/persistence/review-workspaces/contracts';
import {
  parseVideoWorkspace,
  parseVideoWorkspaceDraft,
} from '../../composition/persistence/review-workspaces/parser';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
import {
  addReviewTextFragment,
  createReviewTextDocument,
} from '../../features/video/review/text-document';
import {
  applyReviewOperation,
  replayReviewHistory,
  reviewAdvancedContentBaseline,
} from '../../features/video/review/document';
import { parseReviewOperation } from '../../features/video/review/validation';
import { projectReviewVoiceover } from '../../features/video/review/voiceover-edits';
import { buildReviewTimeMap } from '../../features/video/review/timeline';
import { originalAudioRangeViews } from '../../features/video/review/advanced/original-audio-mutes';

const mocks = vi.hoisted(() => ({
  job: vi.fn(),
  read: vi.fn(),
  discard: vi.fn(),
  decode: vi.fn(),
  prepare: vi.fn(),
  event: vi.fn(),
}));
vi.mock('../audio-jobs/client', () => ({ runReviewSpeechJob: mocks.job }));
vi.mock('./speech-audio', () => ({ decodeReviewSpeechDuration: mocks.decode }));
vi.mock('../../composition/persistence/assets/audio-staging', () => ({
  readAudioStaging: mocks.read,
  discardAudioStaging: mocks.discard,
}));
vi.mock('../../composition/persistence/projects', () => ({ prepareProjectAsset: mocks.prepare }));
vi.mock('../../features/media-hub/events', () => ({ publishMediaHubLibraryChanged: mocks.event }));
const profile = { modelId: 'model', voiceId: 'voice', responseFormat: 'mp3' as const };
const approvedSelection = {
  modelId: 'model',
  approvedProviderId: 'provider',
  approvedModelCode: 'speech',
  approvedDestination: `sha256:${'a'.repeat(64)}`,
};
const signal = () => new AbortController().signal;
let decodedDuration = 2;

function fixture(timeDomain: 'source' | 'result' = 'result') {
  const advanced = createQuickEditAdvancedState();
  const added = addReviewTextFragment(createReviewTextDocument(), {
    id: 'text',
    text: 'Authored narration',
    start: 1,
    end: 2,
    timeDomain,
  });
  if (!added.ok) throw new Error('fixture');
  advanced.text = added.document;
  let saved: VideoWorkspaceSnapshot = {
    workspace: {
      aggregateId: 'video',
      sourceAssetId: 'video-source',
      formatVersion: 1,
      revision: 1,
      source: { duration: 10, width: 640, height: 360, mimeType: 'video/webm', size: 5 },
      advanced,
      history: [],
      cursor: 0,
      createdAt: 1,
      updatedAt: 1,
    },
    draft: null,
  };
  type Deps = NonNullable<Parameters<typeof createVideoReviewSession>[1]>;
  const saveSnapshot = vi.fn<Deps['saveVideoWorkspaceSnapshot']>(async (args) => {
    const workspace = parseVideoWorkspace(args.workspace);
    if (!workspace || args.expectedRevision !== saved.workspace.revision)
      throw new Error('conflict');
    saved = {
      workspace: { ...workspace, revision: saved.workspace.revision + 1 },
      draft:
        args.draft == null ? null : parseVideoWorkspaceDraft(args.draft, workspace.source.duration),
    };
    return structuredClone(saved);
  });
  const commit = vi.fn<Deps['commitVideoWorkspace']>(async (args) => {
    const operation = parseReviewOperation(args.operation, saved.workspace.source.duration);
    if (!operation || args.expectedRevision !== saved.workspace.revision)
      throw new Error('conflict');
    const document = replayReviewHistory(
      saved.workspace.history,
      saved.workspace.cursor,
      saved.workspace.source,
      reviewAdvancedContentBaseline(saved.workspace.advanced)
    );
    applyReviewOperation(document, operation, saved.workspace.source);
    saved = {
      ...saved,
      workspace: {
        ...saved.workspace,
        revision: saved.workspace.revision + 1,
        history: [...saved.workspace.history.slice(0, saved.workspace.cursor), operation],
        cursor: saved.workspace.cursor + 1,
      },
    };
    return structuredClone(saved);
  });
  const read = vi.fn<Deps['readVideoWorkspace']>(async () => structuredClone(saved));
  const session = createVideoReviewSession(structuredClone(saved), {
    saveVideoWorkspaceSnapshot: saveSnapshot,
    commitVideoWorkspace: commit,
    readVideoWorkspace: read,
    saveVideoWorkspaceDraft: vi.fn(async () => saved),
    saveVideoWorkspaceAdvanced: vi.fn(async () => saved),
    moveVideoWorkspaceHistory: vi.fn(async ({ direction }) => {
      saved = {
        ...saved,
        workspace: {
          ...saved.workspace,
          revision: saved.workspace.revision + 1,
          cursor: saved.workspace.cursor + (direction === 'undo' ? -1 : 1),
        },
      };
      return structuredClone(saved);
    }),
  });
  const editText = async (text: string) => {
    const before = session.getSnapshot().document.advancedContent;
    await session.commit({
      id: crypto.randomUUID(),
      at: Date.now(),
      target: 'advancedContent',
      before,
      after: {
        ...before,
        text: {
          version: 1,
          fragments: before.text!.fragments.map((fragment) => ({
            ...fragment,
            text,
            revision: fragment.revision + 1,
            alignment: 'range',
          })),
        },
      },
    });
  };
  return { session, saveSnapshot, commit, read, editText };
}

beforeEach(() => {
  vi.resetAllMocks();
  decodedDuration = 2;
  class AudioDecoder {
    async decodeAudioData() {
      return { duration: decodedDuration };
    }
    async close() {}
  }
  vi.stubGlobal('AudioContext', AudioDecoder);
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:text-take');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  mocks.read.mockResolvedValue(new Blob(['audio'], { type: 'audio/mpeg' }));
  mocks.decode.mockImplementation(async () => decodedDuration);
  mocks.job.mockResolvedValue({
    type: 'audio',
    staged: { id: '12345678-1234-4234-8234-123456789abc', mimeType: 'audio/mpeg', size: 5 },
  });
  mocks.discard.mockResolvedValue(undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('saves the full paused workspace before dispatch, retaining autosave off and fresh text identity', async () => {
  const { session, saveSnapshot, commit, editText } = fixture();
  session.setAutosaveEnabled(false);
  await session.saveDraft(
    { id: 'note', text: 'Unrelated draft', anchor: { kind: 'point', time: 0 } },
    null
  );
  await editText('Updated script');
  await session.flush();
  expect(saveSnapshot).not.toHaveBeenCalled();
  mocks.job.mockImplementationOnce(async (request) => {
    expect(saveSnapshot).toHaveBeenCalledOnce();
    expect(request.scope).toMatchObject({
      workspaceRevision: 2,
      textRevision: 1,
      timingRevision: 0,
    });
    expect(request.scope).not.toHaveProperty('assetId');
    return { type: 'audio', staged: { id: 'staged', mimeType: 'audio/mpeg', size: 5 } };
  });
  const preview = await generateReviewTextVoice(
    session,
    'text',
    profile,
    signal(),
    approvedSelection
  );
  expect(saveSnapshot).toHaveBeenCalledWith(
    expect.objectContaining({
      draft: expect.objectContaining({
        annotation: expect.objectContaining({ text: 'Unrelated draft' }),
      }),
    })
  );
  expect(commit).not.toHaveBeenCalled();
  expect(session.getSnapshot()).toMatchObject({ autosaveEnabled: false, dirty: false });
  expect(preview.textSnapshot).toMatchObject({ text: 'Updated script', revision: 1, profile });
});

it('does not save or request by opening a workflow, and avoids a write for already durable text', async () => {
  const { session, saveSnapshot } = fixture();
  expect(mocks.job).not.toHaveBeenCalled();
  await generateReviewTextVoice(session, 'text', profile, signal(), approvedSelection);
  expect(saveSnapshot).not.toHaveBeenCalled();
  expect(mocks.job).toHaveBeenCalledOnce();
});

it('refuses a later batch item whose captured text changed without implicitly saving it', async () => {
  const { session, saveSnapshot, editText } = fixture();
  session.setAutosaveEnabled(false);
  const prepared = await prepareReviewTextVoiceBatch(session, ['text'], signal());
  await editText('Changed while another request was running');
  await expect(
    generateReviewTextVoice(session, 'text', profile, signal(), approvedSelection, prepared[0])
  ).rejects.toThrow('stale');
  expect(saveSnapshot).not.toHaveBeenCalled();
  expect(mocks.job).not.toHaveBeenCalled();
  expect(session.getSnapshot().dirty).toBe(true);
});

it.each(['conflict', 'storage'])(
  'keeps a failed %s Save local with zero provider requests',
  async (code) => {
    const { session, saveSnapshot, editText } = fixture();
    session.setAutosaveEnabled(false);
    await editText('Unsaved text');
    saveSnapshot.mockRejectedValueOnce({ code });
    await expect(
      generateReviewTextVoice(session, 'text', profile, signal(), approvedSelection)
    ).rejects.toEqual({
      code,
    });
    expect(mocks.job).not.toHaveBeenCalled();
    expect(session.getSnapshot()).toMatchObject({
      dirty: true,
      autosaveEnabled: false,
      error: code,
    });
    expect(session.getSnapshot().document.advancedContent.text?.fragments[0]?.text).toBe(
      'Unsaved text'
    );
  }
);

it('cancel during Save prevents POST while preserving the explicit successful Save', async () => {
  const { session, saveSnapshot, editText } = fixture();
  session.setAutosaveEnabled(false);
  await editText('Saved despite cancelling the network operation');
  const controller = new AbortController();
  const persist = saveSnapshot.getMockImplementation()!;
  saveSnapshot.mockImplementationOnce(async (args) => {
    controller.abort();
    return persist(args);
  });
  await expect(
    generateReviewTextVoice(session, 'text', profile, controller.signal, approvedSelection)
  ).rejects.toThrow();
  expect(mocks.job).not.toHaveBeenCalled();
  expect(session.getSnapshot()).toMatchObject({ dirty: false, autosaveEnabled: false });
});

it('discards late output when text changes or cancellation occurs during decoding', async () => {
  for (const cause of ['edit', 'cancel'] as const) {
    const { session, editText } = fixture();
    const controller = new AbortController();
    mocks.decode.mockImplementationOnce(async () => {
      if (cause === 'edit') await editText('Changed while decoding');
      else controller.abort();
      return decodedDuration;
    });
    await expect(
      generateReviewTextVoice(session, 'text', profile, controller.signal, approvedSelection)
    ).rejects.toThrow();
  }
  expect(mocks.discard).toHaveBeenCalledTimes(2);
  expect(mocks.prepare).not.toHaveBeenCalled();
});

it('refuses output beyond the project without durable staging or trimming the text', async () => {
  const { session } = fixture();
  decodedDuration = 10;
  await expect(
    generateReviewTextVoice(session, 'text', profile, signal(), approvedSelection)
  ).rejects.toThrow('duration');
  expect(mocks.discard).toHaveBeenCalledOnce();
  expect(mocks.prepare).not.toHaveBeenCalled();
  expect(session.getSnapshot().document.advancedContent.text?.fragments[0]?.end).toBe(2);
});

it.each([0.5, 3])(
  'publishes one ordinary take of natural duration %s without moving its text',
  async (duration) => {
    const { session, commit } = fixture();
    decodedDuration = duration;
    const preview = await generateReviewTextVoice(
      session,
      'text',
      profile,
      signal(),
      approvedSelection
    );
    const asset = { id: 'take', protect: vi.fn(), publish: vi.fn(), cancel: vi.fn() };
    mocks.prepare.mockResolvedValue(asset);
    await applyReviewTextVoice(session, preview, signal(), {
      muteSource: true,
      sourceAudioAvailable: () => true,
    });
    const document = session.getSnapshot().document;
    expect(document.advancedContent.audio.voiceover).toHaveLength(1);
    const clip = document.advancedContent.audio.voiceover[0]!;
    expect(document.advancedContent.audio.original.mutes).toEqual([
      { id: expect.any(String), kind: 'take', clipId: clip.id },
    ]);
    expect(originalAudioRangeViews(document.advancedContent.audio)).toEqual([
      expect.objectContaining({ start: 1, end: 1 + duration, volume: 0 }),
    ]);
    expect(clip).toMatchObject({
      duration,
      textSnapshot: preview.textSnapshot,
      assetId: 'project-asset:take',
    });
    expect(document.advancedContent.text?.fragments[0]).toMatchObject({
      start: 1,
      end: 2,
      revision: 0,
    });
    expect(projectReviewVoiceover([clip], buildReviewTimeMap(10, document.edits))[0]).toMatchObject(
      {
        timelineStart: 1,
        duration,
      }
    );
    await applyReviewTextVoice(session, preview, signal());
    expect(commit).toHaveBeenCalledOnce();
    expect(mocks.prepare).toHaveBeenCalledOnce();
    await session.history('undo');
    expect(session.getSnapshot().document.advancedContent.audio.original.mutes).toBeUndefined();
    expect(session.getSnapshot().document.advancedContent.audio.voiceover).toHaveLength(0);
    await session.history('redo');
    expect(session.getSnapshot().document.advancedContent.audio.original.mutes).toHaveLength(1);
    await cleanupReviewTextVoicePreview(session, preview);
    expect(asset.cancel).not.toHaveBeenCalled();
  }
);

it('retains accepted bytes and retries publication without paid generation or duplicate clips', async () => {
  const { session, commit } = fixture();
  const preview = await generateReviewTextVoice(
    session,
    'text',
    profile,
    signal(),
    approvedSelection
  );
  const asset = {
    id: 'take',
    protect: vi.fn(),
    cancel: vi.fn(),
    publish: vi.fn().mockRejectedValueOnce(new Error('publish')).mockResolvedValue(undefined),
  };
  mocks.prepare.mockResolvedValue(asset);
  await expect(applyReviewTextVoice(session, preview, signal())).rejects.toThrow('publish');
  await applyReviewTextVoice(session, preview, signal());
  expect(asset.cancel).not.toHaveBeenCalled();
  expect(commit).toHaveBeenCalledOnce();
  expect(mocks.job).toHaveBeenCalledOnce();
  expect(session.getSnapshot().document.advancedContent.audio.voiceover).toHaveLength(1);
  expect(session.getSnapshot().document.advancedContent.audio.original.mutes).toBeUndefined();
});

it('refuses requested source mute when capability is missing before adopting generated bytes', async () => {
  const { session, commit } = fixture();
  const preview = await generateReviewTextVoice(
    session,
    'text',
    profile,
    signal(),
    approvedSelection
  );
  await expect(
    applyReviewTextVoice(session, preview, signal(), { muteSource: true })
  ).rejects.toThrow('invalid-request');
  expect(commit).not.toHaveBeenCalled();
  expect(mocks.prepare).not.toHaveBeenCalled();
  expect(session.getSnapshot().document.advancedContent.audio.voiceover).toEqual([]);
});

it.each(['cleanup', 'retry'])(
  'preserves a history-only accepted take after publication failure during %s',
  async (action) => {
    const { session, commit } = fixture();
    const preview = await generateReviewTextVoice(
      session,
      'text',
      profile,
      signal(),
      approvedSelection
    );
    const asset = {
      id: 'take',
      protect: vi.fn(),
      cancel: vi.fn(),
      publish: vi.fn().mockRejectedValueOnce(new Error('publish')).mockResolvedValue(undefined),
    };
    mocks.prepare.mockResolvedValue(asset);
    await expect(
      applyReviewTextVoice(session, preview, signal(), {
        muteSource: true,
        sourceAudioAvailable: () => true,
      })
    ).rejects.toThrow('publish');
    await session.history('undo');
    expect(session.getSnapshot().document.advancedContent.audio.voiceover).toHaveLength(0);
    expect(session.getSnapshot().document.advancedContent.audio.original.mutes).toBeUndefined();
    if (action === 'cleanup') await cleanupReviewTextVoicePreview(session, preview);
    else await applyReviewTextVoice(session, preview, signal());
    expect(asset.cancel).not.toHaveBeenCalled();
    expect(commit).toHaveBeenCalledOnce();
    expect(session.getSnapshot().snapshot.workspace.cursor).toBe(0);
    // Existing recovery uses the same history-inclusive reference authority.
    await preview.publication!.publish();
    await session.history('redo');
    expect(session.getSnapshot().document.advancedContent.audio.voiceover).toHaveLength(1);
    expect(session.getSnapshot().document.advancedContent.audio.original.mutes).toHaveLength(1);
    expect(mocks.job).toHaveBeenCalledOnce();
  }
);

it('rejects stale apply before preparing private bytes and cleans up the disposable output', async () => {
  const { session, editText } = fixture();
  const preview = await generateReviewTextVoice(
    session,
    'text',
    profile,
    signal(),
    approvedSelection
  );
  await editText('New text');
  await expect(applyReviewTextVoice(session, preview, signal())).rejects.toThrow('stale');
  expect(mocks.prepare).not.toHaveBeenCalled();
  await cleanupReviewTextVoicePreview(session, preview);
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:text-take');
  expect(mocks.discard).toHaveBeenCalledOnce();
});

it('places source-authored narration through Speed while keeping its natural playback duration', async () => {
  const { session } = fixture('source');
  await session.commit({
    id: 'speed-op',
    at: 1,
    target: 'edit',
    before: null,
    after: {
      id: 'speed',
      kind: 'speed',
      start: 0,
      end: 10,
      requestedStart: 0,
      requestedEnd: 10,
      rate: 2,
      audio: 'speed',
    },
  });
  const preview = await generateReviewTextVoice(
    session,
    'text',
    profile,
    signal(),
    approvedSelection
  );
  expect(preview.resultStart).toBe(0.5);
  expect(preview.scope.timeDomain).toBe('source');
  mocks.prepare.mockResolvedValue({
    id: 'take',
    protect: vi.fn(),
    publish: vi.fn(),
    cancel: vi.fn(),
  });
  await applyReviewTextVoice(session, preview, signal());
  const document = session.getSnapshot().document;
  const slices = projectReviewVoiceover(
    document.advancedContent.audio.voiceover,
    buildReviewTimeMap(10, document.edits)
  );
  expect(slices[0]).toMatchObject({ timelineStart: 0.5, duration: 2, playbackRate: 1 });
  expect(document.advancedContent.text?.fragments[0]).toMatchObject({
    start: 1,
    end: 2,
    timeDomain: 'source',
  });
});

it('refuses a failed durable history Save before a new paid request instead of clearing its error', async () => {
  const { session, commit } = fixture();
  commit.mockRejectedValueOnce(new Error('storage'));
  await expect(
    session.commit({
      id: 'note',
      at: 1,
      target: 'annotation',
      before: null,
      after: { id: 'note', text: 'Not saved', anchor: { kind: 'point', time: 0 } },
    })
  ).rejects.toThrow('storage');
  await expect(
    generateReviewTextVoice(session, 'text', profile, signal(), approvedSelection)
  ).rejects.toThrow('Review storage');
  expect(mocks.job).not.toHaveBeenCalled();
  expect(session.getSnapshot().error).toBe('storage');
});

it('keeps PCM in the take profile while publishing an ordinary WAV filename and natural duration', async () => {
  const { session } = fixture();
  const pcm = { ...profile, responseFormat: 'pcm' as const };
  decodedDuration = 0.75;
  mocks.job.mockResolvedValueOnce({
    type: 'audio',
    staged: { id: '12345678-1234-4234-8234-123456789abc', mimeType: 'audio/wav', size: 36_044 },
  });
  mocks.read.mockResolvedValueOnce(new Blob([new Uint8Array(36_044)], { type: 'audio/wav' }));
  const preview = await generateReviewTextVoice(session, 'text', pcm, signal(), approvedSelection);
  const asset = { id: 'pcm-take', protect: vi.fn(), publish: vi.fn(), cancel: vi.fn() };
  mocks.prepare.mockResolvedValueOnce(asset);
  await applyReviewTextVoice(session, preview, signal());
  expect(mocks.prepare.mock.calls[0]?.[0]).toBeInstanceOf(File);
  expect(mocks.prepare.mock.calls[0]?.[1]).toBe('audio/wav');
  expect(mocks.prepare.mock.calls[0]?.[2]).toBe(`${preview.clipId}.wav`);
  const clip = session.getSnapshot().document.advancedContent.audio.voiceover[0]!;
  expect(clip).toMatchObject({ duration: 0.75, textSnapshot: { profile: pcm } });
  await session.history('undo');
  expect(session.getSnapshot().document.advancedContent.audio.voiceover).toHaveLength(0);
  await session.history('redo');
  expect(session.getSnapshot().document.advancedContent.audio.voiceover[0]).toEqual(clip);
  await cleanupReviewTextVoicePreview(session, preview);
});

it('retains the approved narration destination during a deferred workspace Save', async () => {
  const { session, saveSnapshot, editText } = fixture();
  session.setAutosaveEnabled(false);
  await editText('Unsaved narration');
  const selection = { ...approvedSelection };
  let release!: () => void;
  let entered!: () => void;
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  const waiting = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const save = saveSnapshot.getMockImplementation()!;
  saveSnapshot.mockImplementationOnce(async (...args) => {
    entered();
    await hold;
    return save(...args);
  });
  const pending = generateReviewTextVoice(session, 'text', profile, signal(), selection);
  await waiting;
  expect(mocks.job).not.toHaveBeenCalled();
  selection.approvedDestination = `sha256:${'b'.repeat(64)}`;
  selection.approvedModelCode = 'replacement-code';
  release();
  await pending;
  expect(mocks.job).toHaveBeenCalledWith(
    expect.objectContaining({ approvedSelection }),
    expect.anything()
  );
});
it('rejects a foreign approved narration model before Save or provider work', async () => {
  const { session, saveSnapshot } = fixture();
  await expect(
    generateReviewTextVoice(session, 'text', profile, signal(), {
      ...approvedSelection,
      modelId: 'other',
    })
  ).rejects.toThrow('invalid-request');
  expect(saveSnapshot).not.toHaveBeenCalled();
  expect(mocks.job).not.toHaveBeenCalled();
});
