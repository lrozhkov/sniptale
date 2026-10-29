import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  generateScenarioNarration,
  prepareScenarioNarrationBatch,
  cleanupScenarioNarrationPreview,
  type ScenarioNarrationBasis,
} from './generation';
import {
  createGuideProject,
  createTourDocument,
  createTourImageSlide,
  listScenarioNarrationTexts,
} from '../../features/scenario/project/public';
const mocks = vi.hoisted(() => ({
  job: vi.fn(),
  scope: vi.fn(),
  read: vi.fn(),
  discard: vi.fn(),
  decode: vi.fn(),
  close: vi.fn(),
}));
vi.mock('../audio-jobs/client', () => ({ runReviewSpeechJob: mocks.job }));
vi.mock('../../composition/persistence/scenario/speech-scope', () => ({
  assertScenarioSpeechScope: mocks.scope,
}));
vi.mock('../../composition/persistence/assets/audio-staging', () => ({
  readAudioStaging: mocks.read,
  discardAudioStaging: mocks.discard,
}));
const basis: ScenarioNarrationBasis = {
  scope: {
    workspaceId: 'p',
    workspaceRevision: 2,
    target: { kind: 'scenario-text', slideId: 's', objectId: 'o' },
    sourceTextHash: 'a'.repeat(64),
  },
  text: ' Exact text ',
  expectedNarration: null,
};
const staged = { id: '12345678-1234-4234-8234-123456789abc', mimeType: 'audio/wav', size: 4 };
const profile = { modelId: 'm', voiceId: 'alloy', responseFormat: 'wav' as const };
const approvedSelection = {
  modelId: 'm',
  approvedProviderId: 'provider',
  approvedModelCode: 'tts',
  approvedDestination: `sha256:${'a'.repeat(64)}`,
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.scope.mockResolvedValue(basis.text);
  mocks.job.mockResolvedValue({ type: 'audio', staged });
  mocks.read.mockResolvedValue(new Blob(['wave'], { type: 'audio/wav' }));
  mocks.discard.mockResolvedValue(undefined);
  mocks.decode.mockResolvedValue({ duration: 1.5 });
  mocks.close.mockResolvedValue(undefined);
  vi.stubGlobal(
    'AudioContext',
    class {
      decodeAudioData = mocks.decode;
      close = mocks.close;
    }
  );
  URL.createObjectURL = vi.fn().mockReturnValue('blob:preview');
  URL.revokeObjectURL = vi.fn();
});
it('materializes a source-bound Blob and disposes only the temporary preview', async () => {
  const preview = await generateScenarioNarration(
    basis,
    profile,
    approvedSelection,
    new AbortController().signal
  );
  expect(mocks.job).toHaveBeenCalledWith(
    expect.objectContaining({
      text: basis.text,
      scope: basis.scope,
      approvedProviderId: 'provider',
      profile: { voiceId: 'alloy', responseFormat: 'wav' },
    }),
    expect.anything()
  );
  expect(await preview.blob.text()).toBe('wave');
  expect(preview.duration).toBe(1.5);
  expect(preview.expectedNarration).toBeNull();
  await cleanupScenarioNarrationPreview(preview);
  expect(mocks.discard).toHaveBeenCalledWith(staged, basis.scope);
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview');
});
it('discards Scenario speech completed after cancellation', async () => {
  let finish!: (value: unknown) => void;
  mocks.job.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const controller = new AbortController();
  const pending = generateScenarioNarration(basis, profile, approvedSelection, controller.signal);
  await vi.waitFor(() => expect(mocks.job).toHaveBeenCalledTimes(1));
  controller.abort();
  finish({ type: 'audio', staged });
  await expect(pending).rejects.toThrow();
  expect(mocks.discard).toHaveBeenCalledWith(staged, basis.scope);
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});
it('rejects a changed saved source after decoding without admitting its preview', async () => {
  mocks.scope.mockResolvedValueOnce(basis.text).mockResolvedValueOnce('changed');
  await expect(
    generateScenarioNarration(basis, profile, approvedSelection, new AbortController().signal)
  ).rejects.toThrow('stale');
  expect(mocks.discard).toHaveBeenCalledWith(staged, basis.scope);
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});

