// @vitest-environment jsdom
import { act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  createEmptyVideoProject,
  createVideoProjectAsset,
} from '../../../features/video/project/factories/creation';
import { createVideoClipFromAsset } from '../../../features/video/project/factories/clip';
import { getVideoProject } from '../../../composition/persistence/projects';
import { readVideoProjectAudioSource } from '../../../composition/persistence/projects/audio-source';
import { runReviewSpeechJob } from '../../../workflows/audio-jobs/client';
import { planReviewSpeechChunks } from '../../../workflows/video-review/speech-audio';
import {
  requestAIScenarioModelSelection,
  rememberAIScenarioModelSelection,
} from '../../../workflows/ai-settings/query';
import { waitForVideoEditorSave } from './save-readiness';
import { useVideoEditorStore } from '../../state/store';
import { useVideoProjectRecognition, type VideoProjectRecognitionController } from './recognition';

vi.mock('../../../composition/persistence/projects', () => ({ getVideoProject: vi.fn() }));
vi.mock('../../../composition/persistence/projects/audio-source', () => ({
  readVideoProjectAudioSource: vi.fn(),
}));
vi.mock('../../../workflows/audio-jobs/client', () => ({ runReviewSpeechJob: vi.fn() }));
vi.mock('../../../workflows/video-review/speech-audio', () => ({
  extractReviewSpeechWav: vi.fn(async () => new Blob(['wav'])),
  planReviewSpeechChunks: vi.fn(
    async (_source: Blob, ranges: { start: number; end: number }[]) => ranges
  ),
  reviewSpeechWavIsSilent: vi.fn(async () => false),
}));
vi.mock('../../../workflows/ai-settings/query', () => ({
  requestAIScenarioModelSelection: vi.fn(),
  rememberAIScenarioModelSelection: vi.fn(),
}));
vi.mock('./save-readiness', () => ({ waitForVideoEditorSave: vi.fn() }));

