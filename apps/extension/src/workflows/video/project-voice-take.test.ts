import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  acceptProjectVoiceTake,
  cleanupProjectVoiceTakePreview,
  type ProjectVoiceTakeAccess,
  type ProjectVoiceTakePreview,
} from './project-voice-take';
import { createEmptyVideoProject } from '../../features/video/project/factories/creation';
import {
  getVideoProject,
  prepareProjectAsset,
  deleteProjectAsset,
  type PreparedProjectAsset,
} from '../../composition/persistence/projects';
import { isCurrentVideoProjectSnapshot } from '../../composition/persistence/projects/revision';
import { discardAudioStaging } from '../../composition/persistence/assets/audio-staging';

vi.mock('../../composition/persistence/projects', () => ({
  getVideoProject: vi.fn(),
  prepareProjectAsset: vi.fn(),
  deleteProjectAsset: vi.fn(),
}));
vi.mock('../../composition/persistence/projects/revision', () => ({
  isCurrentVideoProjectSnapshot: vi.fn(),
}));
vi.mock('../../composition/persistence/assets/audio-staging', () => ({
  readAudioStaging: vi.fn(),
  discardAudioStaging: vi.fn(),
}));
vi.mock('../audio-jobs/client', () => ({ runReviewSpeechJob: vi.fn() }));

function gate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}
function fixture() {
  let project = createEmptyVideoProject('Voice');
  project.version = 5;
  let durable = structuredClone(project);
  let revision = 1;
  let alive = true;
  let deleted = false;
  const order: string[] = [];
  const prepared: PreparedProjectAsset = {
    id: 'private-voice',
    ref: {
      assetId: 'physical-voice',
      createdAt: 1,
      location: { kind: 'opfs', objectKey: 'voice' },
      mimeType: 'audio/mpeg',
      sha256: null,
      size: 4,
    },
    protect: vi.fn(async () => undefined),
    publish: vi.fn(async () => {
      order.push('publish');
    }),
    cancel: vi.fn(async () => undefined),
    discard: vi.fn(async () => undefined),
    retainForSession: vi.fn(),
  };
  vi.mocked(prepareProjectAsset).mockImplementation(async (_blob, _mime, _name, id) => {
    order.push('prepare');
    prepared.id = id!;
    return prepared;
  });
  vi.mocked(getVideoProject).mockImplementation(async () =>
    deleted
      ? { status: 'notFound' }
      : {
          status: 'ready',
          project: structuredClone(durable),
          workspaceRevision: revision,
        }
  );
  vi.mocked(isCurrentVideoProjectSnapshot).mockImplementation(
    async (snapshot, rev) =>
      !deleted && revision === rev && JSON.stringify(snapshot) === JSON.stringify(durable)
  );
  const save = vi.fn(async () => {
    order.push('save');
    project = { ...project, updatedAt: project.updatedAt + 1 };
    durable = structuredClone(project);
    revision++;
  });
  const update = vi.fn((updater: (current: typeof project) => typeof project) => {
    order.push('update');
    project = updater(project);
  });
  const access: ProjectVoiceTakeAccess = {
    getProject: () => (alive ? project : null),
    update,
    save,
  };
  const preview: ProjectVoiceTakePreview = {
    origin: access,
    projectId: project.id,
    filename: 'Historical words',
    source: {
      kind: 'speech',
      scope: {
        projectId: project.id,
        projectRevision: 1,
        projectUpdatedAt: project.updatedAt,
        target: { kind: 'project-text', documentId: 'deleted-document', fragmentId: 'old-phrase' },
        basisHash: `sha256:${'a'.repeat(64)}`,
      },
      staged: { id: 'staged', mimeType: 'audio/mpeg', size: 4 },
    },
    blob: new Blob(['data'], { type: 'audio/mpeg' }),
    duration: 12,
    url: 'blob:preview',
    expiresAt: Date.now() + 60_000,
    textSnapshot: {
      version: 1,
      documentId: 'deleted-document',
      binding: { kind: 'project' },
      basisHash: `sha256:${'a'.repeat(64)}`,
      text: {
        kind: 'ai',
        textId: 'old-phrase',
        revision: 1,
        timingRevision: 1,
        text: 'Historical words',
        start: 1,
        end: 2,
        timeDomain: 'result',
        profile: { modelId: 'model', voiceId: 'voice', responseFormat: 'mp3' },
      },
    },
  };
  return {
    access,
    preview,
    prepared,
    save,
    update,
    order,
    project: () => project,
    durable: () => durable,
    undo: () => {
      project = { ...project, clips: [] };
    },
    edit: () => {
      project = { ...project, name: 'Edited' };
    },
    remove: () => {
      deleted = true;
    },
    close: () => {
      alive = false;
    },
    restore: () => {
      durable = { ...durable, name: 'Restored same tuple' };
    },
    recreate: () => {
      durable = { ...durable, createdAt: durable.createdAt - 1 };
    },
  };
}
const signal = () => new AbortController().signal;
afterEach(() => vi.unstubAllGlobals());
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('URL', { revokeObjectURL: vi.fn() });
  vi.mocked(deleteProjectAsset).mockResolvedValue(undefined);
  vi.mocked(discardAudioStaging).mockResolvedValue(undefined);
});