afterEach(() => vi.unstubAllGlobals());
function savedSource() {
  const project = createGuideProject('Guide', 'p');
  const slide = createTourImageSlide('s');
  slide.actions = [
    {
      type: 'annotation',
      object: {
        id: 'o',
        text: basis.text,
        anchor: null,
        appearance: null,
        narration: {
          assetId: 'existing',
          duration: 2,
          trimStart: 0.25,
          trimEnd: 1.5,
          gain: 1,
          transcript: '',
          trigger: 'enter',
        },
      },
    },
  ];
  project.tour = { ...createTourDocument(), slides: [slide] };
  return { project, workspaceRevision: 2 };
}
it('captures exact committed UTF-8 text, destination narration and revision before paid work', async () => {
  const snapshot = savedSource();
  const targets = listScenarioNarrationTexts(snapshot.project);
  const prepared = await prepareScenarioNarrationBatch(
    snapshot,
    targets,
    new AbortController().signal
  );
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(basis.text));
  const hash = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('');
  expect(prepared).toEqual([
    {
      scope: { ...basis.scope, sourceTextHash: hash },
      text: basis.text,
      expectedNarration: targets[0]!.narration,
    },
  ]);
  expect(mocks.scope).toHaveBeenCalledWith(prepared[0]!.scope);
  expect(mocks.job).not.toHaveBeenCalled();
  targets[0]!.narration!.gain = 0.2;
  expect(prepared[0]!.expectedNarration?.gain).toBe(1);
});
it('refuses empty or duplicate selections before saved-source admission', async () => {
  const snapshot = savedSource();
  const targets = listScenarioNarrationTexts(snapshot.project);
  await expect(
    prepareScenarioNarrationBatch(snapshot, [], new AbortController().signal)
  ).rejects.toThrow('invalid-request');
  await expect(
    prepareScenarioNarrationBatch(snapshot, [...targets, ...targets], new AbortController().signal)
  ).rejects.toThrow('invalid-request');
  expect(mocks.scope).not.toHaveBeenCalled();
  expect(mocks.job).not.toHaveBeenCalled();
});
it('rejects missing targets, changed authored text and replaced destination narration before generation', async () => {
  const snapshot = savedSource();
  const target = listScenarioNarrationTexts(snapshot.project)[0]!;
  for (const changed of [
    { ...target, objectId: 'missing' },
    { ...target, text: target.text.trim() },
    { ...target, narration: null },
  ]) {
    await expect(
      prepareScenarioNarrationBatch(snapshot, [changed], new AbortController().signal)
    ).rejects.toThrow('stale');
  }
  expect(mocks.scope).not.toHaveBeenCalled();
  expect(mocks.job).not.toHaveBeenCalled();
});
it('refuses source replacement between snapshot capture and canonical admission', async () => {
  const snapshot = savedSource();
  mocks.scope.mockResolvedValueOnce('replaced');
  await expect(
    prepareScenarioNarrationBatch(
      snapshot,
      listScenarioNarrationTexts(snapshot.project),
      new AbortController().signal
    )
  ).rejects.toThrow('stale');
  expect(mocks.job).not.toHaveBeenCalled();
});
it('preserves the source and does no paid work when capture has already been cancelled', async () => {
  const snapshot = savedSource();
  const before = structuredClone(snapshot);
  const controller = new AbortController();
  controller.abort();
  await expect(
    prepareScenarioNarrationBatch(
      snapshot,
      listScenarioNarrationTexts(snapshot.project),
      controller.signal
    )
  ).rejects.toThrow();
  expect(snapshot).toEqual(before);
  expect(mocks.scope).not.toHaveBeenCalled();
  expect(mocks.job).not.toHaveBeenCalled();
});
it('requires provider approval and the unchanged saved text before a provider request', async () => {
  await expect(
    generateScenarioNarration(
      basis,
      profile,
      { ...approvedSelection, approvedProviderId: '' },
      new AbortController().signal
    )
  ).rejects.toThrow('invalid-request');
  mocks.scope.mockResolvedValueOnce('changed');
  await expect(
    generateScenarioNarration(basis, profile, approvedSelection, new AbortController().signal)
  ).rejects.toThrow('stale');
  expect(mocks.job).not.toHaveBeenCalled();
  expect(mocks.read).not.toHaveBeenCalled();
});
it('propagates a provider refusal and rejects transcript output without reading audio', async () => {
  mocks.job.mockRejectedValueOnce(new Error('provider-rate-limit'));
  await expect(
    generateScenarioNarration(basis, profile, approvedSelection, new AbortController().signal)
  ).rejects.toThrow('provider-rate-limit');
  mocks.job.mockResolvedValueOnce({ type: 'transcript', result: { text: 'wrong operation' } });
  await expect(
    generateScenarioNarration(basis, profile, approvedSelection, new AbortController().signal)
  ).rejects.toThrow('invalid-response');
  expect(mocks.read).not.toHaveBeenCalled();
  expect(mocks.discard).not.toHaveBeenCalled();
});
it('discards unreadable staged output and preserves its failure when disposal also fails', async () => {
  mocks.read.mockRejectedValueOnce(new Error('stale staging'));
  mocks.discard.mockRejectedValueOnce(new Error('cleanup unavailable'));
  await expect(
    generateScenarioNarration(basis, profile, approvedSelection, new AbortController().signal)
  ).rejects.toThrow('stale staging');
  expect(mocks.decode).not.toHaveBeenCalled();
  expect(mocks.discard).toHaveBeenCalledWith(staged, basis.scope);
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});
it('closes the decoder and discards the temporary result after a decode failure', async () => {
  mocks.decode.mockRejectedValueOnce(new Error('invalid audio'));
  await expect(
    generateScenarioNarration(basis, profile, approvedSelection, new AbortController().signal)
  ).rejects.toThrow('invalid audio');
  expect(mocks.close).toHaveBeenCalledOnce();
  expect(mocks.discard).toHaveBeenCalledWith(staged, basis.scope);
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});
it.each([0, 3600.01, Number.POSITIVE_INFINITY])(
  'refuses unsupported duration %s before creating a preview',
  async (duration) => {
    mocks.decode.mockResolvedValueOnce({ duration });
    await expect(
      generateScenarioNarration(basis, profile, approvedSelection, new AbortController().signal)
    ).rejects.toThrow('decode-failed');
    expect(mocks.close).toHaveBeenCalledOnce();
    expect(mocks.discard).toHaveBeenCalledWith(staged, basis.scope);
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  }
);
it('discards output cancelled during asynchronous decoding without allocating a URL', async () => {
  let finish!: (value: { duration: number }) => void;
  mocks.decode.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const controller = new AbortController();
  const pending = generateScenarioNarration(basis, profile, approvedSelection, controller.signal);
  await vi.waitFor(() => expect(mocks.decode).toHaveBeenCalledOnce());
  controller.abort();
  finish({ duration: 1 });
  await expect(pending).rejects.toThrow();
  expect(mocks.close).toHaveBeenCalledOnce();
  expect(mocks.discard).toHaveBeenCalledWith(staged, basis.scope);
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});
it('cleans temporary staging if preview URL creation fails', async () => {
  vi.mocked(URL.createObjectURL).mockImplementationOnce(() => {
    throw new Error('URL unavailable');
  });
  await expect(
    generateScenarioNarration(basis, profile, approvedSelection, new AbortController().signal)
  ).rejects.toThrow('URL unavailable');
  expect(mocks.discard).toHaveBeenCalledWith(staged, basis.scope);
  expect(URL.revokeObjectURL).not.toHaveBeenCalled();
});
it('revokes its URL before reporting a temporary staging cleanup failure', async () => {
  const preview = await generateScenarioNarration(
    basis,
    profile,
    approvedSelection,
    new AbortController().signal
  );
  mocks.discard.mockRejectedValueOnce(new Error('cleanup unavailable'));
  await expect(cleanupScenarioNarrationPreview(preview)).rejects.toThrow('cleanup unavailable');
  expect(URL.revokeObjectURL).toHaveBeenCalledWith(preview.url);
});

