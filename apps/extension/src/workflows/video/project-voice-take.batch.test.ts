import { createVideoProjectAsset } from '../../features/video/project/factories/creation';
import { createVideoClipFromAsset } from '../../features/video/project/factories/clip';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  acceptProjectVoiceTakes,
  cleanupProjectVoiceTakePreview,
  type ProjectVoiceTakePreview,
  type ProjectVoiceTakeSelection,
} from './project-voice-take';
import { fixture } from './project-voice-take.test-support';
import { createVideoProjectTrack } from '../../features/video/project/factories/creation';
import { VideoTrackKind } from '../../features/video/project/types';
import {
  prepareProjectAsset,
  deleteProjectAsset,
  type PreparedProjectAsset,
} from '../../composition/persistence/projects';
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
  discardAudioStaging: vi.fn(),
}));

function gate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { release, promise };
}
function batchFixture(publish?: (index: number) => Promise<void>) {
  const f = fixture();
  const second: ProjectVoiceTakePreview = {
    ...f.preview,
    filename: 'Second',
    duration: 3,
    url: 'blob:second',
    source: { kind: 'local' },
    textSnapshot: {
      ...f.preview.textSnapshot,
      text: {
        kind: 'gallery',
        textId: 'second',
        revision: 1,
        timingRevision: 1,
        text: 'Second phrase',
        start: 4,
        end: 5,
        timeDomain: 'result',
      },
    },
  };
  const resources: PreparedProjectAsset[] = [];
  vi.mocked(prepareProjectAsset).mockImplementation(async (_blob, _mime, _name, id) => {
    if (!id) throw new Error('Missing resource identity');
    const index = resources.length;
    const handle: PreparedProjectAsset = {
      ...f.prepared,
      id,
      publish: vi.fn(async () => {
        f.order.push(`publish:${index}`);
        await publish?.(index);
      }),
      cancel: vi.fn(async () => undefined),
    };
    resources.push(handle);
    f.order.push('prepare');
    return handle;
  });
  const selections: ProjectVoiceTakeSelection[] = [
    { preview: f.preview, placement: { start: 0 } },
    { preview: second, placement: { start: 12 } },
  ];
  return { ...f, second, selections, resources, initialTrackCount: f.project().tracks.length };
}
const signal = () => new AbortController().signal;
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('URL', { revokeObjectURL: vi.fn() });
  vi.mocked(deleteProjectAsset).mockResolvedValue(undefined);
  vi.mocked(discardAudioStaging).mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllGlobals());

it('publishes all private takes before one update and saves complete independent durations', async () => {
  const f = batchFixture();
  await acceptProjectVoiceTakes(f.access, f.selections, signal());
  expect(f.order).toEqual([
    'save',
    'prepare',
    'prepare',
    'publish:0',
    'publish:1',
    'update',
    'save',
  ]);
  expect(f.update).toHaveBeenCalledOnce();
  expect(f.project().clips.map(({ startTime, duration }) => [startTime, duration])).toEqual([
    [0, 12],
    [12, 3],
  ]);
  expect(f.project().tracks).toHaveLength(f.initialTrackCount + 2);
  expect(f.durable().clips).toHaveLength(2);
  expect(f.project().duration).toBe(15);
  expect(new Set(f.resources.map(({ id }) => id)).size).toBe(2);
  expect(
    vi.mocked(prepareProjectAsset).mock.calls.every((call) => call[6]?.publishToLibrary === false)
  ).toBe(true);
  f.preview.textSnapshot.text.text = 'Edited later';
  expect(f.durable().clips[0]).toMatchObject({
    textSnapshot: { text: { text: 'Historical words' } },
  });
  await Promise.all(f.selections.map(({ preview }) => cleanupProjectVoiceTakePreview(preview)));
  expect(deleteProjectAsset).not.toHaveBeenCalled();
  expect(discardAudioStaging).toHaveBeenCalledOnce();
});

