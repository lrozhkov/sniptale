import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { fixture, approvedSelection } from './project-text-voice.test-support';
import { captureProjectTextVoiceQueue, runProjectTextVoiceQueue } from './project-text-voice';
import { cleanupProjectVoiceTakePreview, type ProjectVoiceTakePreview } from './project-voice-take';
import { runReviewSpeechJob } from '../audio-jobs/client';
import { decodeReviewSpeechDuration } from '../video-review/speech-audio';
import {
  readAudioStaging,
  discardAudioStaging,
} from '../../composition/persistence/assets/audio-staging';

vi.mock('../../composition/persistence/projects', () => ({ getVideoProject: vi.fn() }));
vi.mock('../../composition/persistence/projects/revision', () => ({
  isCurrentVideoProjectSnapshot: vi.fn(),
}));
vi.mock('../audio-jobs/client', () => ({ runReviewSpeechJob: vi.fn() }));
vi.mock('../video-review/speech-audio', () => ({ decodeReviewSpeechDuration: vi.fn() }));
vi.mock('../../composition/persistence/assets/audio-staging', () => ({
  readAudioStaging: vi.fn(),
  discardAudioStaging: vi.fn(),
}));
const profile = { modelId: 'model', voiceId: 'voice', responseFormat: 'mp3' as const };
const selected = [
  { documentId: 'script', fragmentId: 'phrase' },
  { documentId: 'other', fragmentId: 'phrase' },
];
const first = { id: 'first', mimeType: 'audio/mpeg' as const, size: 4 };
const second = { ...first, id: 'second' };
const signal = () => new AbortController().signal;
function gate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}
function queueFixture() {
  const f = fixture();
  const other = structuredClone(f.project.textDocuments![0]!);
  other.id = 'other';
  other.document.fragments[0]!.text = 'Second phrase';
  f.project.textDocuments!.push(other);
  const previews: ProjectVoiceTakePreview[] = [];
  const ready = vi.fn((preview: ProjectVoiceTakePreview) => previews.push(preview));
  const progress = vi.fn();
  return {
    ...f,
    previews,
    events: { ready, progress },
    captureQueue: () => captureProjectTextVoiceQueue(f.access, selected, profile, signal()),
  };
}
beforeEach(() => {
  vi.resetAllMocks();
  let urls = 0;
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => `blob:${++urls}`),
    revokeObjectURL: vi.fn(),
  });
  vi.mocked(runReviewSpeechJob)
    .mockResolvedValueOnce({ type: 'audio', staged: first })
    .mockResolvedValueOnce({ type: 'audio', staged: second });
  vi.mocked(readAudioStaging).mockResolvedValue(
    new File(['data'], 'voice.mp3', { type: 'audio/mpeg' })
  );
  vi.mocked(decodeReviewSpeechDuration).mockResolvedValueOnce(12).mockResolvedValueOnce(9);
  vi.mocked(discardAudioStaging).mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllGlobals());

