// @vitest-environment jsdom
import { act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  createEmptyVideoProject,
  createVideoProjectAsset,
} from '../../../features/video/project/factories/creation';
import { createVideoClipFromAsset } from '../../../features/video/project/factories/clip';
import type { AIModelSelectionBootstrapPayload } from '../../../contracts/messaging/ai-settings-runtime';
import { getVideoProject } from '../../../composition/persistence/projects';
import { readVideoProjectAudioSource } from '../../../composition/persistence/projects/audio-source';
import { runReviewSpeechJob } from '../../../workflows/video-review/speech-client';
import { requestAIModelSelectionBootstrap } from '../../../workflows/ai-settings/query';
import { waitForVideoEditorSave } from './save-readiness';
import { useVideoEditorStore } from '../../state/store';
import { useVideoProjectRecognition, type VideoProjectRecognitionController } from './recognition';

vi.mock('../../../composition/persistence/projects', () => ({ getVideoProject: vi.fn() }));
vi.mock('../../../composition/persistence/projects/audio-source', () => ({
  readVideoProjectAudioSource: vi.fn(),
}));
vi.mock('../../../workflows/video-review/speech-client', () => ({ runReviewSpeechJob: vi.fn() }));
vi.mock('../../../workflows/video-review/speech-audio', () => ({
  extractReviewSpeechWav: vi.fn(async () => new Blob(['wav'])),
  planReviewSpeechChunks: vi.fn(
    async (_source: Blob, ranges: { start: number; end: number }[]) => ranges
  ),
  reviewSpeechWavIsSilent: vi.fn(async () => false),
}));
vi.mock('../../../workflows/ai-settings/query', () => ({
  requestAIModelSelectionBootstrap: vi.fn(),
}));
vi.mock('./save-readiness', () => ({ waitForVideoEditorSave: vi.fn() }));

const catalog: AIModelSelectionBootstrapPayload = {
  chromeAiEnabled: false,
  defaultModelId: 'model',
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
  vi.mocked(requestAIModelSelectionBootstrap).mockResolvedValue(catalog);
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
      modelId: 'model',
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
  expect(current().catalog?.defaultModelId).toBe('model');
});
it('keeps the latest catalog response and retains it after a failed refresh', async () => {
  await act(async () => root.render(<Harness />));
  let release: ((value: AIModelSelectionBootstrapPayload) => void) | undefined;
  vi.mocked(requestAIModelSelectionBootstrap).mockImplementationOnce(
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
  vi.mocked(requestAIModelSelectionBootstrap).mockResolvedValueOnce(latest);
  await act(async () => current().loadModels());
  await act(async () => {
    release?.(catalog);
    await first;
  });
  expect(current().catalog).toEqual(latest);
  vi.mocked(requestAIModelSelectionBootstrap).mockRejectedValueOnce(new Error('unavailable'));
  await act(async () => current().loadModels());
  expect(current().catalog).toEqual(latest);
  expect(current().error).toBe('model');
});
