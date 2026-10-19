import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../features/video/project/factories/creation';
import {
  getVideoProject,
  prepareProjectAsset,
  deleteProjectAsset,
  type PreparedProjectAsset,
} from '../../composition/persistence/projects';
import { isCurrentVideoProjectSnapshot } from '../../composition/persistence/projects/revision';
import {
  assertLibraryAudioBindingSource,
  readLibraryAudioBindingSource,
} from '../../composition/persistence/projects/library-asset-binding';
import { discardAudioStaging } from '../../composition/persistence/assets/audio-staging';
import { inspectReviewAudio } from '../video-review/audio-import';
import {
  acceptProjectVoiceTake,
  cleanupProjectVoiceTakePreview,
  prepareProjectLocalTextVoice,
  type ProjectVoiceTakeAccess,
} from './project-voice-take';

vi.mock('../../composition/persistence/projects', () => ({
  getVideoProject: vi.fn(),
  prepareProjectAsset: vi.fn(),
  deleteProjectAsset: vi.fn(),
}));
vi.mock('../../composition/persistence/projects/revision', () => ({
  isCurrentVideoProjectSnapshot: vi.fn(),
}));
vi.mock('../../composition/persistence/projects/library-asset-binding', () => ({
  assertLibraryAudioBindingSource: vi.fn(),
  readLibraryAudioBindingSource: vi.fn(),
}));
vi.mock('../../composition/persistence/assets/audio-staging', () => ({
  discardAudioStaging: vi.fn(),
}));
vi.mock('../video-review/audio-import', () => ({ inspectReviewAudio: vi.fn() }));