it('freezes ordered document-scoped selection and profile without saving or starting a job', async () => {
  const f = queueFixture();
  const input = [...selected.map((item) => ({ ...item })), { ...selected[0]! }];
  const settings = { ...profile };
  const pending = captureProjectTextVoiceQueue(f.access, input, settings, signal());
  input[1]!.documentId = 'changed';
  input.pop();
  settings.voiceId = 'changed';
  const plan = await pending;
  expect(plan.items.map(({ documentId, fragmentId }) => ({ documentId, fragmentId }))).toEqual(
    selected
  );
  expect(plan.items.map((item) => item.capture.profile.voiceId)).toEqual(['voice', 'voice']);
  expect(plan.items.map((item) => item.capture.basis.fragment.text)).toEqual([
    'Speak this',
    'Second phrase',
  ]);
  expect(plan.phase).toBe('captured');
  expect(f.save).not.toHaveBeenCalled();
  expect(runReviewSpeechJob).not.toHaveBeenCalled();
});
it('generates two independent takes sequentially and hands them off without project insertion', async () => {
  const f = queueFixture();
  const plan = await f.captureQueue();
  await runProjectTextVoiceQueue(f.access, plan, approvedSelection, signal(), f.events);
  expect(plan.phase).toBe('complete');
  expect(vi.mocked(runReviewSpeechJob).mock.calls.map(([request]) => request)).toMatchObject([
    { text: 'Speak this', approvedProviderId: 'provider' },
    { text: 'Second phrase', approvedProviderId: 'provider' },
  ]);
  expect(f.previews.map((item) => item.duration)).toEqual([12, 9]);
  expect(f.previews.map((item) => item.textSnapshot.documentId)).toEqual(['script', 'other']);
  expect(f.previews.map((item) => item.url)).toEqual(['blob:1', 'blob:2']);
  expect(f.events.progress.mock.calls.map(([value]) => value.completed)).toEqual([0, 1, 1, 2]);
  expect(f.events.progress.mock.calls.every(([value]) => value.total === 2)).toBe(true);
  expect(f.project.clips).toEqual([]);
  expect(f.project.assets).toEqual([]);
  expect(discardAudioStaging).not.toHaveBeenCalled();
  await cleanupProjectVoiceTakePreview(f.previews[0]!);
  expect(discardAudioStaging).toHaveBeenCalledExactlyOnceWith(
    first,
    expect.objectContaining({ target: { kind: 'project-text', ...selected[0] } })
  );
  expect(f.previews[1]!.closed).not.toBe(true);
  await expect(
    runProjectTextVoiceQueue(f.access, plan, approvedSelection, signal(), f.events)
  ).rejects.toThrow('invalid-request');
  expect(runReviewSpeechJob).toHaveBeenCalledTimes(2);
});
it('preserves a completed take after a later paid failure and refuses implicit retry', async () => {
  const f = queueFixture();
  const plan = await f.captureQueue();
  vi.mocked(runReviewSpeechJob).mockReset();
  vi.mocked(runReviewSpeechJob)
    .mockResolvedValueOnce({ type: 'audio', staged: first })
    .mockRejectedValueOnce(new Error('interrupted'));
  await expect(
    runProjectTextVoiceQueue(f.access, plan, approvedSelection, signal(), f.events)
  ).rejects.toThrow('interrupted');
  expect(plan.phase).toBe('failed');
  expect(f.previews).toHaveLength(1);
  expect(f.previews[0]!.textSnapshot.text.text).toBe('Speak this');
  expect(discardAudioStaging).not.toHaveBeenCalled();
  await expect(
    runProjectTextVoiceQueue(f.access, plan, approvedSelection, signal(), f.events)
  ).rejects.toThrow('invalid-request');
  expect(runReviewSpeechJob).toHaveBeenCalledTimes(2);
});
it('cancels remaining work while keeping an already admitted preview', async () => {
  const f = queueFixture();
  const plan = await f.captureQueue();
  const controller = new AbortController();
  f.events.ready.mockImplementation((preview) => {
    f.previews.push(preview);
    controller.abort();
    return f.previews.length;
  });
  await expect(
    runProjectTextVoiceQueue(f.access, plan, approvedSelection, controller.signal, f.events)
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(f.previews).toHaveLength(1);
  expect(runReviewSpeechJob).toHaveBeenCalledOnce();
  expect(discardAudioStaging).not.toHaveBeenCalled();
});
it('discards a late second response after cancellation without releasing the first take', async () => {
  const f = queueFixture();
  const plan = await f.captureQueue();
  const controller = new AbortController();
  const entered = gate();
  const hold = gate();
  vi.mocked(runReviewSpeechJob).mockReset();
  vi.mocked(runReviewSpeechJob)
    .mockResolvedValueOnce({ type: 'audio', staged: first })
    .mockImplementationOnce(async () => {
      entered.release();
      await hold.promise;
      return { type: 'audio', staged: second };
    });
  const pending = runProjectTextVoiceQueue(
    f.access,
    plan,
    approvedSelection,
    controller.signal,
    f.events
  );
  await entered.promise;
  expect(f.previews).toHaveLength(1);
  controller.abort();
  hold.release();
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  expect(f.previews).toHaveLength(1);
  expect(discardAudioStaging).toHaveBeenCalledExactlyOnceWith(
    second,
    expect.objectContaining({ target: { kind: 'project-text', ...selected[1] } })
  );
  expect(URL.revokeObjectURL).not.toHaveBeenCalledWith('blob:1');
});
it('disposes only a preview refused by its synchronous ownership handoff', async () => {
  const f = queueFixture();
  const plan = await f.captureQueue();
  f.events.ready
    .mockImplementationOnce((preview) => f.previews.push(preview))
    .mockImplementationOnce(() => {
      throw new Error('closed');
    });
  await expect(
    runProjectTextVoiceQueue(f.access, plan, approvedSelection, signal(), f.events)
  ).rejects.toThrow('closed');
  expect(f.previews).toHaveLength(1);
  expect(discardAudioStaging).toHaveBeenCalledExactlyOnceWith(second, expect.anything());
  expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:2');
});
it('blocks concurrent starts of the same plan while the first Save waits', async () => {
  const f = queueFixture();
  const plan = await f.captureQueue();
  const hold = gate();
  const save = f.save.getMockImplementation()!;
  f.save.mockImplementationOnce(async () => {
    await hold.promise;
    await save();
  });
  const pending = runProjectTextVoiceQueue(f.access, plan, approvedSelection, signal(), f.events);
  await expect(
    runProjectTextVoiceQueue(f.access, plan, approvedSelection, signal(), f.events)
  ).rejects.toThrow('invalid-request');
  hold.release();
  await pending;
  expect(runReviewSpeechJob).toHaveBeenCalledTimes(2);
});
it('rejects edited local text before another Save or paid request and keeps the ready take', async () => {
  const f = queueFixture();
  const plan = await f.captureQueue();
  f.events.ready.mockImplementation((preview) => {
    f.previews.push(preview);
    f.change();
    return f.previews.length;
  });
  await expect(
    runProjectTextVoiceQueue(f.access, plan, approvedSelection, signal(), f.events)
  ).rejects.toThrow('stale');
  expect(f.save).toHaveBeenCalledOnce();
  expect(runReviewSpeechJob).toHaveBeenCalledOnce();
  expect(f.previews[0]!.textSnapshot.text.text).toBe('Speak this');
});
it.each(['remove', 'trash', 'restore', 'recreate'] as const)(
  'refuses canonical %s between queued requests without discarding the completed take',
  async (operation) => {
    const f = queueFixture();
    const plan = await f.captureQueue();
    f.events.ready.mockImplementation((preview) => {
      f.previews.push(preview);
      f[operation]();
      f.save.mockImplementation(async () => undefined);
      return f.previews.length;
    });
    await expect(
      runProjectTextVoiceQueue(f.access, plan, approvedSelection, signal(), f.events)
    ).rejects.toThrow('stale');
    expect(runReviewSpeechJob).toHaveBeenCalledOnce();
    expect(f.previews).toHaveLength(1);
    expect(discardAudioStaging).not.toHaveBeenCalled();
  }
);
it('refuses missing selection, profile, target, foreign access and expired work without a job', async () => {
  const f = queueFixture();
  await expect(captureProjectTextVoiceQueue(f.access, [], profile, signal())).rejects.toThrow(
    'invalid-request'
  );
  await expect(
    captureProjectTextVoiceQueue(f.access, selected, { ...profile, voiceId: '' }, signal())
  ).rejects.toThrow('invalid-request');
  await expect(
    captureProjectTextVoiceQueue(
      f.access,
      [{ documentId: 'missing', fragmentId: 'phrase' }],
      profile,
      signal()
    )
  ).rejects.toThrow();
  const plan = await f.captureQueue();
  await expect(
    runProjectTextVoiceQueue({ ...f.access }, plan, approvedSelection, signal(), f.events)
  ).rejects.toThrow('invalid-request');
  await expect(
    runProjectTextVoiceQueue(
      f.access,
      plan,
      { ...approvedSelection, approvedProviderId: ' ' },
      signal(),
      f.events
    )
  ).rejects.toThrow('invalid-request');
  plan.items[1]!.capture.expiresAt = 0;
  await expect(
    runProjectTextVoiceQueue(f.access, plan, approvedSelection, signal(), f.events)
  ).rejects.toThrow('stale');
  expect(f.save).not.toHaveBeenCalled();
  expect(runReviewSpeechJob).not.toHaveBeenCalled();
});
it('rejects a changed project while capture hashing waits without saving or requesting speech', async () => {
  const f = queueFixture();
  const entered = gate();
  const hold = gate();
  const digest = crypto.subtle.digest.bind(crypto.subtle);
  const spy = vi.spyOn(crypto.subtle, 'digest').mockImplementationOnce(async (...args) => {
    entered.release();
    await hold.promise;
    return digest(...args);
  });
  try {
    const pending = f.captureQueue();
    await entered.promise;
    f.change();
    hold.release();
    await expect(pending).rejects.toThrow('stale');
    expect(f.save).not.toHaveBeenCalled();
    expect(runReviewSpeechJob).not.toHaveBeenCalled();
  } finally {
    spy.mockRestore();
  }
});

it('keeps one approved destination for every queued narration request', async () => {
  const f = queueFixture();
  const plan = await f.captureQueue();
  const selection = { ...approvedSelection };
  f.events.ready.mockImplementation((preview) => {
    f.previews.push(preview);
    selection.approvedDestination = `sha256:${'b'.repeat(64)}`;
    selection.approvedModelCode = 'replacement';
    return f.previews.length;
  });
  await runProjectTextVoiceQueue(f.access, plan, selection, signal(), f.events);
  expect(runReviewSpeechJob).toHaveBeenCalledTimes(2);
  for (const [request] of vi.mocked(runReviewSpeechJob).mock.calls)
    expect(request).toMatchObject({ approvedSelection });
});
