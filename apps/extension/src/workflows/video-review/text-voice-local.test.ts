import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { applyReviewLocalTextVoice, prepareReviewLocalTextVoice } from './text-voice-local';
import { createVideoReviewSession } from './session';
import { captureReviewTextTakeBasis, cleanupReviewTextTakePreview } from './text-take';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
import { createQuickEditAudioClip } from '../../features/video/review/advanced/audio';
import {
  addReviewTextFragment,
  createReviewTextDocument,
} from '../../features/video/review/text-document';
import {
  parseVideoWorkspace,
  parseVideoWorkspaceDraft,
} from '../../composition/persistence/review-workspaces/parser';
import { parseReviewOperation } from '../../features/video/review/validation';
import type { VideoWorkspaceSnapshot } from '../../composition/persistence/review-workspaces/contracts';

const mocks = vi.hoisted(() => ({
  prepare: vi.fn(),
  readLibrary: vi.fn(),
  bindLibrary: vi.fn(),
  admitLibrary: vi.fn(),
  event: vi.fn(),
}));
vi.mock('../../composition/persistence/projects', () => ({ prepareProjectAsset: mocks.prepare }));
vi.mock('../../composition/persistence/projects/library-asset-binding', () => ({
  readLibraryAudioBindingSource: mocks.readLibrary,
  prepareLibraryAudioBinding: mocks.bindLibrary,
  assertLibraryAudioBindingSource: mocks.admitLibrary,
}));
vi.mock('../../features/media-hub/events', () => ({ publishMediaHubLibraryChanged: mocks.event }));
const signal = () => new AbortController().signal;
const file = () => new File(['audio'], 'Human.wav', { type: 'audio/wav' });
let duration = 2;

