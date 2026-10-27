// @vitest-environment jsdom
import { inspectReviewAudio } from '../../../workflows/video-review/audio-import';
import { ProjectTextVoicePanel } from '../../workspace/sidebar/selection/inspection/text-voice';
import { InspectorLayout } from '../../../ui/compact-inspector-controls/layout';
import { translate } from '../../../platform/i18n';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import {
  getVideoProject,
  prepareProjectAsset,
  deleteProjectAsset,
} from '../../../composition/persistence/projects';
import { isCurrentVideoProjectSnapshot } from '../../../composition/persistence/projects/revision';
import {
  readAudioStaging,
  discardAudioStaging,
} from '../../../composition/persistence/assets/audio-staging';
import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import {
  requestAIScenarioModelSelection,
  rememberAIScenarioModelSelection,
} from '../../../workflows/ai-settings/query';
import { runReviewSpeechJob } from '../../../workflows/audio-jobs/client';
import { decodeReviewSpeechDuration } from '../../../workflows/video-review/speech-audio';
import { useVideoEditorStore } from '../../state/store';
import { waitForVideoEditorSave } from './save-readiness';
import { useVideoProjectTextVoice, type VideoProjectTextVoiceController } from './text-voice';

vi.mock('../../../workflows/video-review/audio-import', async (original) => ({
  ...(await original<typeof import('../../../workflows/video-review/audio-import')>()),
  inspectReviewAudio: vi.fn(),
}));
vi.mock('../../../composition/persistence/media-library', () => ({
  listMediaLibrary: vi.fn(async () => []),
}));
vi.mock('../../../composition/persistence/gallery-saved-views', () => ({
  listGallerySavedViews: vi.fn(async () => []),
}));
vi.mock('../../../composition/persistence/projects', () => ({
  getVideoProject: vi.fn(),
  prepareProjectAsset: vi.fn(),
  deleteProjectAsset: vi.fn(),
}));
vi.mock('../../../composition/persistence/projects/revision', () => ({
  isCurrentVideoProjectSnapshot: vi.fn(),
}));
vi.mock('../../../composition/persistence/assets/audio-staging', () => ({
  readAudioStaging: vi.fn(),
  discardAudioStaging: vi.fn(),
}));
vi.mock('../../../workflows/ai-settings/query', () => ({
  requestAIScenarioModelSelection: vi.fn(),
  rememberAIScenarioModelSelection: vi.fn(),
}));
vi.mock('../../../workflows/audio-jobs/client', () => ({ runReviewSpeechJob: vi.fn() }));
vi.mock('../../../workflows/video-review/speech-audio', () => ({
  decodeReviewSpeechDuration: vi.fn(),
}));
vi.mock('../../../composition/audio-recording/trim-file', () => ({
  createTrimmedRecordingFile: vi.fn(
    async () => new File(['recorded'], 'take.wav', { type: 'audio/wav' })
  ),
}));
vi.mock('../../../composition/audio-recording/dialog/waveform', () => ({
  useRecordedAudioPeaks: () => [0.1],
}));
vi.mock('./save-readiness', async (original) => ({
  ...(await original<typeof import('./save-readiness')>()),
  waitForVideoEditorSave: vi.fn(),
}));