it.each([false, true])(
  'checks all placements on one lane before preparation (overlap=%s)',
  async (overlap) => {
    const f = batchFixture();
    const track = createVideoProjectTrack('Voice', 0, VideoTrackKind.AUDIO);
    f.project().tracks.push(track);
    await f.access.save();
    f.update.mockClear();
    f.selections[0]!.placement = { trackId: track.id, start: 0 };
    f.selections[1]!.placement = { trackId: track.id, start: overlap ? 6 : 12 };
    if (overlap) {
      await expect(acceptProjectVoiceTakes(f.access, f.selections, signal())).rejects.toThrow(
        'selection'
      );
      expect(prepareProjectAsset).not.toHaveBeenCalled();
      expect(f.project().clips).toEqual([]);
      expect(f.update).not.toHaveBeenCalled();
    } else {
      await acceptProjectVoiceTakes(f.access, f.selections, signal());
      expect(f.project().tracks).toHaveLength(f.initialTrackCount + 1);
      expect(f.project().clips.map(({ trackId }) => trackId)).toEqual([track.id, track.id]);
      expect(f.update).toHaveBeenCalledOnce();
    }
  }
);

it('retries one Save for the complete receipt and refuses a changed subset or placement', async () => {
  const f = batchFixture();
  const save = f.save.getMockImplementation()!;
  f.save.mockImplementationOnce(save).mockRejectedValueOnce(new Error('storage'));
  await expect(acceptProjectVoiceTakes(f.access, f.selections, signal())).rejects.toThrow(
    'storage'
  );
  expect(f.project().clips).toHaveLength(2);
  expect(f.durable().clips).toHaveLength(0);
  await expect(
    acceptProjectVoiceTakes(f.access, f.selections.slice(0, 1), signal())
  ).rejects.toThrow('stale');
  await expect(
    acceptProjectVoiceTakes(
      f.access,
      [f.selections[0]!, { preview: f.second, placement: { start: 14 } }],
      signal()
    )
  ).rejects.toThrow('stale');
  await acceptProjectVoiceTakes(f.access, f.selections, signal());
  expect(f.save).toHaveBeenCalledTimes(3);
  expect(f.update).toHaveBeenCalledOnce();
  expect(prepareProjectAsset).toHaveBeenCalledTimes(2);
  expect(f.resources.every(({ publish }) => vi.mocked(publish).mock.calls.length === 1)).toBe(true);
  expect(f.durable().clips).toHaveLength(2);
});

it('rejects empty and duplicate-preview batches before any writer', async () => {
  const f = batchFixture();
  await expect(acceptProjectVoiceTakes(f.access, [], signal())).rejects.toThrow('invalid-request');
  await expect(
    acceptProjectVoiceTakes(f.access, [f.selections[0]!, f.selections[0]!], signal())
  ).rejects.toThrow('invalid-request');
  expect(f.save).not.toHaveBeenCalled();
  expect(prepareProjectAsset).not.toHaveBeenCalled();
});

it('cancels the first resource when preparation of the second fails', async () => {
  const f = batchFixture();
  const prepare = vi.mocked(prepareProjectAsset).getMockImplementation()!;
  vi.mocked(prepareProjectAsset)
    .mockImplementationOnce(prepare)
    .mockRejectedValueOnce(new Error('prepare'));
  await expect(acceptProjectVoiceTakes(f.access, f.selections, signal())).rejects.toThrow(
    'prepare'
  );
  expect(f.resources[0]!.publish).not.toHaveBeenCalled();
  expect(f.resources[0]!.cancel).toHaveBeenCalledOnce();
  expect(deleteProjectAsset).toHaveBeenCalledWith(f.resources[0]!.id);
  expect(f.update).not.toHaveBeenCalled();
  expect(f.selections.every(({ preview }) => !preview.attachment)).toBe(true);
});

it('retains failed compensation and never republishes a retired resource on retry', async () => {
  const entered = gate();
  const proceed = gate();
  const f = batchFixture(async (index) => {
    if (index === 0) {
      entered.release();
      await proceed.promise;
    }
    if (index === 1) throw new Error('publish');
  });
  const accepting = acceptProjectVoiceTakes(f.access, f.selections, signal());
  await entered.promise;
  vi.mocked(f.resources[0]!.cancel).mockRejectedValueOnce(new Error('cleanup'));
  proceed.release();
  await expect(accepting).rejects.toThrow('publish');
  const retired = f.resources[0]!;
  expect(f.preview.attachment?.cleanup).toBe(retired);
  expect(f.preview.attachment?.prepared).toBeUndefined();
  expect(f.second.attachment).toBeUndefined();
  expect(f.update).not.toHaveBeenCalled();
  await acceptProjectVoiceTakes(f.access, f.selections, signal());
  expect(retired.publish).toHaveBeenCalledOnce();
  expect(retired.cancel).toHaveBeenCalledTimes(2);
  expect(f.resources[2]!.id).not.toBe(retired.id);
  expect(f.resources[3]!.id).not.toBe(f.resources[1]!.id);
  expect(f.project().clips).toHaveLength(2);
  expect(f.update).toHaveBeenCalledOnce();
});