function fixture(shared = false) {
  const advanced = createQuickEditAdvancedState();
  const added = addReviewTextFragment(createReviewTextDocument(), {
    id: 'text',
    text: 'My script',
    start: 1,
    end: 2,
    timeDomain: 'result',
  });
  if (!added.ok) throw new Error('fixture');
  advanced.text = added.document;
  if (shared)
    advanced.audio.music = [
      createQuickEditAudioClip({
        id: 'other',
        assetId: 'project-asset:shared',
        timelineStart: 6,
        duration: 2,
        endMax: 10,
      }),
    ];
  let saved: VideoWorkspaceSnapshot = {
    workspace: {
      aggregateId: 'video',
      sourceAssetId: 'source',
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
  const save = vi.fn<Deps['saveVideoWorkspaceSnapshot']>(async (args) => {
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
  const session = createVideoReviewSession(saved, {
    saveVideoWorkspaceSnapshot: save,
    commitVideoWorkspace: commit,
    readVideoWorkspace: read,
    saveVideoWorkspaceDraft: vi.fn(),
    saveVideoWorkspaceAdvanced: vi.fn(),
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
  return { session, save, commit, read };
}

function librarySource() {
  return {
    mediaId: 'project-asset:shared',
    filename: 'Library.wav',
    file: file(),
    source: { kind: 'project-asset' as const, projectAssetId: 'shared' },
    ref: {
      assetId: 'bytes',
      mimeType: 'audio/wav',
      size: 5,
      createdAt: 1,
      sha256: null,
      location: { kind: 'opfs' as const, objectKey: 'audio-object' },
    },
    entry: { id: 'shared', assetId: 'bytes', mimeType: 'audio/wav', size: 5, createdAt: 1 },
  };
}
function asset(id = 'take') {
  return { id, protect: vi.fn(), cancel: vi.fn(), publish: vi.fn() };
}

beforeEach(() => {
  vi.resetAllMocks();
  duration = 2;
  vi.stubGlobal(
    'AudioContext',
    class {
      async decodeAudioData() {
        return { duration };
      }
      async close() {}
    }
  );
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:local');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  mocks.readLibrary.mockResolvedValue(librarySource());
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('previews without Save and applies a naturally timed microphone take after full-buffer Save', async () => {
  const { session, save, commit } = fixture();
  session.setAutosaveEnabled(false);
  await session.saveDraft(
    { id: 'note', text: 'Unrelated draft', anchor: { kind: 'point', time: 0 } },
    null
  );
  const basis = captureReviewTextTakeBasis(session, 'text');
  const preview = await prepareReviewLocalTextVoice({
    session,
    fragmentId: 'text',
    selection: { kind: 'file', file: file() },
    kind: 'microphone',
    signal: signal(),
    trimOffset: 0.5,
    basis,
  });
  expect(save).not.toHaveBeenCalled();
  expect(mocks.prepare).not.toHaveBeenCalled();
  expect(preview).toMatchObject({
    resultStart: 1.5,
    duration: 2,
    textSnapshot: { kind: 'microphone', text: 'My script' },
  });
  expect(preview).not.toHaveProperty('scope');
  const prepared = asset();
  mocks.prepare.mockResolvedValue(prepared);
  const retained = vi.fn();
  await applyReviewLocalTextVoice(session, preview, signal(), retained);
  expect(save).toHaveBeenCalledOnce();
  expect(save.mock.calls[0]![0].draft).toMatchObject({ annotation: { text: 'Unrelated draft' } });
  expect(session.getSnapshot()).toMatchObject({ autosaveEnabled: false, dirty: false });
  expect(session.getSnapshot().document.advancedContent.audio.voiceover[0]).toMatchObject({
    timelineStart: 1.5,
    duration: 2,
    textSnapshot: preview.textSnapshot,
  });
  expect(session.getSnapshot().document.advancedContent.text!.fragments[0]).toMatchObject({
    start: 1,
    end: 2,
  });
  expect(commit).toHaveBeenCalledOnce();
  expect(retained).toHaveBeenCalledOnce();
});

it('retains an unsaved human proposal after Save failure and applies only on explicit retry', async () => {
  const { session, save } = fixture();
  session.setAutosaveEnabled(false);
  await session.saveDraft({ id: 'note', text: 'Draft', anchor: { kind: 'point', time: 0 } }, null);
  const preview = await prepareReviewLocalTextVoice({
    session,
    fragmentId: 'text',
    selection: { kind: 'file', file: file() },
    kind: 'microphone',
    signal: signal(),
  });
  save.mockRejectedValueOnce(new Error('storage'));
  await expect(applyReviewLocalTextVoice(session, preview, signal())).rejects.toThrow('storage');
  expect(mocks.prepare).not.toHaveBeenCalled();
  expect(session.getSnapshot().dirty).toBe(true);
  mocks.prepare.mockResolvedValue(asset());
  await applyReviewLocalTextVoice(session, preview, signal());
  expect(save).toHaveBeenCalledTimes(2);
  expect(session.getSnapshot().document.advancedContent.audio.voiceover).toHaveLength(1);
});

it('binds the exact auditioned Library source without importing another physical file', async () => {
  const { session } = fixture();
  const source = librarySource();
  mocks.readLibrary.mockResolvedValue(source);
  const binding = { assetId: 'project-asset:shared', publish: vi.fn(), cancel: vi.fn() };
  mocks.bindLibrary.mockResolvedValue(binding);
  const preview = await prepareReviewLocalTextVoice({
    session,
    fragmentId: 'text',
    selection: { kind: 'library', id: source.mediaId },
    kind: 'gallery',
    signal: signal(),
  });
  expect(mocks.bindLibrary).not.toHaveBeenCalled();
  await applyReviewLocalTextVoice(session, preview, signal());
  expect(mocks.bindLibrary).toHaveBeenCalledWith(
    source,
    { aggregateId: 'video', clipId: preview.clipId },
    'shared'
  );
  expect(mocks.prepare).not.toHaveBeenCalled();
  expect(binding.publish).toHaveBeenCalledOnce();
});

it('keeps shared Library bytes after failed attach but never treats another clip as acceptance', async () => {
  const { session, commit } = fixture(true);
  const binding = { assetId: 'project-asset:shared', publish: vi.fn(), cancel: vi.fn() };
  mocks.bindLibrary.mockResolvedValue(binding);
  const preview = await prepareReviewLocalTextVoice({
    session,
    fragmentId: 'text',
    selection: { kind: 'library', id: 'project-asset:shared' },
    kind: 'gallery',
    signal: signal(),
  });
  commit.mockRejectedValueOnce(new Error('storage'));
  const retained = vi.fn();
  await expect(applyReviewLocalTextVoice(session, preview, signal(), retained)).rejects.toThrow(
    'storage'
  );
  expect(binding.cancel).not.toHaveBeenCalled();
  expect(binding.publish).not.toHaveBeenCalled();
  expect(retained).not.toHaveBeenCalled();
  await session.reload();
  await applyReviewLocalTextVoice(session, preview, signal(), retained);
  expect(mocks.admitLibrary).toHaveBeenCalledOnce();
  expect(mocks.bindLibrary).toHaveBeenCalledOnce();
  expect(commit).toHaveBeenCalledTimes(2);
  expect(retained).toHaveBeenCalledOnce();
  expect(session.getSnapshot().document.advancedContent.audio.voiceover).toHaveLength(1);
  expect(session.getSnapshot().document.advancedContent.audio.music).toHaveLength(1);
});

it('carries drawer audition bytes through choice and refuses their changed source at Apply', async () => {
  const { session, commit } = fixture();
  const auditioned = librarySource();
  const replacement = { ...auditioned, file: new File(['B'], 'B.wav', { type: 'audio/wav' }) };
  mocks.readLibrary.mockResolvedValue(replacement);
  const preview = await prepareReviewLocalTextVoice({
    session,
    fragmentId: 'text',
    selection: { kind: 'library', id: auditioned.mediaId, auditionedSource: auditioned },
    kind: 'gallery',
    signal: signal(),
  });
  expect(preview.blob).toBe(auditioned.file);
  expect(preview.library?.source).toBe(auditioned);
  expect(mocks.readLibrary).not.toHaveBeenCalled();
  mocks.bindLibrary.mockRejectedValueOnce(new Error('changed-source'));
  await expect(applyReviewLocalTextVoice(session, preview, signal())).rejects.toThrow(
    'changed-source'
  );
  expect(mocks.bindLibrary).toHaveBeenCalledWith(
    auditioned,
    { aggregateId: 'video', clipId: preview.clipId },
    'shared'
  );
  expect(commit).not.toHaveBeenCalled();
  expect(session.getSnapshot().document.advancedContent.audio.voiceover).toHaveLength(0);
});

it('refuses an audition snapshot belonging to another Library row before previewing', async () => {
  const { session } = fixture();
  await expect(
    prepareReviewLocalTextVoice({
      session,
      fragmentId: 'text',
      kind: 'gallery',
      signal: signal(),
      selection: { kind: 'library', id: 'other-row', auditionedSource: librarySource() },
    })
  ).rejects.toThrow('invalid-request');
  expect(URL.createObjectURL).not.toHaveBeenCalled();
  expect(mocks.readLibrary).not.toHaveBeenCalled();
});

it('refuses a deleted Library source during unaccepted receipt retry', async () => {
  const { session, commit } = fixture(true);
  mocks.bindLibrary.mockResolvedValue({
    assetId: 'project-asset:shared',
    publish: vi.fn(),
    cancel: vi.fn(),
  });
  const preview = await prepareReviewLocalTextVoice({
    session,
    fragmentId: 'text',
    selection: { kind: 'library', id: 'project-asset:shared' },
    kind: 'gallery',
    signal: signal(),
  });
  commit.mockRejectedValueOnce(new Error('storage'));
  await expect(applyReviewLocalTextVoice(session, preview, signal())).rejects.toThrow();
  await session.reload();
  mocks.admitLibrary.mockRejectedValueOnce(new Error('deleted source'));
  await expect(applyReviewLocalTextVoice(session, preview, signal())).rejects.toThrow(
    'deleted source'
  );
  expect(commit).toHaveBeenCalledOnce();
});

it('finishes a history-only accepted human take after publication failure without another Save or clip', async () => {
  const { session, save, commit } = fixture();
  const prepared = asset();
  prepared.publish.mockRejectedValueOnce(new Error('publish'));
  mocks.prepare.mockResolvedValue(prepared);
  const preview = await prepareReviewLocalTextVoice({
    session,
    fragmentId: 'text',
    selection: { kind: 'file', file: file() },
    kind: 'microphone',
    signal: signal(),
  });
  const retained = vi.fn();
  await expect(applyReviewLocalTextVoice(session, preview, signal(), retained)).rejects.toThrow(
    'publish'
  );
  expect(retained).toHaveBeenCalledOnce();
  await session.history('undo');
  await cleanupReviewTextTakePreview(session, preview);
  await applyReviewLocalTextVoice(session, preview, signal());
  expect(prepared.cancel).not.toHaveBeenCalled();
  expect(commit).toHaveBeenCalledOnce();
  expect(save).not.toHaveBeenCalled();
  await session.history('redo');
  expect(session.getSnapshot().document.advancedContent.audio.voiceover).toHaveLength(1);
});

it('refuses project overrun and late cancellation before a preview or durable import', async () => {
  const { session } = fixture();
  duration = 10;
  await expect(
    prepareReviewLocalTextVoice({
      session,
      fragmentId: 'text',
      selection: { kind: 'file', file: file() },
      kind: 'gallery',
      signal: signal(),
    })
  ).rejects.toThrow('duration');
  expect(URL.createObjectURL).not.toHaveBeenCalled();
  duration = 2;
  const controller = new AbortController();
  mocks.readLibrary.mockImplementationOnce(async () => {
    controller.abort();
    return librarySource();
  });
  await expect(
    prepareReviewLocalTextVoice({
      session,
      fragmentId: 'text',
      selection: { kind: 'library', id: 'project-asset:shared' },
      kind: 'gallery',
      signal: controller.signal,
    })
  ).rejects.toThrow();
  expect(mocks.bindLibrary).not.toHaveBeenCalled();
  expect(mocks.prepare).not.toHaveBeenCalled();
});