function gate<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}
let root: ReturnType<typeof createRoot>;
let host: HTMLDivElement;
let original: ReturnType<typeof useVideoEditorStore.getState>;
let operation: VideoProjectTextVoiceController;
let durable: NonNullable<ReturnType<typeof useVideoEditorStore.getState>['project']>;
let revision: number;
function Harness({ visible = true }: { visible?: boolean }) {
  const project = useVideoEditorStore((state) => state.project)!;
  operation = useVideoProjectTextVoice(project);
  return visible && operation.target ? (
    <InspectorLayout>
      <ProjectTextVoicePanel
        project={project}
        operation={operation}
        onClose={() => {
          void operation.close();
        }}
      />
    </InspectorLayout>
  ) : null;
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(inspectReviewAudio).mockResolvedValue(12);
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value: vi.fn(),
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value: vi.fn(),
  });
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:voice');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (
    this: HTMLMediaElement
  ) {
    this.dispatchEvent(new Event('pause'));
  });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (
    this: HTMLMediaElement
  ) {
    this.dispatchEvent(new Event('play'));
    return Promise.resolve();
  });
  original = useVideoEditorStore.getState();
  const project = createEmptyVideoProject('Voice');
  project.version = 5;
  project.duration = 3;
  project.textDocuments = [
    {
      id: 'script',
      binding: { kind: 'project' },
      document: {
        version: 1,
        fragments: [
          {
            id: 'phrase',
            text: 'Speak this',
            originalText: '',
            start: 1,
            end: 2,
            revision: 1,
            timingRevision: 2,
            timeDomain: 'result',
            alignment: 'manual',
            showInVideo: true,
          },
        ],
      },
    },
  ];
  useVideoEditorStore.getState().setProject(project);
  durable = structuredClone(useVideoEditorStore.getState().project!);
  revision = 1;
  vi.mocked(getVideoProject).mockImplementation(async () => ({
    status: 'ready',
    project: structuredClone(durable),
    workspaceRevision: revision,
  }));
  vi.mocked(isCurrentVideoProjectSnapshot).mockImplementation(
    async (snapshot, rev) =>
      rev === revision && JSON.stringify(snapshot) === JSON.stringify(durable)
  );
  vi.mocked(waitForVideoEditorSave).mockImplementation(async () => {
    durable = structuredClone(useVideoEditorStore.getState().project!);
    revision++;
  });
  vi.mocked(requestAIScenarioModelSelection).mockResolvedValue({
    scenario: 'video-speech',
    remembered: null,
    resolution: { status: 'initial', modelId: 'model', previousSelection: null, reason: null },
    globalSystemPrompt: '',
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
    models: [
      {
        id: 'model',
        modelCode: 'speech',
        displayName: 'Speech',
        providerId: 'provider',
        operation: 'speech',
        audio: { speech: { voiceId: 'voice', responseFormat: 'mp3' } },
      },
    ],
  });
  vi.mocked(rememberAIScenarioModelSelection).mockResolvedValue(undefined);
  vi.mocked(runReviewSpeechJob).mockResolvedValue({
    type: 'audio',
    staged: { id: 'staged', size: 4, mimeType: 'audio/mpeg' },
  });
  vi.mocked(readAudioStaging).mockResolvedValue(
    new File(['data'], 'voice.mp3', { type: 'audio/mpeg' })
  );
  vi.mocked(decodeReviewSpeechDuration).mockResolvedValue(12);
  vi.mocked(discardAudioStaging).mockResolvedValue(undefined);
  vi.mocked(deleteProjectAsset).mockResolvedValue(undefined);
  vi.mocked(prepareProjectAsset).mockImplementation(async (_blob, _mime, _name, id) => ({
    id: id!,
    ref: {
      assetId: 'physical',
      createdAt: 1,
      location: { kind: 'opfs', objectKey: 'voice' },
      mimeType: 'audio/mpeg',
      size: 4,
      sha256: null,
    },
    protect: vi.fn(async () => undefined),
    publish: vi.fn(async () => undefined),
    cancel: vi.fn(async () => undefined),
    discard: vi.fn(async () => undefined),
    retainForSession: vi.fn(),
  }));
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  useVideoEditorStore.setState(original, true);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function mount() {
  await act(async () => root.render(<Harness />));
  await act(async () => operation.open('script', 'phrase'));
}
async function generate() {
  await act(async () => operation.prepare());
  expect(operation.consent?.capture.basis.fragment.text).toBe('Speak this');
  expect(runReviewSpeechJob).not.toHaveBeenCalled();
  await act(async () => operation.start());
}
it('retains a hidden preview and accepts its full take with one Undo and Redo', async () => {
  await mount();
  await generate();
  const preview = operation.preview;
  expect(preview).not.toBeNull();
  const originalAudioMute = {
    volume: 0.25,
    targets: [{ assetId: 'missing-source', sourceInstanceId: 'original-instance' }],
  };
  await act(async () => operation.changePlacement({ start: 0, originalAudioMute }));
  originalAudioMute.targets[0]!.sourceInstanceId = 'mutated-input';
  expect(operation.placement.originalAudioMute?.targets[0]?.sourceInstanceId).toBe(
    'original-instance'
  );
  expect(operation.canApply).toBe(false);
  await act(async () => operation.apply());
  expect(prepareProjectAsset).not.toHaveBeenCalled();
  await act(async () => root.render(<Harness visible={false} />));
  expect(operation.preview).toBe(preview);
  await act(async () => root.render(<Harness />));
  expect(operation.placement.originalAudioMute?.targets[0]?.sourceInstanceId).toBe(
    'original-instance'
  );
  await act(async () => operation.changePlacement({ start: 0 }));
  expect(operation.canApply).toBe(true);
  const position = host.querySelector<HTMLInputElement>(
    `input[aria-label="${translate('videoEditor.sidebar.textVoicePosition')}"]`
  )!;
  await act(async () => {
    position.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(position, '6');
    position.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () =>
    position.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    )
  );
  await act(async () => operation.apply());
  expect(operation.accepted).toBe(true);
  expect(durable.clips).toHaveLength(1);
  expect(durable.clips[0]).toMatchObject({ startTime: 6, duration: 12 });
  expect(useVideoEditorStore.getState().projectHistory.past).toHaveLength(1);
  act(() => useVideoEditorStore.getState().undoProject());
  expect(useVideoEditorStore.getState().project!.clips).toHaveLength(0);
  act(() => useVideoEditorStore.getState().redoProject());
  expect(useVideoEditorStore.getState().project!.clips).toHaveLength(1);
  await click('gallery.videoReview.textVoiceBack');
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:voice');
  expect(deleteProjectAsset).not.toHaveBeenCalled();
});
it('preserves the take and surfaces a conflicting Save without a second generation', async () => {
  await mount();
  await generate();
  const preview = operation.preview;
  const realSave = vi.mocked(waitForVideoEditorSave).getMockImplementation()!;
  vi.mocked(waitForVideoEditorSave).mockImplementation(async (...args) => {
    if (useVideoEditorStore.getState().project!.clips.length) throw new Error('write-conflict');
    await realSave(...args);
  });
  await act(async () => operation.apply());
  expect(operation.error).toBe('storage-failed');
  expect(operation.preview).toBe(preview);
  expect(preview?.attachment?.receipt).toBeDefined();
  act(() => operation.changePlacement({ start: 8 }));
  expect(operation.placement.start).toBe(0);
  vi.mocked(waitForVideoEditorSave).mockImplementation(realSave);
  await act(async () => operation.apply());
  expect(operation.accepted).toBe(true);
  expect(durable.clips).toHaveLength(1);
  expect(runReviewSpeechJob).toHaveBeenCalledOnce();
  expect(prepareProjectAsset).toHaveBeenCalledOnce();
  expect(useVideoEditorStore.getState().projectHistory.past).toHaveLength(1);
});
it('disposes a late generation after unmount without inserting', async () => {
  await mount();
  await act(async () => operation.prepare());
  const entered = gate<void>();
  const response = gate<Awaited<ReturnType<typeof runReviewSpeechJob>>>();
  vi.mocked(runReviewSpeechJob).mockImplementationOnce(async () => {
    entered.resolve();
    return response.promise;
  });
  let pending!: Promise<void>;
  await act(async () => {
    pending = operation.start();
    await entered.promise;
  });
  await act(async () => root.render(null));
  await act(async () => {
    response.resolve({ type: 'audio', staged: { id: 'late', mimeType: 'audio/mpeg', size: 4 } });
    await pending;
  });
  expect(discardAudioStaging).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'late' }),
    expect.anything()
  );
  expect(prepareProjectAsset).not.toHaveBeenCalled();
  expect(useVideoEditorStore.getState().project!.clips).toHaveLength(0);
});
it('rejects an old session after the same project identity is recreated', async () => {
  await mount();
  await act(async () => operation.prepare());
  const old = operation;
  const project = useVideoEditorStore.getState().project!;
  act(() =>
    useVideoEditorStore.getState().setProject({ ...project, createdAt: project.createdAt + 1 })
  );
  await act(async () => old.start());
  expect(runReviewSpeechJob).not.toHaveBeenCalled();
  expect(operation.target).toBeNull();
  expect(operation.preview).toBeNull();
});
it('refuses an occupied history lease and keeps the preview for retry', async () => {
  await mount();
  await generate();
  const lease = useVideoEditorStore.getState().beginProjectHistoryTransaction();
  await act(async () => operation.apply());
  expect(operation.error).toBe('busy');
  expect(operation.preview).not.toBeNull();
  expect(useVideoEditorStore.getState().project!.clips).toHaveLength(0);
  if (lease) act(() => useVideoEditorStore.getState().endProjectHistoryTransaction(lease));
  await act(async () => operation.apply());
  expect(operation.accepted).toBe(true);
});