const signal = () => new AbortController().signal;
function gate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}
function fixture() {
  let project = createEmptyVideoProject('Local voice');
  project.version = 5;
  project.textDocuments = [
    {
      id: 'script',
      binding: { kind: 'project' },
      document: {
        version: 1,
        fragments: [
          {
            id: 'phrase',
            text: 'Historical local words',
            originalText: '',
            revision: 1,
            timingRevision: 1,
            start: 1,
            end: 2,
            timeDomain: 'result',
            alignment: 'manual',
            showInVideo: true,
          },
        ],
      },
    },
  ];
  let durable = structuredClone(project);
  const prepared: PreparedProjectAsset = {
    id: 'private',
    ref: {
      assetId: 'bytes',
      createdAt: 1,
      location: { kind: 'opfs', objectKey: 'bytes' },
      mimeType: 'audio/wav',
      sha256: null,
      size: 4,
    },
    publish: vi.fn(async () => undefined),
    cancel: vi.fn(async () => undefined),
    protect: vi.fn(async () => undefined),
    discard: vi.fn(async () => undefined),
    retainForSession: vi.fn(),
  };
  const access: ProjectVoiceTakeAccess = {
    getProject: () => project,
    save: vi.fn(async () => {
      durable = structuredClone(project);
    }),
    update: vi.fn((updater) => {
      project = updater(project);
    }),
  };
  vi.mocked(getVideoProject).mockImplementation(async () => ({
    status: 'ready',
    project: structuredClone(durable),
    workspaceRevision: 1,
  }));
  vi.mocked(prepareProjectAsset).mockImplementation(async (_blob, _mime, _name, id) => {
    prepared.id = id!;
    return prepared;
  });
  const file = new File(['data'], 'Original take.wav', { type: 'audio/wav' });
  const source: Awaited<ReturnType<typeof readLibraryAudioBindingSource>> = {
    mediaId: 'selected',
    filename: file.name,
    file,
    source: { kind: 'stored-asset', assetId: 'original' },
    ref: { ...prepared.ref, assetId: 'original' },
    entry: null,
  };
  vi.mocked(readLibraryAudioBindingSource).mockResolvedValue(source);
  return {
    access,
    file,
    source,
    prepared,
    project: () => project,
    prepare: (
      library = false,
      kind: 'microphone' | 'gallery' = 'gallery',
      operationSignal = signal()
    ) =>
      prepareProjectLocalTextVoice({
        access,
        documentId: 'script',
        fragmentId: 'phrase',
        kind,
        signal: operationSignal,
        selection: library ? { kind: 'library', id: source.mediaId } : { kind: 'file', file },
      }),
    change: () => {
      project = { ...project, name: 'Changed' };
    },
    recreate: () => {
      project = { ...project, createdAt: project.createdAt - 1 };
    },
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:local'), revokeObjectURL: vi.fn() });
  vi.mocked(inspectReviewAudio).mockResolvedValue(12);
  vi.mocked(isCurrentVideoProjectSnapshot).mockResolvedValue(true);
  vi.mocked(assertLibraryAudioBindingSource).mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllGlobals());

it.each(['microphone', 'gallery'] as const)(
  'prepares %s bytes without a writer and keeps the full take',
  async (kind) => {
    const f = fixture();
    const preview = await f.prepare(false, kind);
    expect(preview).toMatchObject({
      filename: f.file.name,
      duration: 12,
      source: { kind: 'local' },
      textSnapshot: { text: { kind, text: 'Historical local words' } },
    });
    expect(preview.blob).toBe(f.file);
    expect(f.access.save).not.toHaveBeenCalled();
    expect(prepareProjectAsset).not.toHaveBeenCalled();
    await acceptProjectVoiceTake(f.access, preview, { start: 7 }, signal());
    expect(f.project().clips[0]).toMatchObject({
      startTime: 7,
      duration: 12,
      textSnapshot: preview.textSnapshot,
    });
    expect(f.project().duration).toBe(19);
    expect(prepareProjectAsset).toHaveBeenCalledWith(
      f.file,
      'audio/wav',
      f.file.name,
      expect.any(String),
      undefined,
      undefined,
      { publishToLibrary: false }
    );
    await cleanupProjectVoiceTakePreview(preview);
    expect(discardAudioStaging).not.toHaveBeenCalled();
    expect(f.prepared.cancel).not.toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:local');
  }
);

it.each(['change', 'recreate'] as const)(
  'rejects a %s during local decoding without publishing',
  async (action) => {
    const f = fixture();
    const wait = gate();
    vi.mocked(inspectReviewAudio).mockImplementationOnce(async () => {
      await wait.promise;
      return 12;
    });
    const pending = f.prepare();
    await vi.waitFor(() => expect(inspectReviewAudio).toHaveBeenCalledOnce());
    f[action]();
    wait.release();
    await expect(pending).rejects.toThrow('stale');
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(f.access.save).not.toHaveBeenCalled();
    expect(prepareProjectAsset).not.toHaveBeenCalled();
  }
);

it('cancels pending decode without creating a preview URL or writing', async () => {
  const f = fixture();
  const wait = gate();
  const controller = new AbortController();
  vi.mocked(inspectReviewAudio).mockImplementationOnce(async () => {
    await wait.promise;
    return 12;
  });
  const pending = f.prepare(false, 'microphone', controller.signal);
  await vi.waitFor(() => expect(inspectReviewAudio).toHaveBeenCalledOnce());
  controller.abort();
  wait.release();
  await expect(pending).rejects.toThrow();
  expect(URL.createObjectURL).not.toHaveBeenCalled();
  expect(prepareProjectAsset).not.toHaveBeenCalled();
});

it('preserves the auditioned Library source and rejects a mismatched selection', async () => {
  const f = fixture();
  await expect(
    prepareProjectLocalTextVoice({
      access: f.access,
      documentId: 'script',
      fragmentId: 'phrase',
      selection: { kind: 'library', id: 'other', auditionedSource: f.source },
      kind: 'gallery',
      signal: signal(),
    })
  ).rejects.toThrow('invalid-request');
  expect(inspectReviewAudio).not.toHaveBeenCalled();
  const preview = await prepareProjectLocalTextVoice({
    access: f.access,
    documentId: 'script',
    fragmentId: 'phrase',
    selection: { kind: 'library', id: 'selected', auditionedSource: f.source },
    kind: 'gallery',
    signal: signal(),
  });
  expect(readLibraryAudioBindingSource).not.toHaveBeenCalled();
  expect(preview.blob).toBe(f.source.file);
});

it('refuses a deleted or replaced Library source before insertion', async () => {
  const f = fixture();
  const preview = await f.prepare(true);
  vi.mocked(assertLibraryAudioBindingSource).mockRejectedValueOnce(new Error('unavailable'));
  await expect(acceptProjectVoiceTake(f.access, preview, { start: 0 }, signal())).rejects.toThrow(
    'unavailable'
  );
  expect(prepareProjectAsset).not.toHaveBeenCalled();
  expect(f.access.update).not.toHaveBeenCalled();
});

it('refuses source replacement during publication and releases only its own private copy', async () => {
  const f = fixture();
  const preview = await f.prepare(true);
  vi.mocked(assertLibraryAudioBindingSource)
    .mockResolvedValueOnce(undefined)
    .mockRejectedValueOnce(new Error('changed-source'));
  await expect(acceptProjectVoiceTake(f.access, preview, { start: 0 }, signal())).rejects.toThrow(
    'changed-source'
  );
  expect(f.access.update).not.toHaveBeenCalled();
  expect(f.prepared.cancel).toHaveBeenCalledOnce();
  expect(deleteProjectAsset).toHaveBeenCalledExactlyOnceWith(f.prepared.id);
  expect(f.prepared.id).not.toBe('original');
  expect(assertLibraryAudioBindingSource).toHaveBeenNthCalledWith(2, f.source, expect.any(String));
});

it('retries Save after Library deletion without republishing or reinserting', async () => {
  const f = fixture();
  const preview = await f.prepare(true);
  vi.mocked(f.access.save)
    .mockResolvedValueOnce(undefined)
    .mockRejectedValueOnce(new Error('save refused'));
  await expect(acceptProjectVoiceTake(f.access, preview, { start: 4 }, signal())).rejects.toThrow(
    'save refused'
  );
  vi.mocked(assertLibraryAudioBindingSource).mockRejectedValue(new Error('deleted'));
  await acceptProjectVoiceTake(f.access, preview, { start: 4 }, signal());
  expect(f.access.update).toHaveBeenCalledOnce();
  expect(prepareProjectAsset).toHaveBeenCalledOnce();
  expect(f.prepared.publish).toHaveBeenCalledOnce();
  expect(assertLibraryAudioBindingSource).toHaveBeenCalledTimes(2);
  expect(f.project().clips).toHaveLength(1);
});

it('does not apply the speech character limit to local snapshots', async () => {
  const f = fixture();
  f.project().textDocuments![0]!.document.fragments[0]!.text = 'x'.repeat(5000);
  const preview = await f.prepare();
  expect(preview.textSnapshot.text.text).toHaveLength(5000);
});

it('propagates decoder refusal without acquiring a source or URL', async () => {
  const f = fixture();
  vi.mocked(inspectReviewAudio).mockRejectedValueOnce(new Error('Unsupported audio duration.'));
  await expect(f.prepare()).rejects.toThrow('Unsupported audio duration.');
  expect(prepareProjectAsset).not.toHaveBeenCalled();
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});
