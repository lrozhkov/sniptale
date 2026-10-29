// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ProjectTextVoicePanel } from '../../workspace/sidebar/selection/inspection/text-voice';
import { InspectorLayout } from '../../../ui/compact-inspector-controls/layout';
import { translate } from '../../../platform/i18n';
import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import { useVideoEditorStore } from '../../state/store';
import { useVideoProjectTextVoice, type VideoProjectTextVoiceController } from './text-voice';
import type { requestAIScenarioModelSelection } from '../../../workflows/ai-settings/query';

const io = vi.hoisted(() => ({ read: vi.fn(), remember: vi.fn(), save: vi.fn(), paid: vi.fn() }));
vi.mock('../../../workflows/ai-settings/query', () => ({
  requestAIScenarioModelSelection: io.read,
  rememberAIScenarioModelSelection: io.remember,
}));
vi.mock('../../../composition/persistence/media-library', () => ({
  listMediaLibrary: vi.fn(async () => []),
}));
vi.mock('../../../composition/persistence/gallery-saved-views', () => ({
  listGallerySavedViews: vi.fn(async () => []),
}));
vi.mock('./text-voice-recording', () => ({
  useProjectTextVoiceRecording: () => ({
    dismiss: (next: () => void) => next(),
    markRetained: vi.fn(),
    session: { isSaving: false },
  }),
}));
vi.mock('./save-readiness', () => ({
  saveVideoEditorTextSession: io.save,
  waitForVideoEditorSave: io.save,
}));
vi.mock('../../../workflows/audio-jobs/client', () => ({ runReviewSpeechJob: io.paid }));