async function click(key: Parameters<typeof translate>[0]) {
  const button = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
    (node) =>
      node.getAttribute('aria-label') === translate(key) ||
      node.textContent?.trim() === translate(key)
  );
  if (!button) throw new Error(`Missing command ${key}`);
  await act(async () => button.click());
}
it('previews and stops speech, selects an existing lane and cancels consent without a paid job', async () => {
  await mount();
  await act(async () => operation.prepare());
  await click('common.actions.cancel');
  expect(operation.consent).toBeNull();
  expect(runReviewSpeechJob).not.toHaveBeenCalled();
  act(() =>
    useVideoEditorStore.getState().updateProject((project) => ({
      ...project,
      tracks: [
        {
          id: 'audio',
          name: 'Voice lane',
          order: 0,
          kind: 'AUDIO',
          locked: false,
          visible: true,
          logicalLanes: [{ id: 'line-1' }, { id: 'alternate' }],
        },
      ],
    }))
  );
  await generate();
  await click('gallery.videoReview.speechPreview');
  expect(HTMLMediaElement.prototype.play).toHaveBeenCalledOnce();
  await click('videoEditor.sidebar.textVoiceStop');
  expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
  const audio = host.querySelector('audio')!;
  await act(async () => audio.dispatchEvent(new Event('error')));
  expect(host.textContent).toContain(translate('videoEditor.sidebar.textVoiceAuditionFailed'));
  await act(async () => {
    const choice = host.querySelector<HTMLElement>(
      `[role="group"][aria-label="${translate('videoEditor.sidebar.textVoiceTrack')}"]`
    )!;
    [...choice.querySelectorAll<HTMLButtonElement>('button')]
      .find((entry) => entry.textContent === 'Voice lane')!
      .click();
  });
  expect(operation.placement.trackId).toBe('audio');
  await act(async () => {
    const choice = host.querySelector<HTMLElement>(
      `[role="group"][aria-label="${translate('videoEditor.sidebar.textVoiceLane')}"]`
    )!;
    [...choice.querySelectorAll<HTMLButtonElement>('button')]
      .find((entry) => entry.textContent === '2')!
      .click();
  });
  expect(operation.placement.timelineLaneId).toBe('alternate');
  await act(async () => operation.apply());
  expect(durable.clips[0]).toMatchObject({
    trackId: 'audio',
    timelineLaneId: 'alternate',
    duration: 12,
  });
});
it('shows a model reload after catalog failure and keeps the form available', async () => {
  vi.mocked(requestAIScenarioModelSelection).mockRejectedValueOnce(new Error('offline'));
  await act(async () => root.render(<Harness />));
  await act(async () => operation.open('script', 'phrase'));
  expect(host.querySelector('[role="alert"]')?.textContent).toBe(
    translate('aiModal.modelCatalogFailed')
  );
  await click('gallery.videoReview.speechReloadModels');
  expect(operation.catalog?.models).toHaveLength(1);
  await click('gallery.videoReview.textVoiceBack');
  expect(operation.target).toBeNull();
  expect(runReviewSpeechJob).not.toHaveBeenCalled();
});

