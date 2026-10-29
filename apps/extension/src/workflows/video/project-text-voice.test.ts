import { cleanupProjectVoiceTakePreview } from './project-voice-take';
import { fixture, approvedSelection } from './project-text-voice.test-support';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { isCurrentVideoProjectSnapshot } from '../../composition/persistence/projects/revision';
import { runReviewSpeechJob } from '../audio-jobs/client';
import { decodeReviewSpeechDuration } from '../video-review/speech-audio';
import {
  readAudioStaging,
  discardAudioStaging,
} from '../../composition/persistence/assets/audio-staging';
import { captureProjectTextVoice, generateProjectTextVoice } from './project-text-voice';
import type { AudioStagedHandle } from '../../contracts/ai/audio';

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
const staged: AudioStagedHandle = { id: 'ticket', mimeType: 'audio/mpeg', size: 4 };
const signal = () => new AbortController().signal;
function gate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:voice'), revokeObjectURL: vi.fn() });
  vi.mocked(runReviewSpeechJob).mockResolvedValue({ type: 'audio', staged });
  vi.mocked(readAudioStaging).mockResolvedValue(
    new File(['data'], 'voice.mp3', { type: 'audio/mpeg' })
  );
  vi.mocked(decodeReviewSpeechDuration).mockResolvedValue(12);
  vi.mocked(discardAudioStaging).mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllGlobals());