it('retains approved Scenario identity and speech parameters while canonical scope admission waits', async () => {
  let release!: (text: string) => void;
  const hold = new Promise<string>((resolve) => {
    release = resolve;
  });
  mocks.scope.mockImplementationOnce(() => hold);
  const selectedProfile = { ...profile };
  const approval = { ...approvedSelection };
  const pending = generateScenarioNarration(
    basis,
    selectedProfile,
    approval,
    new AbortController().signal
  );
  selectedProfile.voiceId = 'changed';
  approval.approvedDestination = `sha256:${'b'.repeat(64)}`;
  approval.approvedModelCode = 'replacement-code';
  release(basis.text);
  await pending;
  expect(mocks.job).toHaveBeenCalledWith(
    expect.objectContaining({
      approvedSelection,
      profile: { voiceId: 'alloy', responseFormat: 'wav' },
    }),
    expect.anything()
  );
});
it('refuses a foreign approved Scenario model before canonical scope admission', async () => {
  await expect(
    generateScenarioNarration(
      basis,
      profile,
      { ...approvedSelection, modelId: 'other' },
      new AbortController().signal
    )
  ).rejects.toThrow('invalid-request');
  expect(mocks.scope).not.toHaveBeenCalled();
  expect(mocks.job).not.toHaveBeenCalled();
});