it('prepares local audio without AI and retries only Save after insertion', async () => {
  await mount();
  await click('gallery.videoReview.textVoiceGallery');
  expect(operation.source).toBe('gallery');
  expect(host.querySelector('.sniptale-ai-model-selector-trigger')).toBeNull();
  vi.mocked(waitForVideoEditorSave).mockClear();
  await click('gallery.videoReview.textVoiceChooseAudio');
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
  const file = new File(['data'], 'Local original.wav', { type: 'audio/wav' });
  Object.defineProperty(input, 'files', { configurable: true, value: [file] });
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
  expect(document.querySelector('dialog')).toBeNull();
  expect(host.textContent).toContain(file.name);
  expect(operation.preview?.textSnapshot.text.kind).toBe('gallery');
  expect(prepareProjectAsset).not.toHaveBeenCalled();
  expect(waitForVideoEditorSave).not.toHaveBeenCalled();
  expect(runReviewSpeechJob).not.toHaveBeenCalled();
  await act(async () => root.render(<Harness visible={false} />));
  expect(operation.preview?.blob).toBe(file);
  await act(async () => root.render(<Harness />));
  vi.mocked(waitForVideoEditorSave)
    .mockResolvedValueOnce(undefined)
    .mockRejectedValueOnce(new Error('conflict'));
  await act(async () => operation.apply());
  expect(operation.error).toBe('storage-failed');
  expect(useVideoEditorStore.getState().project!.clips).toHaveLength(1);
  await click('gallery.videoReview.speechRetrySave');
  expect(operation.accepted).toBe(true);
  expect(durable.clips).toHaveLength(1);
  expect(durable.clips[0]).toMatchObject({
    duration: 12,
    textSnapshot: { text: { kind: 'gallery' } },
  });
  expect(prepareProjectAsset).toHaveBeenCalledOnce();
  expect(runReviewSpeechJob).not.toHaveBeenCalled();
});

