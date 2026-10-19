import { createVideoProjectAsset } from '../../features/video/project/factories/creation';
import { createVideoClipFromAsset } from '../../features/video/project/factories/clip';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { acceptProjectVoiceTakes, cleanupProjectVoiceTakePreview } from './project-voice-take';
import { fixture } from './project-voice-take.test-support';
import { prepareProjectAsset, deleteProjectAsset } from '../../composition/persistence/projects';
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
  await acceptProjectVoiceTakes(
    f.access,
    [{ preview: f.preview, placement: { start: 7 } }],
    signal()
  );
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
  await expect(
    acceptProjectVoiceTakes(f.access, [{ preview: f.preview, placement: { start: 0 } }], signal())
  ).rejects.toThrow('storage');
  expect(f.project().clips).toHaveLength(1);
  expect(f.prepared.cancel).not.toHaveBeenCalled();
  expect(deleteProjectAsset).not.toHaveBeenCalled();
  f.preview.expiresAt = 0;
  await acceptProjectVoiceTakes(
    f.access,
    [{ preview: f.preview, placement: { start: 0 } }],
    signal()
  );
  expect(f.update).toHaveBeenCalledOnce();
  expect(prepareProjectAsset).toHaveBeenCalledOnce();
  expect(f.prepared.publish).toHaveBeenCalledOnce();
  expect(f.save).toHaveBeenCalledTimes(3);
});
it('refuses retry after Undo, placement change, or a different mounted access', async () => {
  const f = fixture();
  await acceptProjectVoiceTakes(
    f.access,
    [{ preview: f.preview, placement: { start: 0 } }],
    signal()
  );
  await expect(
    acceptProjectVoiceTakes(f.access, [{ preview: f.preview, placement: { start: 3 } }], signal())
  ).rejects.toThrow('stale');
  await expect(
    acceptProjectVoiceTakes(
      { ...f.access },
      [{ preview: f.preview, placement: { start: 0 } }],
      signal()
    )
  ).rejects.toThrow('stale');
  f.undo();
  await expect(
    acceptProjectVoiceTakes(f.access, [{ preview: f.preview, placement: { start: 0 } }], signal())
  ).rejects.toThrow('stale');
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
  const first = acceptProjectVoiceTakes(
    f.access,
    [{ preview: f.preview, placement: { start: 0 } }],
    signal()
  );
  await entered.promise;
  await expect(
    acceptProjectVoiceTakes(f.access, [{ preview: f.preview, placement: { start: 0 } }], signal())
  ).rejects.toThrow('busy');
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
    const operation = acceptProjectVoiceTakes(
      f.access,
      [{ preview: f.preview, placement: { start: 0 } }],
      signal()
    );
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
    acceptProjectVoiceTakes(
      f.access,
      [{ preview: f.preview, placement: { start: 0 } }],
      controller.signal
    )
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
  const operation = acceptProjectVoiceTakes(
    f.access,
    [{ preview: f.preview, placement: { start: 0 } }],
    signal()
  );
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
  await expect(
    acceptProjectVoiceTakes(f.access, [{ preview: f.preview, placement: { start: 0 } }], signal())
  ).rejects.toThrow('publication');
  expect(f.preview.attachment?.cleanup).toBe(f.prepared);
  expect(f.preview.attachment?.prepared).toBeUndefined();
  await cleanupProjectVoiceTakePreview(f.preview);
  expect(f.prepared.cancel).toHaveBeenCalledTimes(2);
  expect(f.preview.attachment).toBeUndefined();
});

it('refuses transfer to another mounted access before publishing or saving', async () => {
  const f = fixture();
  await expect(
    acceptProjectVoiceTakes(
      { ...f.access },
      [{ preview: f.preview, placement: { start: 0 } }],
      signal()
    )
  ).rejects.toThrow('stale');
  expect(f.save).not.toHaveBeenCalled();
  expect(prepareProjectAsset).not.toHaveBeenCalled();
});
it('refuses expired or invalid placement before resource publication', async () => {
  const f = fixture();
  await expect(
    acceptProjectVoiceTakes(f.access, [{ preview: f.preview, placement: { start: -1 } }], signal())
  ).rejects.toThrow('selection');
  f.preview.expiresAt = 0;
  await expect(
    acceptProjectVoiceTakes(f.access, [{ preview: f.preview, placement: { start: 0 } }], signal())
  ).rejects.toThrow('stale');
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
  await expect(
    acceptProjectVoiceTakes(f.access, [{ preview: f.preview, placement: { start: 0 } }], signal())
  ).rejects.toThrow('updater refused');
  expect(f.project().clips).toHaveLength(0);
  await expect(
    acceptProjectVoiceTakes(f.access, [{ preview: f.preview, placement: { start: 0 } }], signal())
  ).rejects.toThrow('physical deletion still unavailable');
  expect(f.update).toHaveBeenCalledOnce();
  expect(prepareProjectAsset).toHaveBeenCalledOnce();
  await acceptProjectVoiceTakes(
    f.access,
    [{ preview: f.preview, placement: { start: 0 } }],
    signal()
  );
  expect(prepareProjectAsset).toHaveBeenCalledTimes(2);
  expect(vi.mocked(prepareProjectAsset).mock.calls[1]![3]).not.toBe(
    vi.mocked(prepareProjectAsset).mock.calls[0]![3]
  );
  expect(f.prepared.publish).toHaveBeenCalledOnce();
  expect(f.durable().clips).toHaveLength(1);
});

