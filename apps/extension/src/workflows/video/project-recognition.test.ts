import { beforeEach, expect, it, vi } from 'vitest';
import { AUDIO_INPUT_MAX_SECONDS } from '../../contracts/ai/audio';
import {
  createEmptyVideoProject,
  createVideoProjectAsset,
} from '../../features/video/project/factories/creation';
import { createVideoClipFromAsset } from '../../features/video/project/factories/clip';
import { getVideoProject } from '../../composition/persistence/projects';
import { readVideoProjectAudioSource } from '../../composition/persistence/projects/audio-source';
import { runReviewSpeechJob } from '../video-review/speech-client';
import { extractReviewSpeechWav, planReviewSpeechChunks } from '../video-review/speech-audio';
import {
  prepareProjectRecognition,
  runProjectRecognition,
  applyProjectRecognition,
  type ProjectRecognitionAccess,
  type ProjectRecognitionOptions,
} from './project-recognition';

vi.mock('../../composition/persistence/projects', () => ({ getVideoProject: vi.fn() }));
vi.mock('../../composition/persistence/projects/audio-source', () => ({
  readVideoProjectAudioSource: vi.fn(),
}));
vi.mock('../video-review/speech-client', () => ({ runReviewSpeechJob: vi.fn() }));
vi.mock('../video-review/speech-audio', () => ({
  extractReviewSpeechWav: vi.fn(),
  planReviewSpeechChunks: vi.fn(),
  reviewSpeechWavIsSilent: vi.fn(async () => false),
}));

function fixture() {
  let project = createEmptyVideoProject('Recognition');
  const asset = createVideoProjectAsset(
    'Audio',
    'VIDEO',
    { kind: 'project-asset', projectAssetId: 'bytes' },
    {
      width: 640,
      height: 360,
      duration: 20,
      mimeType: 'video/webm',
      size: 1,
      hasAudio: true,
      audioPeaks: null,
    }
  );
  const media = createVideoClipFromAsset(project.tracks[0]!.id, asset, 640, 360, 4);
  if (media.type !== 'VIDEO') throw new Error('Expected video');
  project.assets = [asset];
  project.clips = [{ ...media, sourceStart: 2, sourceDuration: 8, duration: 4, playbackRate: 2 }];
  const options: ProjectRecognitionOptions = {
    clipId: media.id,
    modelId: 'model',
    approvedProviderId: 'provider',
    start: 2,
    end: 10,
    grouping: 'sentences-pauses',
  };
  let durable = structuredClone(project);
  let revision = 1;
  const save = vi.fn(async () => {
    durable = structuredClone(project);
  });
  const update = vi.fn((updater: Parameters<ProjectRecognitionAccess['update']>[0]) => {
    project = updater(project);
  });
  const access: ProjectRecognitionAccess = { getProject: () => project, save, update };
  vi.mocked(getVideoProject).mockImplementation(async () => ({
    status: 'ready',
    project: structuredClone(durable),
    workspaceRevision: revision,
  }));
  return {
    access,
    options,
    save,
    update,
    get project() {
      return project;
    },
    change: (change: (current: typeof project) => typeof project) => {
      project = change(project);
    },
    replaceDurable: () => {
      revision++;
    },
  };
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(readVideoProjectAudioSource).mockResolvedValue(new Blob(['audio']));
  vi.mocked(planReviewSpeechChunks).mockImplementation(async (_source, ranges) => [...ranges]);
  vi.mocked(extractReviewSpeechWav).mockResolvedValue(new Blob(['wav']));
  vi.mocked(runReviewSpeechJob).mockResolvedValue({
    type: 'transcript',
    result: { text: 'Hello.', words: [{ text: 'Hello.', start: 0, end: 1 }] },
  });
});
const signal = () => new AbortController().signal;