it('disposes a late local preparation after unmount without inserting', async () => {
  await mount();
  await click('gallery.videoReview.textVoiceGallery');
  const decode = gate<number>();
  vi.mocked(inspectReviewAudio).mockReturnValueOnce(decode.promise);
  let pending!: Promise<void>;
  act(() => {
    pending = operation.prepareLocal({
      kind: 'file',
      file: new File(['data'], 'Late.wav', { type: 'audio/wav' }),
    });
  });
  const outcome = pending.catch(() => undefined);
  await vi.waitFor(() => expect(inspectReviewAudio).toHaveBeenCalledOnce());
  await act(async () => root.render(null));
  await act(async () => {
    decode.resolve(12);
    await outcome;
  });
  expect(URL.createObjectURL).not.toHaveBeenCalled();
  expect(prepareProjectAsset).not.toHaveBeenCalled();
});

it('keeps a late AI catalog failure out of the local source state', async () => {
  const catalog = gate<Awaited<ReturnType<typeof requestAIScenarioModelSelection>>>();
  vi.mocked(requestAIScenarioModelSelection).mockReturnValueOnce(
    catalog.promise.then(() => {
      throw new Error('offline');
    })
  );
  await act(async () => root.render(<Harness />));
  await act(async () => operation.open('script', 'phrase'));
  await click('gallery.videoReview.textVoiceGallery');
  expect(operation.error).toBeNull();
  await act(async () =>
    catalog.resolve({
      providers: [],
      models: [],
      scenario: 'video-speech',
      remembered: null,
      resolution: { status: 'empty', modelId: null, previousSelection: null, reason: null },
      globalSystemPrompt: '',
    })
  );
  expect(operation.source).toBe('gallery');
  expect(operation.error).toBeNull();
});