type Catalog = Awaited<ReturnType<typeof requestAIScenarioModelSelection>>;
const catalog: Catalog = {
  scenario: 'video-transcription',
  remembered: null,
  resolution: { status: 'initial', modelId: 'model', previousSelection: null, reason: null },
  globalSystemPrompt: '',
  models: [
    {
      id: 'model',
      providerId: 'provider',
      modelCode: 'stt',
      displayName: 'STT',
      operation: 'transcription',
      audio: { transcription: { responseFormat: 'verbose_json', timestampGranularity: 'word' } },
    },
  ],
  providers: [
    {
      id: 'provider',
      name: 'Provider',
      connectionType: 'openai-compatible',
      incarnation: 'initial',
      destinationBinding: `sha256:${'a'.repeat(64)}`,
      hasStoredApiKey: true,
      createdAt: 1,
      destinationKind: 'external',
    },
  ],
};
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let initial: ReturnType<typeof useVideoEditorStore.getState>;
let controller: VideoProjectRecognitionController | null;
let durable: NonNullable<ReturnType<typeof useVideoEditorStore.getState>['project']>;
let revision: number;
function current() {
  if (!controller) throw new Error('Missing controller');
  return controller;
}
function InitialCatalog({ load }: { load: () => Promise<void> }) {
  useEffect(() => {
    void load();
  }, [load]);
  return null;
}
function Harness({ visible = true, autoLoad = false }: { visible?: boolean; autoLoad?: boolean }) {
  const project = useVideoEditorStore((state) => state.project);
  if (!project) throw new Error('Missing project');
  const value = useVideoProjectRecognition(project);
  controller = value;
  return (
    <>
      {autoLoad && <InitialCatalog load={value.loadModels} />}
      {visible ? <output>{value.proposal?.entry.document.fragments[0]?.text}</output> : null}
    </>
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  initial = useVideoEditorStore.getState();
  const project = createEmptyVideoProject('Recognition');
  const asset = createVideoProjectAsset(
    'Video',
    'VIDEO',
    { kind: 'project-asset', projectAssetId: 'bytes' },
    {
      width: 640,
      height: 360,
      duration: 8,
      mimeType: 'video/webm',
      size: 1,
      hasAudio: true,
      audioPeaks: null,
    }
  );
  project.assets = [asset];
  project.clips = [createVideoClipFromAsset(project.tracks[0]!.id, asset, 640, 360, 0)];
  useVideoEditorStore.getState().setProject(project);
  durable = structuredClone(useVideoEditorStore.getState().project!);
  revision = 1;
  vi.mocked(getVideoProject).mockImplementation(async () => ({
    status: 'ready',
    project: structuredClone(durable),
    workspaceRevision: revision,
  }));
  vi.mocked(waitForVideoEditorSave).mockImplementation(async () => {
    const project = useVideoEditorStore.getState().project!;
    if (JSON.stringify(durable) !== JSON.stringify(project)) revision++;
    durable = structuredClone(project);
  });
  vi.mocked(requestAIScenarioModelSelection).mockResolvedValue(catalog);
  vi.mocked(rememberAIScenarioModelSelection).mockResolvedValue(undefined);
  vi.mocked(readVideoProjectAudioSource).mockResolvedValue(new Blob(['audio']));
  vi.mocked(runReviewSpeechJob).mockResolvedValue({
    type: 'transcript',
    result: { text: 'Recognized.' },
  });
  controller = null;
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  useVideoEditorStore.setState(initial, true);
  vi.unstubAllGlobals();
});
async function mount() {
  await act(async () => root.render(<Harness />));
  await act(async () => current().loadModels());
}
async function recognize() {
  const project = useVideoEditorStore.getState().project!;
  await act(async () =>
    current().recognize({
      clipId: project.clips[0]!.id,
      modelId: current().modelId,
      approvedProviderId: 'provider',
      start: 0,
      end: 8,
      grouping: 'sentences-pauses',
    })
  );
}
it('retains the proposal across section and collapse renders and applies one Undo action', async () => {
  await mount();
  await recognize();
  expect(host.textContent).toBe('Recognized.');
  expect(useVideoEditorStore.getState().project!.textDocuments).toBeUndefined();
  await act(async () => root.render(<Harness visible={false} />));
  await act(async () => root.render(<Harness />));
  expect(host.textContent).toBe('Recognized.');
  await act(async () => current().apply('add'));
  expect(current().accepted).toBe(true);
  expect(useVideoEditorStore.getState().projectHistory.past).toHaveLength(1);
  expect(durable.textDocuments?.[0]?.document.fragments[0]?.text).toBe('Recognized.');
  act(() => useVideoEditorStore.getState().undoProject());
  expect(useVideoEditorStore.getState().project!.textDocuments).toBeUndefined();
  act(() => useVideoEditorStore.getState().redoProject());
  expect(useVideoEditorStore.getState().project!.textDocuments).toHaveLength(1);
});
it('keeps the accepted local edit after save failure and retries without another request or history step', async () => {
  await mount();
  await recognize();
  const fragment = current().proposal!.entry.document.fragments[0]!;
  act(() => current().edit(fragment.id, 'Corrected before Apply.'));
  vi.mocked(waitForVideoEditorSave).mockRejectedValueOnce(new Error('storage-failed'));
  await act(async () => current().apply('add'));
  expect(current().error).toBe('storage-failed');
  expect(current().proposal?.receipt).toBeDefined();
  expect(current().accepted).toBe(false);
  await act(async () => current().apply('add'));
  expect(current().accepted).toBe(true);
  expect(runReviewSpeechJob).toHaveBeenCalledOnce();
  expect(useVideoEditorStore.getState().projectHistory.past).toHaveLength(1);
  expect(durable.textDocuments).toHaveLength(1);
});
it('cancels an old project attempt and refuses a late result after project switch', async () => {
  await mount();
  let complete: (() => void) | undefined;
  vi.mocked(runReviewSpeechJob).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        complete = () => resolve({ type: 'transcript', result: { text: 'Late.' } });
      })
  );
  await recognize();
  expect(current().running).toBe(true);
  await act(async () =>
    useVideoEditorStore.getState().setProject(createEmptyVideoProject('Other'))
  );
  await act(async () => complete?.());
  expect(current().proposal).toBeNull();
  expect(current().accepted).toBe(false);
  expect(useVideoEditorStore.getState().project!.textDocuments).toBeUndefined();
});
it('cancels on demand and never publishes text from an interrupted request', async () => {
  await mount();
  vi.mocked(runReviewSpeechJob).mockImplementationOnce(
    (_start, options) =>
      new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(new Error('cancelled')), {
          once: true,
        });
      })
  );
  await recognize();
  await act(async () => current().cancel());
  expect(current().running).toBe(false);
  expect(current().proposal).toBeNull();
  expect(current().error).toBeNull();
});
it('does not join another editing gesture and preserves its completed proposal', async () => {
  await mount();
  await recognize();
  const lease = useVideoEditorStore.getState().beginProjectHistoryTransaction();
  await act(async () => current().apply('add'));
  expect(current().error).toBe('stale');
  expect(current().proposal?.entry.document.fragments[0]?.text).toBe('Recognized.');
  expect(useVideoEditorStore.getState().project!.textDocuments).toBeUndefined();
  if (lease) act(() => useVideoEditorStore.getState().endProjectHistoryTransaction(lease));
});
it('can close an unacknowledged result without deleting the accepted local text or blocking Undo', async () => {
  await mount();
  await recognize();
  vi.mocked(waitForVideoEditorSave).mockRejectedValueOnce(new Error('storage-failed'));
  await act(async () => current().apply('add'));
  act(() => current().discard());
  expect(current().proposal).toBeNull();
  expect(useVideoEditorStore.getState().project!.textDocuments).toHaveLength(1);
  act(() => useVideoEditorStore.getState().undoProject());
  expect(useVideoEditorStore.getState().project!.textDocuments).toBeUndefined();
});
it('admits the first catalog response when the remembered recognition section mounts with its owner', async () => {
  await act(async () => root.render(<Harness autoLoad />));
  expect(current().modelId).toBe('model');
});
it('keeps the latest catalog response and retains it after a failed refresh', async () => {
  await act(async () => root.render(<Harness />));
  let release: ((value: Catalog) => void) | undefined;
  vi.mocked(requestAIScenarioModelSelection).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      })
  );
  let first: Promise<void> | undefined;
  act(() => {
    first = current().loadModels();
  });
  const latest = { ...catalog, globalSystemPrompt: 'latest' };
  vi.mocked(requestAIScenarioModelSelection).mockResolvedValueOnce(latest);
  await act(async () => current().loadModels());
  await act(async () => {
    release?.(catalog);
    await first;
  });
  expect(current().catalog).toEqual(latest);
  vi.mocked(requestAIScenarioModelSelection).mockRejectedValueOnce(new Error('unavailable'));
  await act(async () => current().loadModels());
  expect(current().catalog).toEqual(latest);
  expect(current().configurationFailed).toBe(true);
});