it.each(['edit', 'remove', 'restore', 'recreate'] as const)(
  'refuses %s before the single project update',
  async (change) => {
    const entered = gate();
    const proceed = gate();
    const f = batchFixture(async (index) => {
      if (index === 0) {
        entered.release();
        await proceed.promise;
      }
    });
    const accepting = acceptProjectVoiceTakes(f.access, f.selections, signal());
    await entered.promise;
    f[change]();
    proceed.release();
    await expect(accepting).rejects.toThrow('stale');
    expect(f.update).not.toHaveBeenCalled();
    expect(f.project().clips).toEqual([]);
    expect(f.resources.every(({ cancel }) => vi.mocked(cancel).mock.calls.length === 1)).toBe(true);
  }
);

it('refuses an overlapping accept while the complete batch owns both previews', async () => {
  const entered = gate();
  const proceed = gate();
  const f = batchFixture(async (index) => {
    if (index === 0) {
      entered.release();
      await proceed.promise;
    }
  });
  const accepting = acceptProjectVoiceTakes(f.access, f.selections, signal());
  await entered.promise;
  await expect(acceptProjectVoiceTakes(f.access, [f.selections[1]!], signal())).rejects.toThrow(
    'busy'
  );
  proceed.release();
  await accepting;
  expect(f.update).toHaveBeenCalledOnce();
});

it('compensates every prepared take after cancellation before insertion', async () => {
  const entered = gate();
  const proceed = gate();
  const controller = new AbortController();
  const f = batchFixture(async (index) => {
    if (index === 0) {
      entered.release();
      await proceed.promise;
    }
  });
  const accepting = acceptProjectVoiceTakes(f.access, f.selections, controller.signal);
  await entered.promise;
  controller.abort();
  proceed.release();
  await expect(accepting).rejects.toMatchObject({ name: 'AbortError' });
  expect(f.update).not.toHaveBeenCalled();
  expect(f.resources.every(({ cancel }) => vi.mocked(cancel).mock.calls.length === 1)).toBe(true);
});

it('waits for batch compensation when a member preview closes during publication', async () => {
  const entered = gate();
  const proceed = gate();
  const f = batchFixture(async (index) => {
    if (index === 0) {
      entered.release();
      await proceed.promise;
    }
  });
  const accepting = acceptProjectVoiceTakes(f.access, f.selections, signal());
  await entered.promise;
  const closing = cleanupProjectVoiceTakePreview(f.second);
  proceed.release();
  await expect(accepting).rejects.toThrow('stale');
  await closing;
  expect(f.update).not.toHaveBeenCalled();
  expect(f.resources.every(({ cancel }) => vi.mocked(cancel).mock.calls.length === 1)).toBe(true);
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:second');
  expect(f.preview.closed).not.toBe(true);
  await acceptProjectVoiceTakes(f.access, [f.selections[0]!], signal());
  expect(f.project().clips).toHaveLength(1);
});

it('retains different explicit original choices for each batch take through one Save receipt retry', async () => {
  const f = batchFixture();
  const asset = createVideoProjectAsset(
    'Original',
    'VIDEO',
    { kind: 'project-asset', projectAssetId: 'original' },
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
  const selected = f.selections.map((item, index) => ({
    ...item,
    placement: {
      ...item.placement,
      originalAudioMute: {
        volume: index === 0 ? 0.25 : 0,
        targets: [{ assetId: source.assetId, sourceInstanceId: source.id }],
      },
    },
  }));
  const save = f.save.getMockImplementation()!;
  f.save.mockImplementationOnce(save).mockRejectedValueOnce(new Error('storage'));
  await expect(acceptProjectVoiceTakes(f.access, selected, signal())).rejects.toThrow('storage');
  await acceptProjectVoiceTakes(f.access, selected, signal());
  expect(
    f
      .project()
      .clips.flatMap((clip) => (clip.type === 'AUDIO' ? [clip.originalAudioMute?.volume] : []))
  ).toEqual([0.25, 0]);
  expect(f.update).toHaveBeenCalledOnce();
  expect(prepareProjectAsset).toHaveBeenCalledTimes(2);
});