it('records a microphone take through the mounted panel and accepts it with the captured text', async () => {
  class Recorder extends EventTarget {
    static isTypeSupported = () => true;
    state = 'inactive';
    mimeType = 'audio/webm';
    start() {
      this.state = 'recording';
    }
    pause() {
      this.state = 'paused';
    }
    stop() {
      this.state = 'inactive';
      const data = new Event('dataavailable');
      Object.defineProperty(data, 'data', { value: new Blob(['raw']) });
      this.dispatchEvent(data);
      this.dispatchEvent(new Event('stop'));
    }
  }
  vi.stubGlobal('MediaRecorder', Recorder);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    }
  );
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop: vi.fn() }] })),
    },
  });
  await mount();
  await click('gallery.videoReview.textVoiceMicrophone');
  await click('videoEditor.app.recordAudioPlayVideo');
  await click('videoEditor.app.recordAudioStart');
  await vi.waitFor(async () => {
    await act(async () => {});
    expect(operation.recording.session.controller.transport.status).toBe('recording');
  });
  await click('videoEditor.app.recordAudioStop');
  await click('videoEditor.sidebar.textVoiceRecordingNext');
  await vi.waitFor(async () => {
    await act(async () => {});
    expect(operation.preview?.textSnapshot.text.kind).toBe('microphone');
  });
  expect(operation.preview?.textSnapshot.text.text).toBe('Speak this');
  expect(prepareProjectAsset).not.toHaveBeenCalled();
  expect(runReviewSpeechJob).not.toHaveBeenCalled();
  await click('gallery.videoReview.speechApply');
  expect(operation.accepted).toBe(true);
  expect(useVideoEditorStore.getState().project?.clips[0]).toMatchObject({
    textSnapshot: { text: { kind: 'microphone', text: 'Speak this' } },
  });
  await act(async () => operation.close());
  expect(operation.target).toBeNull();
});