it('saves before one text-only job and returns an independent long audition without choosing placement', async () => {
  const f = fixture();
  const capture = await f.capture();
  const preview = await generateProjectTextVoice(f.access, capture, approvedSelection, signal());
  expect(f.save).toHaveBeenCalledOnce();
  expect(runReviewSpeechJob).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      operation: 'speech',
      approvedProviderId: 'provider',
      modelId: 'model',
      text: 'Speak this',
      textRevision: 1,
      phraseId: 'phrase',
      scope: expect.objectContaining({
        projectRevision: 2,
        target: { kind: 'project-text', documentId: 'script', fragmentId: 'phrase' },
      }),
    }),
    { signal: expect.any(AbortSignal) }
  );
  expect(preview).toMatchObject({
    duration: 12,
    url: 'blob:voice',
    textSnapshot: {
      documentId: 'script',
      binding: { kind: 'project' },
      text: { text: 'Speak this', profile },
    },
  });
  expect(f.project.clips).toEqual([]);
  f.change();
  expect(preview.textSnapshot.text.text).toBe('Speak this');
  expect(capture.phase).toBe('complete');
  await expect(
    generateProjectTextVoice(f.access, capture, approvedSelection, signal())
  ).rejects.toThrow('invalid-request');
  expect(runReviewSpeechJob).toHaveBeenCalledOnce();
});
it('freezes profile inputs and refuses later local edits before Save', async () => {
  const f = fixture();
  const input = { ...profile };
  const capture = await captureProjectTextVoice(f.access, 'script', 'phrase', input, signal());
  input.voiceId = 'Other';
  expect(capture.profile.voiceId).toBe('voice');
  f.change();
  await expect(
    generateProjectTextVoice(f.access, capture, approvedSelection, signal())
  ).rejects.toThrow('stale');
  expect(f.save).not.toHaveBeenCalled();
  expect(runReviewSpeechJob).not.toHaveBeenCalled();
});
it('blocks concurrent generation of one capture while Save is pending', async () => {
  const f = fixture();
  const capture = await f.capture();
  const hold = gate();
  f.save.mockImplementationOnce(() => hold.promise);
  const pending = generateProjectTextVoice(f.access, capture, approvedSelection, signal());
  await expect(
    generateProjectTextVoice(f.access, capture, approvedSelection, signal())
  ).rejects.toThrow('invalid-request');
  hold.release();
  await pending;
  expect(runReviewSpeechJob).toHaveBeenCalledOnce();
});
it('allows explicit retry after a pre-request Save failure without a paid retry', async () => {
  const f = fixture();
  const capture = await f.capture();
  f.save.mockRejectedValueOnce(new Error('storage'));
  await expect(
    generateProjectTextVoice(f.access, capture, approvedSelection, signal())
  ).rejects.toThrow('storage');
  expect(capture.phase).toBe('captured');
  expect(runReviewSpeechJob).not.toHaveBeenCalled();
  await generateProjectTextVoice(f.access, capture, approvedSelection, signal());
  expect(runReviewSpeechJob).toHaveBeenCalledOnce();
});
it.each(['remove', 'trash', 'restore', 'recreate'] as const)(
  'refuses canonical %s during Save before requesting speech',
  async (operation) => {
    const f = fixture();
    const capture = await f.capture();
    f.save.mockImplementationOnce(async () => {
      f[operation]();
    });
    await expect(
      generateProjectTextVoice(f.access, capture, approvedSelection, signal())
    ).rejects.toThrow('stale');
    expect(runReviewSpeechJob).not.toHaveBeenCalled();
  }
);
it.each(['remove', 'trash', 'restore', 'recreate', 'change', 'close'] as const)(
  'discards exactly its output after %s while the job waits',
  async (operation) => {
    const f = fixture();
    const capture = await f.capture();
    const started = gate();
    const hold = gate();
    vi.mocked(runReviewSpeechJob).mockImplementationOnce(async () => {
      started.release();
      await hold.promise;
      return { type: 'audio', staged };
    });
    const pending = generateProjectTextVoice(f.access, capture, approvedSelection, signal());
    await started.promise;
    f[operation]();
    hold.release();
    await expect(pending).rejects.toThrow('stale');
    expect(discardAudioStaging).toHaveBeenCalledExactlyOnceWith(
      staged,
      expect.objectContaining({ basisHash: capture.basisHash })
    );
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  }
);
it('rejects a canonical change during decoding and keeps a paid failure terminal', async () => {
  const f = fixture();
  const capture = await f.capture();
  vi.mocked(decodeReviewSpeechDuration).mockImplementationOnce(async () => {
    f.restore();
    return 12;
  });
  await expect(
    generateProjectTextVoice(f.access, capture, approvedSelection, signal())
  ).rejects.toThrow('stale');
  expect(discardAudioStaging).toHaveBeenCalledOnce();
  expect(capture.phase).toBe('failed');
  await expect(
    generateProjectTextVoice(f.access, capture, approvedSelection, signal())
  ).rejects.toThrow('invalid-request');
});
it('cleans output after cancellation even when the decoder ignores its signal', async () => {
  const f = fixture();
  const capture = await f.capture();
  const controller = new AbortController();
  vi.mocked(decodeReviewSpeechDuration).mockImplementationOnce(async () => {
    controller.abort();
    return 12;
  });
  await expect(
    generateProjectTextVoice(f.access, capture, approvedSelection, controller.signal)
  ).rejects.toThrow();
  expect(discardAudioStaging).toHaveBeenCalledOnce();
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});
it('cleans a malformed decoded response without replacing the failure with cleanup failure', async () => {
  const f = fixture();
  const capture = await f.capture();
  vi.mocked(decodeReviewSpeechDuration).mockRejectedValueOnce(new Error('decode'));
  vi.mocked(discardAudioStaging).mockRejectedValueOnce(new Error('cleanup'));
  await expect(
    generateProjectTextVoice(f.access, capture, approvedSelection, signal())
  ).rejects.toThrow('decode');
  expect(capture.phase).toBe('failed');
});
it('never automatically retries an ambiguous paid failure', async () => {
  const f = fixture();
  const capture = await f.capture();
  vi.mocked(runReviewSpeechJob).mockRejectedValueOnce(new Error('interrupted'));
  await expect(
    generateProjectTextVoice(f.access, capture, approvedSelection, signal())
  ).rejects.toThrow('interrupted');
  await expect(
    generateProjectTextVoice(f.access, capture, approvedSelection, signal())
  ).rejects.toThrow('invalid-request');
  expect(runReviewSpeechJob).toHaveBeenCalledOnce();
});
it('revokes audition URL even when stale target cleanup fails', async () => {
  const f = fixture();
  const preview = await generateProjectTextVoice(
    f.access,
    await f.capture(),
    approvedSelection,
    signal()
  );
  f.remove();
  vi.mocked(discardAudioStaging).mockRejectedValueOnce(new Error('storage'));
  await expect(cleanupProjectVoiceTakePreview(preview)).rejects.toThrow('storage');
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:voice');
});
it('blocks a restored canonical head during the last metadata admission await', async () => {
  const f = fixture();
  const capture = await f.capture();
  const started = gate();
  const hold = gate();
  const current = vi.mocked(isCurrentVideoProjectSnapshot).getMockImplementation()!;
  vi.mocked(isCurrentVideoProjectSnapshot).mockImplementationOnce(async (...args) => {
    started.release();
    await hold.promise;
    return current(...args);
  });
  const pending = generateProjectTextVoice(f.access, capture, approvedSelection, signal());
  await started.promise;
  f.restore();
  hold.release();
  await expect(pending).rejects.toThrow('stale');
  expect(runReviewSpeechJob).not.toHaveBeenCalled();
});
it('allows independent captures to use separate jobs and cleanup handles', async () => {
  const f = fixture();
  const first = await f.capture();
  const second = await f.capture();
  const firstSave = gate();
  const secondRequested = gate();
  f.save.mockImplementationOnce(() => firstSave.promise).mockResolvedValue(undefined);
  const other = { ...staged, id: 'other-ticket' };
  const firstSignal = signal();
  const secondSignal = signal();
  vi.mocked(runReviewSpeechJob).mockImplementation(async (_request, options) => {
    if (options?.signal === secondSignal) secondRequested.release();
    return { type: 'audio', staged: options?.signal === firstSignal ? staged : other };
  });
  const firstPending = generateProjectTextVoice(f.access, first, approvedSelection, firstSignal);
  const secondPending = generateProjectTextVoice(f.access, second, approvedSelection, secondSignal);
  await secondRequested.promise;
  firstSave.release();
  const previews = await Promise.all([firstPending, secondPending]);
  expect(runReviewSpeechJob).toHaveBeenCalledTimes(2);
  await cleanupProjectVoiceTakePreview(previews[0]!);
  expect(discardAudioStaging).toHaveBeenCalledExactlyOnceWith(staged, previews[0]!.source.scope);
  expect(previews[1]!.source.staged).toEqual(other);
  await cleanupProjectVoiceTakePreview(previews[1]!);
  expect(discardAudioStaging).toHaveBeenNthCalledWith(2, other, previews[1]!.source.scope);
});
it('refuses expired capture and missing provider without Save or request', async () => {
  const f = fixture();
  const capture = await f.capture();
  await expect(
    generateProjectTextVoice(
      f.access,
      capture,
      { ...approvedSelection, approvedProviderId: ' ' },
      signal()
    )
  ).rejects.toThrow('invalid-request');
  capture.expiresAt = 0;
  await expect(
    generateProjectTextVoice(f.access, capture, approvedSelection, signal())
  ).rejects.toThrow('stale');
  expect(f.save).not.toHaveBeenCalled();
  expect(runReviewSpeechJob).not.toHaveBeenCalled();
});
it('does not issue a job after cancellation during Save', async () => {
  const f = fixture();
  const capture = await f.capture();
  const controller = new AbortController();
  f.save.mockImplementationOnce(async () => {
    controller.abort();
  });
  await expect(
    generateProjectTextVoice(f.access, capture, approvedSelection, controller.signal)
  ).rejects.toThrow();
  expect(runReviewSpeechJob).not.toHaveBeenCalled();
  expect(capture.phase).toBe('captured');
});

it('retains the approved destination when the caller changes it during deferred Save', async () => {
  const f = fixture();
  const capture = await f.capture();
  const selection = { ...approvedSelection };
  const entered = gate();
  const hold = gate();
  const save = f.save.getMockImplementation()!;
  f.save.mockImplementationOnce(async () => {
    entered.release();
    await hold.promise;
    await save();
  });
  const pending = generateProjectTextVoice(f.access, capture, selection, signal());
  await entered.promise;
  selection.approvedDestination = `sha256:${'b'.repeat(64)}`;
  hold.release();
  await pending;
  expect(runReviewSpeechJob).toHaveBeenCalledWith(
    expect.objectContaining({ approvedSelection }),
    expect.anything()
  );
});
it('refuses a foreign approved model before Save or generation', async () => {
  const f = fixture();
  const capture = await f.capture();
  await expect(
    generateProjectTextVoice(
      f.access,
      capture,
      { ...approvedSelection, modelId: 'other' },
      signal()
    )
  ).rejects.toThrow('invalid-request');
  expect(f.save).not.toHaveBeenCalled();
  expect(runReviewSpeechJob).not.toHaveBeenCalled();
});