it('prepares only the saved trimmed native span and refuses edits during the save barrier', async () => {
  const f = fixture();
  const job = await prepareProjectRecognition(f.access, f.options, signal());
  expect(f.save).toHaveBeenCalledOnce();
  expect(job.chunks).toEqual([{ start: 2, end: 10, range: 0 }]);
  expect(readVideoProjectAudioSource).toHaveBeenCalledWith(
    expect.objectContaining({ projectRevision: 1, nativeStart: 2, nativeEnd: 10 })
  );
  await expect(
    prepareProjectRecognition(f.access, { ...f.options, start: 1 }, signal())
  ).rejects.toThrow('selection');
  f.save.mockImplementationOnce(async () => f.change((project) => ({ ...project, clips: [] })));
  await expect(prepareProjectRecognition(f.access, f.options, signal())).rejects.toThrow('stale');
});
it('keeps completed chunks for explicit retry and never publishes a proposal implicitly', async () => {
  const f = fixture();
  vi.mocked(planReviewSpeechChunks).mockResolvedValue([
    { start: 2, end: 6 },
    { start: 6, end: 10 },
  ]);
  const job = await prepareProjectRecognition(f.access, f.options, signal());
  vi.mocked(runReviewSpeechJob)
    .mockResolvedValueOnce({ type: 'transcript', result: { text: 'First.' } })
    .mockRejectedValueOnce(new Error('network-failed'));
  await expect(runProjectRecognition(f.access, job, signal())).rejects.toThrow('network-failed');
  expect(job.chunks[0]?.result).toEqual({ text: 'First.' });
  const resumed = await prepareProjectRecognition(f.access, f.options, signal(), job);
  expect(resumed).toBe(job);
  const proposal = await runProjectRecognition(f.access, job, signal());
  expect(runReviewSpeechJob).toHaveBeenCalledTimes(3);
  expect(proposal.entry.binding).toEqual({
    kind: 'source',
    assetId: f.project.assets[0]!.id,
    sourceInstanceId: f.options.clipId,
  });
  expect(proposal.entry.document.fragments[0]).toMatchObject({
    start: 2,
    end: 6,
    alignment: 'range',
    timeDomain: 'source',
  });
  expect(f.project.textDocuments).toBeUndefined();
  expect(f.update).not.toHaveBeenCalled();
});
it('refuses a late result after clip move, deletion, replacement or recreation', async () => {
  for (const change of ['move', 'delete', 'replace', 'recreate'] as const) {
    const f = fixture();
    const job = await prepareProjectRecognition(f.access, f.options, signal());
    vi.mocked(runReviewSpeechJob).mockImplementationOnce(async () => {
      f.change((project) => ({
        ...project,
        updatedAt: project.updatedAt + 1,
        clips:
          change === 'delete'
            ? []
            : project.clips.map((clip) => ({
                ...clip,
                ...(change === 'move' ? { startTime: 8 } : {}),
                ...(change === 'replace' && clip.type === 'VIDEO' ? { assetId: 'other' } : {}),
              })),
      }));
      return { type: 'transcript', result: { text: 'Late.' } };
    });
    await expect(runProjectRecognition(f.access, job, signal())).rejects.toThrow('stale');
    expect(f.update).not.toHaveBeenCalled();
  }
});
it('cancels extraction without publishing text', async () => {
  const f = fixture();
  const controller = new AbortController();
  const job = await prepareProjectRecognition(f.access, f.options, controller.signal);
  vi.mocked(runReviewSpeechJob).mockImplementationOnce(async (_start, options) => {
    controller.abort();
    await options.prepareInput?.(controller.signal);
    controller.signal.throwIfAborted();
    return { type: 'transcript', result: { text: 'Cancelled.' } };
  });
  await expect(runProjectRecognition(f.access, job, controller.signal)).rejects.toThrow();
  expect(f.update).not.toHaveBeenCalled();
});
it('retains a completed proposal after save failure and acknowledges retry without duplication', async () => {
  const f = fixture();
  const job = await prepareProjectRecognition(f.access, f.options, signal());
  const proposal = await runProjectRecognition(f.access, job, signal());
  f.save.mockRejectedValueOnce(new Error('storage-failed'));
  await expect(applyProjectRecognition(f.access, proposal, signal(), 'add')).rejects.toThrow(
    'storage-failed'
  );
  expect(proposal.receipt).toBeDefined();
  expect(f.project.textDocuments).toHaveLength(1);
  await applyProjectRecognition(f.access, proposal, signal(), 'add');
  expect(f.project.textDocuments).toHaveLength(1);
  expect(f.update).toHaveBeenCalledOnce();
  expect(runReviewSpeechJob).toHaveBeenCalledOnce();
});
it('does not resurrect an applied document after Undo or project recreation', async () => {
  for (const recreate of [false, true]) {
    const f = fixture();
    const job = await prepareProjectRecognition(f.access, f.options, signal());
    const proposal = await runProjectRecognition(f.access, job, signal());
    await applyProjectRecognition(f.access, proposal, signal(), 'add');
    f.change((project) => ({
      ...project,
      ...(recreate ? { id: 'replacement' } : { textDocuments: [] }),
    }));
    await expect(applyProjectRecognition(f.access, proposal, signal(), 'add')).rejects.toThrow(
      'stale'
    );
    expect(f.update).toHaveBeenCalledOnce();
  }
});
it('refuses a stale durable revision before provider work and final acknowledgement', async () => {
  const f = fixture();
  const job = await prepareProjectRecognition(f.access, f.options, signal());
  f.replaceDurable();
  await expect(runProjectRecognition(f.access, job, signal())).rejects.toThrow('stale');
  expect(runReviewSpeechJob).not.toHaveBeenCalled();
  const next = await prepareProjectRecognition(f.access, f.options, signal());
  const proposal = await runProjectRecognition(f.access, next, signal());
  f.replaceDurable();
  await expect(applyProjectRecognition(f.access, proposal, signal(), 'add')).rejects.toThrow(
    'stale'
  );
  expect(f.update).not.toHaveBeenCalled();
});
it('uses canonical saved time when explicit saving leaves local time unchanged', async () => {
  const f = fixture();
  const canonical = { ...f.project, updatedAt: f.project.updatedAt + 10 };
  vi.mocked(getVideoProject).mockResolvedValue({
    status: 'ready',
    project: canonical,
    workspaceRevision: 2,
  });
  const job = await prepareProjectRecognition(f.access, f.options, signal());
  expect(job.project.updatedAt).toBe(canonical.updatedAt);
  expect(job.localUpdatedAt).toBe(f.project.updatedAt);
  await runProjectRecognition(f.access, job, signal());
  expect(runReviewSpeechJob).toHaveBeenLastCalledWith(
    expect.objectContaining({
      scope: expect.objectContaining({ projectUpdatedAt: canonical.updatedAt, projectRevision: 2 }),
    }),
    expect.anything()
  );
});
it('recognizes an AUDIO clip selection in native time without changing another placement', async () => {
  const f = fixture();
  f.change((project) => ({
    ...project,
    clips: project.clips.map((clip) =>
      clip.type === 'VIDEO' ? { ...clip, type: 'AUDIO' as const } : clip
    ),
    assets: project.assets.map((asset) => ({ ...asset, type: 'AUDIO' as const })),
  }));
  const job = await prepareProjectRecognition(
    f.access,
    { ...f.options, start: 3, end: 7 },
    signal()
  );
  const proposal = await runProjectRecognition(f.access, job, signal());
  expect(proposal.entry.document.fragments[0]).toMatchObject({
    start: 3,
    end: 4,
    timeDomain: 'source',
  });
  expect(proposal.entry.binding).toMatchObject({
    kind: 'source',
    sourceInstanceId: f.options.clipId,
  });
  expect(f.project.clips[0]?.type).toBe('AUDIO');
  expect(f.update).not.toHaveBeenCalled();
});
it('chunks native selections for multipart and refuses oversized audio-chat without fallback', async () => {
  const f = fixture();
  const start = 10_000;
  const end = start + 800;
  f.change((project) => ({
    ...project,
    clips: project.clips.map((clip) =>
      clip.type === 'VIDEO'
        ? { ...clip, sourceStart: start, sourceDuration: 800, duration: 400 }
        : clip
    ),
    assets: project.assets.map((asset) => ({
      ...asset,
      metadata: { ...asset.metadata, duration: end + 2 },
    })),
  }));
  const options = { ...f.options, start, end };
  await expect(
    prepareProjectRecognition(
      f.access,
      { ...options, recognition: { mode: 'transcribe', granularity: 'sentence', prompt: '' } },
      signal()
    )
  ).rejects.toThrow('too-large');
  expect(f.save).not.toHaveBeenCalled();
  const split = start + AUDIO_INPUT_MAX_SECONDS;
  vi.mocked(planReviewSpeechChunks).mockResolvedValue([
    { start, end: split },
    { start: split, end },
  ]);
  const job = await prepareProjectRecognition(f.access, options, signal());
  await runProjectRecognition(f.access, job, signal());
  const scopes = vi.mocked(runReviewSpeechJob).mock.calls.map(([request]) => request.scope);
  expect(scopes).toHaveLength(2);
  expect(scopes).toEqual([
    expect.objectContaining({ nativeStart: start, nativeEnd: split }),
    expect.objectContaining({ nativeStart: split, nativeEnd: end }),
  ]);
});
it('refuses acknowledgement after canonical deletion without discarding the local receipt', async () => {
  const f = fixture();
  const job = await prepareProjectRecognition(f.access, f.options, signal());
  const proposal = await runProjectRecognition(f.access, job, signal());
  f.save.mockImplementationOnce(async () => {
    vi.mocked(getVideoProject).mockResolvedValue({ status: 'notFound' });
  });
  await expect(applyProjectRecognition(f.access, proposal, signal(), 'add')).rejects.toThrow(
    'stale'
  );
  expect(proposal.receipt).toBeDefined();
  expect(f.project.textDocuments).toHaveLength(1);
  expect(f.update).toHaveBeenCalledOnce();
  expect(runReviewSpeechJob).toHaveBeenCalledOnce();
});
it('admits boundary-sized audio-chat selections at a large source offset', async () => {
  const f = fixture();
  f.change((project) => ({
    ...project,
    clips: project.clips.map((clip) =>
      clip.type === 'VIDEO'
        ? { ...clip, sourceStart: 10_000, sourceDuration: 800, duration: 400 }
        : clip
    ),
    assets: project.assets.map((asset) => ({
      ...asset,
      metadata: { ...asset.metadata, duration: 10_800 },
    })),
  }));
  const options = {
    ...f.options,
    start: 10_000,
    end: 10_000 + AUDIO_INPUT_MAX_SECONDS,
    recognition: { mode: 'transcribe' as const, granularity: 'sentence' as const, prompt: '' },
  };
  const job = await prepareProjectRecognition(f.access, options, signal());
  expect(job.chunks).toEqual([{ start: options.start, end: options.end, range: 0 }]);
  await runProjectRecognition(f.access, job, signal());
  expect(runReviewSpeechJob).toHaveBeenCalledWith(
    expect.objectContaining({
      recognition: options.recognition,
      scope: expect.objectContaining({ nativeStart: options.start, nativeEnd: options.end }),
    }),
    expect.anything()
  );
});