async function mountBatch(count = 2) {
  const project = structuredClone(useVideoEditorStore.getState().project!);
  const fragments = project.textDocuments![0]!.document.fragments;
  for (let index = 1; index < count; index++)
    fragments.push({
      ...fragments[0]!,
      id: `phrase-${index}`,
      text: `Independent phrase ${index}`,
      start: index * 2 + 1,
      end: index * 2 + 2,
    });
  act(() => useVideoEditorStore.getState().setProject(project));
  let urls = 0;
  vi.mocked(URL.createObjectURL).mockImplementation(() => `blob:batch-${++urls}`);
  vi.mocked(runReviewSpeechJob).mockImplementation(async (request) => {
    if (request.operation !== 'speech' || !('phraseId' in request)) throw new Error('fixture');
    return {
      type: 'audio',
      staged: { id: `staged-${request.phraseId}`, size: 4, mimeType: 'audio/mpeg' },
    };
  });
  await act(async () => root.render(<Harness />));
  await act(async () => operation.loadModels());
  await act(async () =>
    operation.open(
      'script',
      fragments.map((entry) => entry.id)
    )
  );
}
it('accepts selected full takes as one frozen batch and retries Save without duplicate history', async () => {
  await mountBatch();
  vi.mocked(decodeReviewSpeechDuration).mockResolvedValueOnce(12).mockResolvedValueOnce(9);
  await act(async () => operation.prepare());
  expect(operation.consent?.queue.items.map((item) => item.capture.basis.fragment.text)).toEqual([
    'Speak this',
    'Independent phrase 1',
  ]);
  expect(runReviewSpeechJob).not.toHaveBeenCalled();
  await act(async () => operation.start());
  expect(operation.items.map((item) => item.preview?.duration)).toEqual([12, 9]);
  expect(operation.progress).toEqual({ completed: 2, total: 2 });
  await act(async () => operation.changePlacement({ start: 6 }));
  await act(async () => operation.focusItem('script', 'phrase-1'));
  await act(async () => operation.changePlacement({ start: 20 }));
  const previews = operation.items.map((item) => item.preview);
  await act(async () => root.render(<Harness visible={false} />));
  expect(operation.items.map((item) => item.preview)).toEqual(previews);
  await act(async () => root.render(<Harness />));
  const save = vi.mocked(waitForVideoEditorSave).getMockImplementation()!;
  vi.mocked(waitForVideoEditorSave).mockImplementation(async (...args) => {
    if (useVideoEditorStore.getState().project!.clips.some((clip) => 'textSnapshot' in clip))
      throw new Error('write-conflict');
    await save(...args);
  });
  await act(async () => operation.apply());
  expect(operation.error).toBe('storage-failed');
  expect(operation.pendingApply).toBe(true);
  const clips = useVideoEditorStore.getState().project!.clips;
  expect(clips).toHaveLength(2);
  expect(clips.map((clip) => [clip.startTime, clip.duration])).toEqual([
    [6, 12],
    [20, 9],
  ]);
  expect(new Set(clips.map((clip) => clip.trackId)).size).toBe(2);
  await act(async () => {
    operation.changePlacement({ start: 50 });
    operation.toggleItem('script', 'phrase');
  });
  expect(operation.placement.start).toBe(20);
  expect(operation.items.every((item) => item.selected)).toBe(true);
  const position = host.querySelector<HTMLInputElement>(
    `input[aria-label="${translate('videoEditor.sidebar.textVoicePosition')}"]`
  )!;
  expect(position.disabled).toBe(true);
  vi.mocked(waitForVideoEditorSave).mockImplementation(save);
  await act(async () => operation.apply());
  expect(operation.items.every((item) => item.accepted)).toBe(true);
  expect(operation.items.some((item) => item.selected)).toBe(false);
  expect(operation.pendingApply).toBe(false);
  expect(durable.clips.map((clip) => clip.id)).toEqual(clips.map((clip) => clip.id));
  expect(durable.duration).toBe(29);
  expect(runReviewSpeechJob).toHaveBeenCalledTimes(2);
  expect(prepareProjectAsset).toHaveBeenCalledTimes(2);
  expect(useVideoEditorStore.getState().projectHistory.past).toHaveLength(1);
  act(() => useVideoEditorStore.getState().undoProject());
  expect(useVideoEditorStore.getState().project!.clips).toHaveLength(0);
  act(() => useVideoEditorStore.getState().redoProject());
  expect(useVideoEditorStore.getState().project!.clips).toHaveLength(2);
  await act(async () => operation.close());
  expect(deleteProjectAsset).not.toHaveBeenCalled();
});
it('retains the ready take on cancel and admits only an explicitly approved unfinished retry', async () => {
  await mountBatch();
  const entered = gate<void>();
  const late = gate<Awaited<ReturnType<typeof runReviewSpeechJob>>>();
  const request = vi.mocked(runReviewSpeechJob).getMockImplementation()!;
  vi.mocked(runReviewSpeechJob).mockImplementation(async (...args) => {
    if (vi.mocked(runReviewSpeechJob).mock.calls.length === 2) {
      entered.resolve();
      return late.promise;
    }
    return request(...args);
  });
  await act(async () => operation.prepare());
  let pending!: Promise<void>;
  await act(async () => {
    pending = operation.start();
    await entered.promise;
  });
  const first = operation.items[0]!.preview;
  expect(first).not.toBeNull();
  expect(operation.progress).toEqual({ completed: 1, total: 2 });
  await act(async () => operation.cancel());
  await pending;
  await act(async () => operation.prepare());
  expect(operation.consent?.queue.items.map((item) => item.fragmentId)).toEqual(['phrase-1']);
  expect(runReviewSpeechJob).toHaveBeenCalledTimes(2);
  await act(async () => operation.start());
  expect(operation.items[0]!.preview).toBe(first);
  expect(operation.items[1]!.preview).not.toBeNull();
  await act(async () =>
    late.resolve({ type: 'audio', staged: { id: 'late-old', size: 4, mimeType: 'audio/mpeg' } })
  );
  await vi.waitFor(() =>
    expect(discardAudioStaging).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'late-old' }),
      expect.anything()
    )
  );
  expect(operation.items[0]!.preview).toBe(first);
  expect(runReviewSpeechJob).toHaveBeenCalledTimes(3);
  expect(prepareProjectAsset).not.toHaveBeenCalled();
});
it('continues after a failed phrase and requires fresh consent for unfinished text', async () => {
  await mountBatch(3);
  const request = vi.mocked(runReviewSpeechJob).getMockImplementation()!;
  vi.mocked(runReviewSpeechJob).mockImplementation(async (...args) => {
    if (vi.mocked(runReviewSpeechJob).mock.calls.length === 2) throw new Error('interrupted');
    return request(...args);
  });
  await act(async () => operation.prepare());
  await act(async () => operation.start());
  expect(operation.items.map((item) => !!item.preview)).toEqual([true, false, true]);
  expect(operation.progress).toEqual({ completed: 3, total: 3 });
  expect(operation.error).toBe('failed');
  await act(async () => operation.prepare());
  expect(operation.consent?.queue.items.map((item) => item.fragmentId)).toEqual(['phrase-1']);
  expect(runReviewSpeechJob).toHaveBeenCalledTimes(3);
  await act(async () => operation.start());
  expect(operation.items.every((item) => item.preview)).toBe(true);
  expect(runReviewSpeechJob).toHaveBeenCalledTimes(4);
});
it('keeps a one-item batch invocation in AI mode and does not accept an empty scope', async () => {
  await act(async () => root.render(<Harness />));
  await act(async () => operation.loadModels());
  await act(async () => operation.open('script', []));
  expect(operation.target).toBeNull();
  await act(async () => operation.open('script', ['phrase']));
  expect(operation.batch).toBe(true);
  await act(async () => operation.changeSource('microphone'));
  expect(operation.source).toBe('ai');
  expect(host.querySelector('[data-ui="video-editor.text-voice.batch"]')).not.toBeNull();
});