function originalSelection() {
  const f = fixture();
  const asset = createVideoProjectAsset(
    'Original',
    'VIDEO',
    { kind: 'project-asset', projectAssetId: 'original-source' },
    {
      width: 640,
      height: 360,
      duration: 8,
      mimeType: 'video/webm',
      size: 100,
      hasAudio: true,
      audioPeaks: null,
    }
  );
  const source = createVideoClipFromAsset(f.project().tracks[0]!.id, asset, 640, 360);
  f.project().assets.push(asset);
  f.project().clips.push(source);
  const placement = {
    start: 0,
    originalAudioMute: {
      volume: 0.25,
      targets: [{ assetId: source.assetId, sourceInstanceId: source.id }],
    },
  };
  return { ...f, source, placement, selected: [{ preview: f.preview, placement }] };
}

it('freezes original choices before the Save barrier and rejects a changed retry without reinsertion', async () => {
  const f = originalSelection();
  const saved = gate(),
    entered = gate();
  const save = f.save.getMockImplementation()!;
  f.save.mockImplementationOnce(async () => {
    entered.release();
    await saved.promise;
    await save();
  });
  const accepting = acceptProjectVoiceTakes(f.access, f.selected, signal());
  await entered.promise;
  f.placement.originalAudioMute.targets[0]!.sourceInstanceId = 'late-input-mutation';
  f.placement.originalAudioMute.volume = 0;
  saved.release();
  await accepting;
  const accepted = f.project().clips.find((clip) => clip.type === 'AUDIO');
  expect(accepted).toMatchObject({
    originalAudioMute: { volume: 0.25, targets: [{ sourceInstanceId: f.source.id }] },
  });
  await expect(acceptProjectVoiceTakes(f.access, f.selected, signal())).rejects.toThrow('stale');
  expect(f.update).toHaveBeenCalledOnce();
  expect(prepareProjectAsset).toHaveBeenCalledOnce();
});

it('refuses target removal during Save without publishing a new take and permits explicit fresh retry', async () => {
  const f = originalSelection();
  const entered = gate(),
    saved = gate();
  const save = f.save.getMockImplementation()!;
  f.save.mockImplementationOnce(async () => {
    entered.release();
    await saved.promise;
    await save();
  });
  const accepting = acceptProjectVoiceTakes(f.access, f.selected, signal());
  await entered.promise;
  f.access.update((current) => ({ ...current, clips: [] }));
  saved.release();
  await expect(accepting).rejects.toThrow('stale');
  expect(prepareProjectAsset).not.toHaveBeenCalled();
  expect(f.project().clips).toEqual([]);
  f.access.update((current) => ({ ...current, clips: [f.source] }));
  await acceptProjectVoiceTakes(f.access, f.selected, signal());
  expect(f.project().clips.some((clip) => clip.type === 'AUDIO')).toBe(true);
});

it('retains exact original choices through failed Save and retries no preparation or insertion', async () => {
  const f = originalSelection();
  const save = f.save.getMockImplementation()!;
  f.save.mockImplementationOnce(save).mockRejectedValueOnce(new Error('storage'));
  await expect(acceptProjectVoiceTakes(f.access, f.selected, signal())).rejects.toThrow('storage');
  await acceptProjectVoiceTakes(f.access, f.selected, signal());
  expect(f.update).toHaveBeenCalledOnce();
  expect(prepareProjectAsset).toHaveBeenCalledOnce();
  expect(f.durable().clips.find((clip) => clip.type === 'AUDIO')).toMatchObject({
    originalAudioMute: f.placement.originalAudioMute,
  });
});