it('publishes private audio before one insertion and saves a full independent long take', async () => {
  const f = fixture();
  await acceptProjectVoiceTake(f.access, f.preview, { start: 7 }, signal());
  expect(f.order).toEqual(['save', 'prepare', 'publish', 'update', 'save']);
  expect(prepareProjectAsset).toHaveBeenCalledWith(
    f.preview.blob,
    'audio/mpeg',
    'Historical words',
    expect.any(String),
    undefined,
    undefined,
    { publishToLibrary: false }
  );
  expect(f.durable().clips).toHaveLength(1);
  expect(f.durable().clips[0]).toMatchObject({
    type: 'AUDIO',
    startTime: 7,
    duration: 12,
    textSnapshot: f.preview.textSnapshot,
  });
  expect(f.durable().duration).toBe(19);
  expect(f.durable().textDocuments).toBeUndefined();
  f.preview.textSnapshot.text.text = 'Changed preview';
  expect(f.durable().clips[0]).toMatchObject({
    textSnapshot: { text: { text: 'Historical words' } },
  });
  await cleanupProjectVoiceTakePreview(f.preview);
  expect(deleteProjectAsset).not.toHaveBeenCalled();
  expect(f.prepared.cancel).not.toHaveBeenCalled();
  expect(discardAudioStaging).toHaveBeenCalledOnce();
});
it('retries only Save after insertion failure and retains accepted bytes', async () => {
  const f = fixture();
  const original = f.save.getMockImplementation()!;
  f.save.mockImplementationOnce(original).mockRejectedValueOnce(new Error('storage'));
  await expect(acceptProjectVoiceTake(f.access, f.preview, { start: 0 }, signal())).rejects.toThrow(
    'storage'
  );
  expect(f.project().clips).toHaveLength(1);
  expect(f.prepared.cancel).not.toHaveBeenCalled();
  expect(deleteProjectAsset).not.toHaveBeenCalled();
  f.preview.expiresAt = 0;
  await acceptProjectVoiceTake(f.access, f.preview, { start: 0 }, signal());
  expect(f.update).toHaveBeenCalledOnce();
  expect(prepareProjectAsset).toHaveBeenCalledOnce();
  expect(f.prepared.publish).toHaveBeenCalledOnce();
  expect(f.save).toHaveBeenCalledTimes(3);
});
it('refuses retry after Undo, placement change, or a different mounted access', async () => {
  const f = fixture();
  await acceptProjectVoiceTake(f.access, f.preview, { start: 0 }, signal());
  await expect(acceptProjectVoiceTake(f.access, f.preview, { start: 3 }, signal())).rejects.toThrow(
    'stale'
  );
  await expect(
    acceptProjectVoiceTake({ ...f.access }, f.preview, { start: 0 }, signal())
  ).rejects.toThrow('stale');
  f.undo();
  await expect(acceptProjectVoiceTake(f.access, f.preview, { start: 0 }, signal())).rejects.toThrow(
    'stale'
  );
  expect(f.update).toHaveBeenCalledOnce();
  expect(deleteProjectAsset).not.toHaveBeenCalled();
});
it('serializes acceptance while publication is pending', async () => {
  const f = fixture();
  const pending = gate();
  const entered = gate();
  vi.mocked(f.prepared.publish).mockImplementationOnce(async () => {
    entered.release();
    await pending.promise;
  });
  const first = acceptProjectVoiceTake(f.access, f.preview, { start: 0 }, signal());
  await entered.promise;
  await expect(acceptProjectVoiceTake(f.access, f.preview, { start: 0 }, signal())).rejects.toThrow(
    'busy'
  );
  pending.release();
  await first;
  expect(f.update).toHaveBeenCalledOnce();
  expect(prepareProjectAsset).toHaveBeenCalledOnce();
});
it.each(['restore', 'recreate', 'remove', 'close', 'edit'] as const)(
  'refuses a delayed insertion after %s and cleans only the fresh asset',
  async (change) => {
    const f = fixture();
    const pending = gate();
    const entered = gate();
    vi.mocked(f.prepared.publish).mockImplementationOnce(async () => {
      entered.release();
      await pending.promise;
    });
    const operation = acceptProjectVoiceTake(f.access, f.preview, { start: 0 }, signal());
    await entered.promise;
    f[change]();
    pending.release();
    await expect(operation).rejects.toThrow('stale');
    expect(f.update).not.toHaveBeenCalled();
    expect(f.prepared.cancel).toHaveBeenCalledOnce();
    expect(deleteProjectAsset).toHaveBeenCalledExactlyOnceWith(f.prepared.id);
    expect(f.preview.blob.size).toBe(4);
  }
);
it('does not insert when aborted during publication', async () => {
  const f = fixture();
  const controller = new AbortController();
  vi.mocked(f.prepared.publish).mockImplementationOnce(async () => {
    controller.abort();
  });
  await expect(
    acceptProjectVoiceTake(f.access, f.preview, { start: 0 }, controller.signal)
  ).rejects.toThrow();
  expect(f.update).not.toHaveBeenCalled();
  expect(deleteProjectAsset).toHaveBeenCalledOnce();
});
it('drains a closed preview before disposing staging without inserting late', async () => {
  const f = fixture();
  const pending = gate();
  const entered = gate();
  vi.mocked(f.prepared.publish).mockImplementationOnce(async () => {
    entered.release();
    await pending.promise;
  });
  const operation = acceptProjectVoiceTake(f.access, f.preview, { start: 0 }, signal());
  await entered.promise;
  const cleanup = cleanupProjectVoiceTakePreview(f.preview);
  pending.release();
  await expect(operation).rejects.toThrow('stale');
  await cleanup;
  expect(f.update).not.toHaveBeenCalled();
  expect(discardAudioStaging).toHaveBeenCalledOnce();
});
it('retains the handle when pre-insertion cleanup fails and permits explicit cleanup retry', async () => {
  const f = fixture();
  vi.mocked(f.prepared.publish).mockRejectedValueOnce(new Error('publication'));
  vi.mocked(f.prepared.cancel).mockRejectedValueOnce(new Error('cleanup'));
  await expect(acceptProjectVoiceTake(f.access, f.preview, { start: 0 }, signal())).rejects.toThrow(
    'publication'
  );
  expect(f.preview.attachment?.cleanup).toBe(f.prepared);
  expect(f.preview.attachment?.prepared).toBeUndefined();
  await cleanupProjectVoiceTakePreview(f.preview);
  expect(f.prepared.cancel).toHaveBeenCalledTimes(2);
  expect(f.preview.attachment).toBeUndefined();
});