type Context = Awaited<ReturnType<typeof requestAIScenarioModelSelection>>;
function context(): Context {
  return {
    scenario: 'video-speech',
    globalSystemPrompt: '',
    remembered: null,
    resolution: { status: 'initial', modelId: 'first', previousSelection: null, reason: null },
    providers: [
      {
        id: 'provider',
        name: 'Native provider',
        connectionType: 'google',
        incarnation: 'one',
        destinationBinding: `sha256:${'a'.repeat(64)}`,
        hasStoredApiKey: true,
        createdAt: 1,
        destinationKind: 'external',
      },
    ],
    models: ['first', 'second'].map((id) => ({
      id,
      providerId: 'provider',
      modelCode: id,
      displayName: id,
      operation: 'speech',
      capabilities: {
        input: { text: 'supported' },
        output: { audio: 'supported' },
        operations: { speech: 'supported' },
        features: {},
      },
    })),
  };
}
function gate<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { resolve, promise };
}
let root: Root;
let host: HTMLDivElement;
let operation: VideoProjectTextVoiceController;
let original: ReturnType<typeof useVideoEditorStore.getState>;
function Surface({ showPanel = false }: { showPanel?: boolean }) {
  const project = useVideoEditorStore((state) => state.project)!;
  operation = useVideoProjectTextVoice(project);
  return showPanel && operation.target ? (
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
async function open() {
  await act(async () => root.render(<Surface />));
  await act(async () => operation.open('script', 'phrase'));
}
async function voice() {
  await open();
  await act(async () =>
    operation.changeProfile({ modelId: 'first', voiceId: 'Draft voice', responseFormat: 'wav' })
  );
}
function noWork() {
  expect(io.save).not.toHaveBeenCalled();
  expect(io.paid).not.toHaveBeenCalled();
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.resetAllMocks();
  io.read.mockResolvedValue(context());
  io.remember.mockResolvedValue(undefined);
  original = useVideoEditorStore.getState();
  const project = createEmptyVideoProject('Voice selection');
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
            timingRevision: 1,
            timeDomain: 'result',
            alignment: 'manual',
            showInVideo: true,
          },
        ],
      },
    },
  ];
  useVideoEditorStore.getState().setProject(project);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  useVideoEditorStore.setState(original, true);
  vi.unstubAllGlobals();
});
it('reads only the video speech context on opening without preference or project writes', async () => {
  await act(async () => root.render(<Surface />));
  expect(io.read).not.toHaveBeenCalled();
  await act(async () => operation.open('script', 'phrase'));
  expect(io.read).toHaveBeenCalledExactlyOnceWith('video-speech');
  expect(operation.modelId).toBe('first');
  expect(operation.profile).toEqual({ modelId: 'first', voiceId: '', responseFormat: 'wav' });
  await act(async () => operation.loadModels());
  expect(io.remember).not.toHaveBeenCalled();
  noWork();
});
it('admits a capability-only native model with explicit voice before consent and first use', async () => {
  await voice();
  await act(async () => operation.prepare());
  expect(operation.consent?.capture.profile.voiceId).toBe('Draft voice');
  expect(operation.consent?.providerId).toBe('provider');
  expect(io.remember).toHaveBeenCalledExactlyOnceWith(
    expect.anything(),
    'video-speech',
    'first',
    'initial'
  );
  noWork();
});
it('keeps an empty native voice out of consent and paid work', async () => {
  await open();
  await act(async () => operation.prepare());
  expect(operation.consent).toBeNull();
  expect(io.remember).not.toHaveBeenCalled();
  noWork();
});
it('preserves the draft on ordinary refresh and resets it after explicit same-ID replacement', async () => {
  await voice();
  const next = context();
  next.models[0]!.audio = { speech: { voiceId: 'Current provider voice', responseFormat: 'wav' } };
  io.read.mockResolvedValue(next);
  await act(async () => operation.loadModels());
  expect(operation.profile?.voiceId).toBe('Draft voice');
  io.remember.mockRejectedValueOnce(new Error('refused'));
  await act(async () => operation.chooseModel('first'));
  expect(operation.selectionFailed).toBe(true);
  expect(operation.profile?.voiceId).toBe('Draft voice');
  await act(async () => operation.chooseModel('first'));
  expect(operation.profile?.voiceId).toBe('Current provider voice');
  expect(io.remember).toHaveBeenLastCalledWith(next, 'video-speech', 'first', 'explicit');
  noWork();
});
it('requires explicit replacement after removal and retains the unavailable draft', async () => {
  await voice();
  const next = context();
  next.models = next.models.filter((model) => model.id === 'second');
  next.resolution.modelId = 'second';
  io.read.mockResolvedValue(next);
  await act(async () => operation.loadModels());
  expect(operation.modelId).toBeNull();
  expect(operation.selectionUnavailable).toBe(true);
  expect(operation.profile?.voiceId).toBe('Draft voice');
  await act(async () => operation.prepare());
  expect(operation.consent).toBeNull();
  expect(io.remember).not.toHaveBeenCalled();
  await act(async () => operation.chooseModel('second'));
  expect(operation.modelId).toBe('second');
  expect(operation.profile?.voiceId).toBe('');
  noWork();
});
it('blocks refused first use before capture, source Save and provider work', async () => {
  await voice();
  io.remember.mockRejectedValueOnce(new Error('refused'));
  await act(async () => operation.prepare());
  expect(operation.consent).toBeNull();
  expect(operation.selectionFailed).toBe(true);
  expect(operation.profile?.voiceId).toBe('Draft voice');
  noWork();
  await act(async () => operation.prepare());
  expect(operation.consent).not.toBeNull();
  noWork();
});
it('rechecks provider identity after consent and blocks a changed destination', async () => {
  await voice();
  await act(async () => operation.prepare());
  expect(operation.consent).not.toBeNull();
  const next = context();
  next.providers[0]!.destinationBinding = `sha256:${'b'.repeat(64)}`;
  io.read.mockResolvedValue(next);
  await act(async () => operation.start());
  expect(operation.selectionUnavailable).toBe(true);
  expect(operation.consent).toBeNull();
  expect(operation.error).toBe('model-unavailable');
  noWork();
});
it('does not continue after cancellation and close while preference admission is pending', async () => {
  await voice();
  const pending = gate<void>();
  io.remember.mockReturnValueOnce(pending.promise);
  let prepared: Promise<void>;
  await act(async () => {
    prepared = operation.prepare();
  });
  await act(async () => operation.cancel());
  await act(async () => operation.close());
  await act(async () => {
    pending.resolve();
    await prepared!;
  });
  expect(operation.target).toBeNull();
  expect(operation.consent).toBeNull();
  noWork();
});
it('does not continue an old project after replacement while admission is pending', async () => {
  await voice();
  const pending = gate<void>();
  io.remember.mockReturnValueOnce(pending.promise);
  let prepared: Promise<void>;
  await act(async () => {
    prepared = operation.prepare();
  });
  await act(async () =>
    useVideoEditorStore.getState().setProject(createEmptyVideoProject('Replacement'))
  );
  await act(async () => {
    pending.resolve();
    await prepared!;
  });
  expect(operation.target).toBeNull();
  expect(operation.consent).toBeNull();
  noWork();
});
it('leaves local source acquisition usable after a late catalog refusal', async () => {
  const pending = gate<Context>();
  io.read.mockReturnValueOnce(
    pending.promise.then(() => {
      throw new Error('offline');
    })
  );
  await open();
  await act(async () => operation.changeSource('gallery'));
  await act(async () => pending.resolve(context()));
  expect(operation.source).toBe('gallery');
  expect(operation.configurationFailed).toBe(false);
  expect(operation.error).toBeNull();
  expect(io.remember).not.toHaveBeenCalled();
  noWork();
});
it('blocks a preference refusal after consent before source Save or paid work', async () => {
  await voice();
  await act(async () => operation.prepare());
  io.remember.mockRejectedValueOnce(new Error('refused'));
  await act(async () => operation.start());
  expect(operation.consent).toBeNull();
  expect(operation.selectionFailed).toBe(true);
  expect(operation.profile?.voiceId).toBe('Draft voice');
  noWork();
});
it('cancels catalog admission before it can write a first-use preference', async () => {
  await voice();
  const pending = gate<Context>();
  io.read.mockReturnValueOnce(pending.promise);
  let prepared: Promise<void>;
  await act(async () => {
    prepared = operation.prepare();
  });
  await act(async () => operation.cancel());
  await act(async () => {
    pending.resolve(context());
    await prepared!;
  });
  expect(operation.consent).toBeNull();
  expect(io.remember).not.toHaveBeenCalled();
  noWork();
});
it('restores an editable AI selector after leaving during an explicit preference write', async () => {
  await voice();
  await act(async () => root.render(<Surface showPanel />));
  const source = (key: Parameters<typeof translate>[0]) =>
    [...host.querySelectorAll('button')].find((button) => button.textContent === translate(key))!;
  const selector = () =>
    host.querySelector<HTMLButtonElement>('.sniptale-ai-model-selector-trigger')!;
  const pending = gate<void>();
  io.remember.mockReturnValueOnce(pending.promise);
  await act(async () => operation.chooseModel('second'));
  expect(operation.selectionPending).toBe(true);
  expect(selector().matches(':disabled')).toBe(true);
  await act(async () => source('gallery.videoReview.textVoiceGallery').click());
  await act(async () => pending.resolve());
  await act(async () => source('gallery.videoReview.textVoiceAI').click());
  expect(operation.selectionPending).toBe(false);
  expect(selector().matches(':disabled')).toBe(false);
  await act(async () => operation.chooseModel('first'));
  expect(operation.modelId).toBe('first');
  noWork();
});

it.each(['destination', 'model-code'] as const)(
  'rejects a changed %s after narration consent before Save',
  async (change) => {
    await voice();
    await act(async () => operation.prepare());
    expect(operation.consent).not.toBeNull();
    const next = context();
    if (change === 'destination')
      next.providers[0]!.destinationBinding = `sha256:${'b'.repeat(64)}`;
    else next.models[0]!.modelCode = 'replacement';
    io.read.mockResolvedValue(next);
    await act(async () => operation.start());
    expect(operation.consent).toBeNull();
    expect(operation.error).toBe('model-unavailable');
    expect(operation.profile?.voiceId).toBe('Draft voice');
    noWork();
  }
);

it('captures the approved narration destination before presenting consent', async () => {
  await voice();
  await act(async () => operation.prepare());
  expect(operation.consent).toMatchObject({
    approvedSelection: {
      modelId: 'first',
      approvedProviderId: 'provider',
      approvedModelCode: 'first',
      approvedDestination: `sha256:${'a'.repeat(64)}`,
    },
  });
  noWork();
});