it('pins the approved destination before a deferred recognition Save', async () => {
  await mount();
  const save = Promise.withResolvers<void>();
  vi.mocked(waitForVideoEditorSave).mockImplementationOnce(() => save.promise);
  await recognize();
  const changed = {
    ...catalog,
    providers: catalog.providers.map((provider) => ({
      ...provider,
      destinationBinding: `sha256:${'b'.repeat(64)}`,
    })),
  };
  vi.mocked(requestAIScenarioModelSelection).mockResolvedValue(changed);
  await act(async () => save.resolve());
  expect(runReviewSpeechJob).toHaveBeenCalledWith(
    expect.objectContaining({
      approvedSelection: {
        modelId: 'model',
        approvedProviderId: 'provider',
        approvedModelCode: 'stt',
        approvedDestination: `sha256:${'a'.repeat(64)}`,
      },
    }),
    expect.anything()
  );
});

function expectNoRecognitionWork() {
  expect(waitForVideoEditorSave).not.toHaveBeenCalled();
  expect(readVideoProjectAudioSource).not.toHaveBeenCalled();
  expect(runReviewSpeechJob).not.toHaveBeenCalled();
  expect(useVideoEditorStore.getState().project!.textDocuments).toBeUndefined();
}
it('opens and refreshes only the video transcription context without preference or project writes', async () => {
  await mount();
  await act(async () => current().loadModels());
  expect(requestAIScenarioModelSelection).toHaveBeenCalledWith('video-transcription');
  expect(rememberAIScenarioModelSelection).not.toHaveBeenCalled();
  expect(current().modelId).toBe('model');
  expectNoRecognitionWork();
});
it('remembers explicit model choice without source Save or provider work', async () => {
  await mount();
  await act(async () => current().setModelId('model'));
  expect(rememberAIScenarioModelSelection).toHaveBeenCalledWith(
    catalog,
    'video-transcription',
    'model',
    'explicit'
  );
  expectNoRecognitionWork();
});
it('blocks source Save on preference refusal and permits an explicit retry', async () => {
  await mount();
  vi.mocked(rememberAIScenarioModelSelection).mockRejectedValueOnce(new Error('refused'));
  await recognize();
  expect(current().selectionFailed).toBe(true);
  expectNoRecognitionWork();
  await recognize();
  expect(current().selectionFailed).toBe(false);
  expect(waitForVideoEditorSave).toHaveBeenCalledOnce();
  expect(runReviewSpeechJob).toHaveBeenCalledOnce();
});
it('blocks source Save after a failed catalog admission', async () => {
  await mount();
  vi.mocked(requestAIScenarioModelSelection).mockRejectedValueOnce(new Error('offline'));
  await recognize();
  expect(current().configurationFailed).toBe(true);
  expect(rememberAIScenarioModelSelection).not.toHaveBeenCalled();
  expectNoRecognitionWork();
});
it.each(['destination', 'model', 'incarnation'] as const)(
  'requires explicit replacement after a changed %s before Save',
  async (change) => {
    await mount();
    const next = structuredClone(catalog);
    if (change === 'model') next.models[0]!.modelCode = 'changed';
    else if (change === 'incarnation') next.providers[0]!.incarnation = 'recreated';
    else next.providers[0]!.destinationBinding = `sha256:${'b'.repeat(64)}`;
    vi.mocked(requestAIScenarioModelSelection).mockResolvedValue(next);
    await recognize();
    expect(current().selectionUnavailable).toBe(true);
    expect(current().modelId).toBe('');
    expectNoRecognitionWork();
    await act(async () => current().setModelId('model'));
    await recognize();
    expect(current().proposal).not.toBeNull();
  }
);
it('keeps a removed choice unresolved until explicit replacement', async () => {
  await mount();
  const next = structuredClone(catalog);
  next.models[0]!.id = 'replacement';
  next.resolution.modelId = 'replacement';
  vi.mocked(requestAIScenarioModelSelection).mockResolvedValue(next);
  await act(async () => current().loadModels());
  expect(current().selectionUnavailable).toBe(true);
  expect(current().modelId).toBe('');
  expect(rememberAIScenarioModelSelection).not.toHaveBeenCalled();
  await act(async () => current().setModelId('replacement'));
  expect(current().modelId).toBe('replacement');
  expectNoRecognitionWork();
});
it.each([
  ['catalog', 'cancel'],
  ['catalog', 'project'],
  ['catalog', 'close'],
  ['preference', 'cancel'],
  ['preference', 'project'],
  ['preference', 'close'],
] as const)('prevents late Save when %s admission settles after %s', async (phase, action) => {
  await mount();
  const admission = Promise.withResolvers<Catalog>();
  const preference = Promise.withResolvers<void>();
  if (phase === 'catalog')
    vi.mocked(requestAIScenarioModelSelection).mockImplementationOnce(() => admission.promise);
  else vi.mocked(rememberAIScenarioModelSelection).mockImplementationOnce(() => preference.promise);
  await recognize();
  expect(current().running).toBe(true);
  if (action === 'cancel') await act(async () => current().cancel());
  else if (action === 'project')
    await act(async () =>
      useVideoEditorStore.getState().setProject(createEmptyVideoProject('Other'))
    );
  else await act(async () => root.unmount());
  await act(async () => {
    if (phase === 'catalog') admission.resolve(catalog);
    else preference.resolve();
  });
  expectNoRecognitionWork();
});
it('admits native capability-only transcription without stored audio parameters', async () => {
  const next = structuredClone(catalog);
  next.providers[0]!.connectionType = 'deepgram';
  delete next.models[0]!.audio;
  delete next.models[0]!.operation;
  next.models[0]!.capabilities = {
    operations: { transcription: 'supported' },
    input: { audio: 'supported' },
    output: { text: 'supported' },
    features: {},
  };
  vi.mocked(requestAIScenarioModelSelection).mockResolvedValue(next);
  await mount();
  await recognize();
  expect(runReviewSpeechJob).toHaveBeenCalledOnce();
  expect(current().proposal).not.toBeNull();
});
it('preserves a completed proposal and Apply after later admission refusal', async () => {
  await mount();
  await recognize();
  const proposal = current().proposal;
  vi.mocked(requestAIScenarioModelSelection).mockRejectedValueOnce(new Error('offline'));
  await recognize();
  expect(current().proposal).toBe(proposal);
  expect(runReviewSpeechJob).toHaveBeenCalledOnce();
  await act(async () => current().apply('add'));
  expect(current().accepted).toBe(true);
  expect(durable.textDocuments).toHaveLength(1);
});
it.each(['model', 'parameters'] as const)(
  'does not reuse completed chunks after same-ID %s replacement',
  async (change) => {
    await mount();
    vi.mocked(planReviewSpeechChunks).mockResolvedValueOnce([
      { start: 0, end: 4 },
      { start: 4, end: 8 },
    ]);
    vi.mocked(runReviewSpeechJob)
      .mockResolvedValueOnce({ type: 'transcript', result: { text: 'Old.' } })
      .mockRejectedValueOnce(new Error('network-failed'));
    await recognize();
    expect(current().error).toBe('network-failed');
    const next = structuredClone(catalog);
    if (change === 'model') next.models[0]!.modelCode = 'new';
    else next.models[0]!.audio!.transcription!.language = 'ru';
    vi.mocked(requestAIScenarioModelSelection).mockResolvedValue(next);
    await act(async () => current().loadModels());
    await act(async () => current().setModelId('model'));
    await recognize();
    expect(current().proposal?.entry.document.fragments[0]?.text).toBe('Recognized.');
    expect(runReviewSpeechJob).toHaveBeenCalledTimes(3);
  }
);