it('refuses transfer to another mounted access before publishing or saving', async () => {
  const f = fixture();
  await expect(
    acceptProjectVoiceTake({ ...f.access }, f.preview, { start: 0 }, signal())
  ).rejects.toThrow('stale');
  expect(f.save).not.toHaveBeenCalled();
  expect(prepareProjectAsset).not.toHaveBeenCalled();
});
it('refuses expired or invalid placement before resource publication', async () => {
  const f = fixture();
  await expect(
    acceptProjectVoiceTake(f.access, f.preview, { start: -1 }, signal())
  ).rejects.toThrow('selection');
  f.preview.expiresAt = 0;
  await expect(acceptProjectVoiceTake(f.access, f.preview, { start: 0 }, signal())).rejects.toThrow(
    'stale'
  );
  expect(prepareProjectAsset).not.toHaveBeenCalled();
  expect(f.update).not.toHaveBeenCalled();
});

it('finishes partial cleanup before preparing a fresh source on acceptance retry', async () => {
  const f = fixture();
  let sourceAvailable = false;
  let terminal = false;
  vi.mocked(f.prepared.publish).mockImplementation(async () => {
    if (terminal) return;
    sourceAvailable = true;
    terminal = true;
  });
  vi.mocked(deleteProjectAsset)
    .mockImplementationOnce(async () => {
      sourceAvailable = false;
      throw new Error('physical deletion failed after metadata removal');
    })
    .mockRejectedValueOnce(new Error('physical deletion still unavailable'));
  const prepare = vi.mocked(prepareProjectAsset).getMockImplementation()!;
  vi.mocked(prepareProjectAsset)
    .mockImplementationOnce(prepare)
    .mockImplementationOnce(async (_blob, _mime, _name, id) => ({
      ...f.prepared,
      id: id!,
      publish: vi.fn(async () => {
        sourceAvailable = true;
      }),
      cancel: vi.fn(async () => undefined),
    }));
  const update = f.update.getMockImplementation()!;
  f.update
    .mockImplementationOnce(() => {
      throw new Error('updater refused');
    })
    .mockImplementationOnce((updater) => {
      expect(sourceAvailable, 'retry must not reference a canceled source').toBe(true);
      update(updater);
    });
  await expect(acceptProjectVoiceTake(f.access, f.preview, { start: 0 }, signal())).rejects.toThrow(
    'updater refused'
  );
  expect(f.project().clips).toHaveLength(0);
  await expect(acceptProjectVoiceTake(f.access, f.preview, { start: 0 }, signal())).rejects.toThrow(
    'physical deletion still unavailable'
  );
  expect(f.update).toHaveBeenCalledOnce();
  expect(prepareProjectAsset).toHaveBeenCalledOnce();
  await acceptProjectVoiceTake(f.access, f.preview, { start: 0 }, signal());
  expect(prepareProjectAsset).toHaveBeenCalledTimes(2);
  expect(vi.mocked(prepareProjectAsset).mock.calls[1]![3]).not.toBe(
    vi.mocked(prepareProjectAsset).mock.calls[0]![3]
  );
  expect(f.prepared.publish).toHaveBeenCalledOnce();
  expect(f.durable().clips).toHaveLength(1);
});