it('allows correcting a refused batch destination after complete pre-insertion cleanup', async () => {
  await mountBatch();
  act(() =>
    useVideoEditorStore.getState().updateProject((project) => ({
      ...project,
      tracks: [
        ...project.tracks,
        {
          id: 'voice-line',
          name: 'Voice',
          order: 1,
          kind: 'AUDIO',
          locked: false,
          visible: true,
          logicalLanes: [{ id: 'line-1' }],
        },
      ],
    }))
  );
  await act(async () => operation.prepare());
  await act(async () => operation.start());
  const placement = { start: 0, trackId: 'voice-line', timelineLaneId: 'line-1' };
  await act(async () => operation.changePlacement(placement));
  await act(async () => operation.focusItem('script', 'phrase-1'));
  await act(async () => operation.changePlacement(placement));
  await act(async () => operation.apply());
  expect(operation.error).toBe('selection');
  expect(operation.pendingApply).toBe(false);
  expect(prepareProjectAsset).not.toHaveBeenCalled();
  expect(useVideoEditorStore.getState().project!.clips).toHaveLength(0);
  await act(async () => operation.changePlacement({ ...placement, start: 12 }));
  await act(async () => operation.apply());
  expect(operation.items.every((item) => item.accepted)).toBe(true);
  expect(operation.items.some((item) => item.selected)).toBe(false);
  expect(durable.clips.map((clip) => clip.startTime)).toEqual([0, 12]);
});
