// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
import {
  addReviewTextFragment,
  createReviewTextDocument,
} from '../../features/video/review/text-document';
import { createVideoReviewSession } from '../../workflows/video-review/session';
import type {
  ReviewRecognitionJob,
  ReviewRecognitionProposal,
} from '../../workflows/video-review/recognition';
import type { requestAIScenarioModelSelection } from '../../workflows/ai-settings/query';
import { createReviewSpeechEditGuard } from './speech-edit-guard';
const mocks = vi.hoisted(() => ({
  prepare: vi.fn(),
  run: vi.fn(),
  apply: vi.fn(),
  wasApplied: vi.fn(),
  multimodal: false,
  modelCode: 'first-code',
  catalog: vi.fn(),
  remember: vi.fn(),
}));
vi.mock('../../workflows/video-review/recognition', () => ({
  prepareReviewRecognition: mocks.prepare,
  runReviewRecognition: mocks.run,
  applyReviewRecognition: mocks.apply,
  reviewRecognitionWasApplied: mocks.wasApplied,
}));
vi.mock('../../workflows/ai-settings/query', () => ({
  requestAIScenarioModelSelection: mocks.catalog,
  rememberAIScenarioModelSelection: mocks.remember,
}));
function recognitionContext(): Awaited<ReturnType<typeof requestAIScenarioModelSelection>> {
  return {
    models: [
      {
        id: 'model',
        modelCode: mocks.modelCode,
        operation: 'transcription',
        displayName: 'Transcription',
        providerId: 'provider',
        ...(mocks.multimodal
          ? {
              audio: {
                transcription: {
                  transport: 'audio-chat',
                  chatProtocol: 'bothub',
                  structuredOutput: 'json_schema',
                  responseFormat: 'json',
                  timestampGranularity: 'none',
                },
              },
            }
          : {}),
      },
    ],
    providers: [
      {
        id: 'provider',
        name: 'Provider',
        connectionType: 'openai-compatible',
        incarnation: 'initial',
        destinationBinding: `sha256:${'a'.repeat(64)}`,
        destinationKind: 'external',
        hasStoredApiKey: true,
        createdAt: 1,
      },
    ],
    scenario: 'gallery-transcription',
    remembered: null,
    resolution: { status: 'initial', modelId: 'model', previousSelection: null, reason: null },
    globalSystemPrompt: '',
  };
}

import { useReviewRecognition, type ReviewRecognitionAccess } from './use-recognition';
let root: Root | undefined;
let host: HTMLDivElement;
let current: ReturnType<typeof useReviewRecognition>;
function fixture() {
  const advanced = createQuickEditAdvancedState();
  const session = createVideoReviewSession({
    workspace: {
      aggregateId: 'video',
      sourceAssetId: 'source',
      formatVersion: 1,
      revision: 1,
      source: { duration: 10, width: 640, height: 360, mimeType: 'video/webm', size: 5 },
      advanced,
      history: [],
      cursor: 0,
      createdAt: 1,
      updatedAt: 1,
    },
    draft: null,
  });
  const guard = createReviewSpeechEditGuard(vi.fn());
  const access: ReviewRecognitionAccess = {
    session,
    target: { kind: 'original' },
    original: { file: new Blob(['source']), sourceAssetId: 'source' },
    selection: { start: 1, end: 4 },
    beforeAction: (action) => action(),
    flushAdvanced: vi.fn(async () => undefined),
    registerSpeechFlush: guard.register,
  };
  const job: ReviewRecognitionJob = {
    id: 'job',
    identity: 'basis',
    workspaceId: 'video',
    workspaceRevision: 1,
    geometry: 'geometry',
    documentBasis: 'document',
    target: access.target,
    modelId: 'model',
    approvedProviderId: 'provider',
    grouping: 'sentences-pauses',
    source: access.original!.file,
    ranges: [{ start: 0, end: 10 }],
    chunks: [{ start: 0, end: 10, range: 0 }],
    relatedIds: [],
  };
  const added = addReviewTextFragment(createReviewTextDocument(), {
    id: 'phrase',
    text: 'Recognized',
    start: 1,
    end: 4,
  });
  if (!added.ok) throw new Error('fixture');
  const proposal: ReviewRecognitionProposal = { job, document: added.document };
  mocks.prepare.mockResolvedValue(job);
  mocks.run.mockResolvedValue(proposal);
  mocks.apply.mockResolvedValue(undefined);
  mocks.wasApplied.mockResolvedValue(false);
  return { access, job, proposal, guard };
}
function Probe({ access }: { access: ReviewRecognitionAccess }) {
  current = useReviewRecognition(access);
  return <div />;
}
async function mount(access: ReviewRecognitionAccess) {
  await act(async () => root!.render(<Probe access={access} />));
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.multimodal = false;
  mocks.modelCode = 'first-code';
  mocks.catalog.mockImplementation(async () => recognitionContext());
  mocks.remember.mockResolvedValue(undefined);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

it('freezes multimodal correction settings and cancels a pending provider attempt without applying it', async () => {
  mocks.multimodal = true;
  const { access } = fixture();
  await mount(access);
  expect(current.multimodal).toBe(true);
  let activeSignal: AbortSignal | undefined;
  mocks.run.mockImplementationOnce((_session, _job, signal: AbortSignal) => {
    activeSignal = signal;
    return new Promise((_resolve, reject) =>
      signal.addEventListener('abort', () => reject(signal.reason), { once: true })
    );
  });
  await act(async () => {
    current.setRecognitionMode('rewrite');
    current.setGranularity('phrase');
    current.setPrompt('Make concise.');
  });
  await act(async () => current.recognize('provider'));
  expect(mocks.prepare.mock.calls[0]?.[5]).toMatchObject({
    recognition: { mode: 'rewrite', granularity: 'phrase', prompt: 'Make concise.' },
  });
  await act(async () => current.setPrompt('Changed later.'));
  expect(mocks.prepare.mock.calls[0]?.[5].recognition.prompt).toBe('Make concise.');
  expect(current.running).toBe(true);
  await act(async () => current.cancel());
  expect(activeSignal?.aborted).toBe(true);
  expect(current.running).toBe(false);
  expect(current.error).toBeNull();
  expect(mocks.apply).not.toHaveBeenCalled();
});

it('does not pass hidden correction instructions into pure transcription', async () => {
  mocks.multimodal = true;
  const { access } = fixture();
  await mount(access);
  await act(async () => current.setPrompt('Previously entered rewrite prompt.'));
  await act(async () => current.recognize('provider'));
  expect(mocks.prepare.mock.calls[0]?.[5]).toMatchObject({
    recognition: { mode: 'transcribe', granularity: 'sentence', prompt: '' },
  });
});
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  host.remove();
  vi.useRealTimers();
});

it('joins pending owners, binds consent, and keeps results disposable until Apply', async () => {
  const { access, proposal } = fixture();
  await mount(access);
  expect(mocks.prepare).not.toHaveBeenCalled();
  await act(async () => current.recognize('other-provider'));
  expect(current.error).toBe('model');
  expect(mocks.prepare).not.toHaveBeenCalled();
  await act(async () => current.recognize('provider'));
  expect(access.flushAdvanced).toHaveBeenCalledOnce();
  expect(mocks.prepare).toHaveBeenCalledWith(
    access.session,
    access.target,
    'model',
    'provider',
    expect.any(AbortSignal),
    {
      original: access.original,
      grouping: 'sentences-pauses',
      approvedSelection: {
        modelId: 'model',
        approvedProviderId: 'provider',
        approvedModelCode: mocks.modelCode,
        approvedDestination: `sha256:${'a'.repeat(64)}`,
      },
    }
  );
  expect(current.proposal).toBe(proposal);
  expect(mocks.apply).not.toHaveBeenCalled();
  await act(async () => current.apply());
  expect(mocks.apply).toHaveBeenCalledWith(
    access.session,
    proposal,
    expect.any(AbortSignal),
    'add'
  );
  expect(current.accepted).toBe(true);
});
it('captures explicit grouping and selected interval, and refuses double gestures', async () => {
  const { access, job } = fixture();
  await mount(access);
  let complete: ((proposal: ReviewRecognitionProposal) => void) | undefined;
  mocks.run.mockImplementationOnce(
    () =>
      new Promise<ReviewRecognitionProposal>((resolve) => {
        complete = resolve;
      })
  );
  await act(async () => {
    current.setGrouping('sentences');
    current.setSelectionOnly(true);
  });
  await act(async () => {
    current.recognize('provider');
    current.recognize('provider');
  });
  expect(mocks.prepare).toHaveBeenCalledOnce();
  expect(mocks.prepare.mock.calls[0]?.[5]).toMatchObject({
    grouping: 'sentences',
    selection: { start: 1, end: 4 },
  });
  expect(current.running).toBe(true);
  await act(async () => complete?.({ job, document: createReviewTextDocument() }));
  expect(current.running).toBe(false);
});
it.each([undefined, { start: 4, end: 1 }, { start: 0, end: Infinity }])(
  'refuses missing or invalid selected-only scope before Save or POST: %s',
  async (selection) => {
    const { access } = fixture();
    await mount(access);
    await act(async () => current.setSelectionOnly(true));
    access.selection = selection;
    await mount(access);
    await act(async () => current.recognize('provider'));
    expect(current.selectionOnly).toBe(true);
    expect(current.error).toBe('selection');
    expect(access.flushAdvanced).not.toHaveBeenCalled();
    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(mocks.run).not.toHaveBeenCalled();
    await act(async () => current.setSelectionOnly(false));
    await act(async () => current.recognize('provider'));
    expect(mocks.prepare).toHaveBeenCalledOnce();
  }
);
it('refuses a selection cleared while a pending transition is joining', async () => {
  const { access } = fixture();
  let proceed: (() => void) | undefined;
  access.beforeAction = (action) => {
    proceed = action;
  };
  await mount(access);
  await act(async () => current.setSelectionOnly(true));
  await act(async () => current.recognize('provider'));
  access.selection = undefined;
  await mount(access);
  await act(async () => proceed?.());
  expect(current.error).toBe('selection');
  expect(access.flushAdvanced).not.toHaveBeenCalled();
  expect(mocks.prepare).not.toHaveBeenCalled();
});
it('refuses a pending transition and aborts a late result without accepting text', async () => {
  const { access, job, guard } = fixture();
  await mount(access);
  let complete: ((proposal: ReviewRecognitionProposal) => void) | undefined;
  mocks.run.mockImplementationOnce(
    () =>
      new Promise<ReviewRecognitionProposal>((resolve) => {
        complete = resolve;
      })
  );
  await act(async () => current.recognize('provider'));
  const navigate = vi.fn();
  await act(async () => {
    await guard.perform(navigate);
  });
  expect(navigate).not.toHaveBeenCalled();
  await act(async () => {
    current.cancel();
    complete?.({ job, document: createReviewTextDocument() });
  });
  expect(current.proposal).toBeNull();
  expect(current.error).toBeNull();
  expect(current.running).toBe(false);
  expect(mocks.apply).not.toHaveBeenCalled();
});
it('shows elapsed waiting time and stops its clock after cancellation', async () => {
  const { access, proposal } = fixture();
  await mount(access);
  vi.useFakeTimers();
  let complete: ((result: ReviewRecognitionProposal) => void) | undefined;
  mocks.run.mockImplementationOnce(
    () =>
      new Promise<ReviewRecognitionProposal>((resolve) => {
        complete = resolve;
      })
  );
  await act(async () => current.recognize('provider'));
  await act(async () => vi.advanceTimersByTime(1250));
  expect(current.elapsed).toBe(1);
  await act(async () => {
    current.cancel();
    complete?.(proposal);
  });
  expect(current.running).toBe(false);
  expect(current.proposal).toBeNull();
  await act(async () => vi.advanceTimersByTime(5000));
  expect(current.elapsed).toBe(1);
});
it('retains completed work for explicit retry without applying it on provider failure', async () => {
  const { access, job } = fixture();
  await mount(access);
  mocks.run.mockRejectedValueOnce(new Error('provider failed'));
  await act(async () => current.recognize('provider'));
  expect(current.error).toBe('failed');
  expect(mocks.apply).not.toHaveBeenCalled();
  await act(async () => current.recognize('provider'));
  expect(mocks.prepare.mock.calls[1]?.[5]).toMatchObject({ previous: job });
  expect(current.proposal?.job).toBe(job);
});
it('starts a new recognition after reviewing a completed result rather than replaying cached chunks', async () => {
  const { access } = fixture();
  await mount(access);
  await act(async () => current.recognize('provider'));
  await act(async () => current.recognize('provider'));
  expect(mocks.prepare.mock.calls[1]?.[5]).not.toHaveProperty('previous');
});
it('executes proposal editing synchronously without mutating accepted text', async () => {
  const { access, proposal } = fixture();
  await mount(access);
  await act(async () => current.recognize('provider'));
  let called = false;
  await act(async () =>
    current.setText((document) => {
      called = true;
      return (
        document && {
          ...document,
          fragments: document.fragments.map((fragment) => ({ ...fragment, text: 'Edited' })),
        }
      );
    })
  );
  expect(called).toBe(true);
  expect(current.proposal?.document.fragments[0]?.text).toBe('Edited');
  expect(proposal.document.fragments[0]?.text).toBe('Recognized');
  expect(access.session.getSnapshot().document.advancedContent.text).toBeUndefined();
});
it('checks absent receipt authority and joins pending edits before retrying Apply', async () => {
  const { access, proposal } = fixture();
  await mount(access);
  await act(async () => current.recognize('provider'));
  mocks.apply.mockImplementationOnce(async () => {
    const before = access.session.getSnapshot().document.advancedContent;
    proposal.receipt = {
      id: 'receipt',
      at: 1,
      target: 'advancedContent',
      before,
      after: { ...before, text: proposal.document },
    };
    throw new Error('lost acknowledgement');
  });
  await act(async () => current.apply());
  expect(current.error).toBe('failed');
  expect(current.proposal).toBe(proposal);
  const join = vi.mocked(access.flushAdvanced);
  join.mockRejectedValueOnce(new Error('pending edit failed'));
  await act(async () => current.apply());
  expect(mocks.apply).toHaveBeenCalledOnce();
  expect(join).toHaveBeenCalledTimes(3);
  expect(current.accepted).toBe(false);
  expect(current.proposal).toBe(proposal);
  await act(async () => current.apply());
  expect(mocks.apply).toHaveBeenCalledTimes(2);
  expect(join).toHaveBeenCalledTimes(4);
  expect(mocks.wasApplied).toHaveBeenCalledTimes(2);
  expect(current.accepted).toBe(true);
  expect(mocks.run).toHaveBeenCalledOnce();
});
it.each(['accepted', 'unavailable'])(
  'reads %s receipt authority before touching pending buffers',
  async (authority) => {
    const { access, proposal } = fixture();
    await mount(access);
    await act(async () => current.recognize('provider'));
    mocks.apply.mockImplementationOnce(async () => {
      const before = access.session.getSnapshot().document.advancedContent;
      proposal.receipt = {
        id: 'receipt',
        at: 1,
        target: 'advancedContent',
        before,
        after: { ...before, text: proposal.document },
      };
      throw new Error('lost acknowledgement');
    });
    await act(async () => current.apply());
    if (authority === 'accepted') mocks.wasApplied.mockResolvedValueOnce(true);
    else mocks.wasApplied.mockRejectedValueOnce(new Error('unavailable'));
    await act(async () => current.apply());
    expect(mocks.apply).toHaveBeenCalledOnce();
    expect(access.flushAdvanced).toHaveBeenCalledTimes(2);
    expect(current.accepted).toBe(authority === 'accepted');
    expect(current.proposal).toBe(proposal);
    expect(mocks.run).toHaveBeenCalledOnce();
  }
);
it('reports save admission failure before preparing a request', async () => {
  const { access } = fixture();
  vi.mocked(access.flushAdvanced).mockRejectedValueOnce(new Error('save failed'));
  await mount(access);
  await act(async () => current.recognize('provider'));
  expect(current.error).toBe('failed');
  expect(mocks.prepare).not.toHaveBeenCalled();
  expect(mocks.run).not.toHaveBeenCalled();
});
it.each([false, true])(
  'checks an ambiguous receipt before a fresh paid recognition, accepted=%s',
  async (accepted) => {
    const { access, proposal, job } = fixture();
    await mount(access);
    await act(async () => current.recognize('provider'));
    mocks.apply.mockImplementationOnce(async () => {
      const before = access.session.getSnapshot().document.advancedContent;
      proposal.receipt = {
        id: 'receipt',
        at: 1,
        target: 'advancedContent',
        before,
        after: { ...before, text: proposal.document },
      };
      throw new Error('lost acknowledgement');
    });
    await act(async () => current.apply());
    mocks.wasApplied.mockResolvedValueOnce(accepted);
    mocks.run.mockResolvedValueOnce({ job, document: proposal.document });
    await act(async () => current.recognize('provider'));
    expect(mocks.wasApplied).toHaveBeenCalledWith(
      access.session,
      proposal,
      expect.any(AbortSignal)
    );
    expect(mocks.prepare).toHaveBeenCalledTimes(accepted ? 1 : 2);
    expect(mocks.run).toHaveBeenCalledTimes(accepted ? 1 : 2);
    expect(current.accepted).toBe(accepted);
  }
);
it('preserves an ambiguous result and sends no fresh request when receipt authority cannot be read', async () => {
  const { access, proposal } = fixture();
  await mount(access);
  await act(async () => current.recognize('provider'));
  mocks.apply.mockImplementationOnce(async () => {
    const before = access.session.getSnapshot().document.advancedContent;
    proposal.receipt = {
      id: 'receipt',
      at: 1,
      target: 'advancedContent',
      before,
      after: { ...before, text: proposal.document },
    };
    throw new Error('lost acknowledgement');
  });
  await act(async () => current.apply());
  mocks.wasApplied.mockRejectedValueOnce(new Error('authority unavailable'));
  await act(async () => current.recognize('provider'));
  expect(current.proposal).toBe(proposal);
  expect(current.error).toBe('failed');
  expect(mocks.prepare).toHaveBeenCalledOnce();
  expect(mocks.run).toHaveBeenCalledOnce();
});
it('aborts the in-flight request on unmount and discards its eventual result', async () => {
  const { access, proposal } = fixture();
  await mount(access);
  let complete: ((result: ReviewRecognitionProposal) => void) | undefined;
  mocks.run.mockImplementationOnce(
    () =>
      new Promise<ReviewRecognitionProposal>((resolve) => {
        complete = resolve;
      })
  );
  await act(async () => current.recognize('provider'));
  const activeSignal: AbortSignal = mocks.run.mock.calls[0]?.[2];
  await act(async () => root?.unmount());
  root = undefined;
  expect(activeSignal.aborted).toBe(true);
  await act(async () => complete?.(proposal));
  expect(mocks.apply).not.toHaveBeenCalled();
});

it('does not reuse partial recognition after the model code changes under its retained ID', async () => {
  const { access } = fixture();
  await mount(access);
  mocks.run.mockRejectedValueOnce(new Error('provider failed'));
  await act(async () => current.recognize('provider'));
  mocks.modelCode = 'replacement-code';
  await act(async () => current.reloadModels());
  await act(async () => current.setModelId('model'));
  await act(async () => current.recognize('provider'));
  expect(mocks.prepare).toHaveBeenCalledTimes(2);
  expect(mocks.prepare.mock.calls[1]?.[5]).not.toHaveProperty('previous');
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function expectNoRecognitionWork(access: ReviewRecognitionAccess) {
  expect(access.flushAdvanced).not.toHaveBeenCalled();
  expect(mocks.prepare).not.toHaveBeenCalled();
  expect(mocks.run).not.toHaveBeenCalled();
}
it('reads Gallery transcription independently without writes on open or reload', async () => {
  const { access } = fixture();
  await mount(access);
  await act(async () => current.reloadModels());
  expect(mocks.catalog).toHaveBeenCalledWith('gallery-transcription');
  expect(mocks.remember).not.toHaveBeenCalled();
  expectNoRecognitionWork(access);
  await act(async () => current.setModelId('model'));
  expect(mocks.remember).toHaveBeenCalledExactlyOnceWith(
    expect.anything(),
    'gallery-transcription',
    'model',
    'explicit'
  );
  expectNoRecognitionWork(access);
});
it('refuses a first-use preference before recognition Save and permits explicit retry', async () => {
  const { access } = fixture();
  await mount(access);
  await act(async () => current.setPrompt('Keep this draft'));
  mocks.remember.mockRejectedValueOnce(new Error('refused'));
  await act(async () => current.recognize('provider'));
  expect(current.selectionFailed).toBe(true);
  expect(current.prompt).toBe('Keep this draft');
  expectNoRecognitionWork(access);
  await act(async () => current.recognize('provider'));
  expect(mocks.prepare).toHaveBeenCalledOnce();
  expect(mocks.remember).toHaveBeenLastCalledWith(
    expect.anything(),
    'gallery-transcription',
    'model',
    'initial'
  );
});
it('requires explicit replacement and retains grouping and instruction drafts after model removal', async () => {
  const { access } = fixture();
  await mount(access);
  await act(async () => {
    current.setGrouping('sentences');
    current.setPrompt('Retained');
  });
  const next = recognitionContext();
  next.models[0]!.id = 'replacement';
  next.models[0]!.modelCode = 'replacement';
  next.resolution.modelId = 'replacement';
  mocks.catalog.mockResolvedValue(next);
  await act(async () => current.reloadModels());
  expect(current.modelId).toBe('');
  expect(current.modelUnavailable).toBe(true);
  await act(async () => current.recognize('provider'));
  expectNoRecognitionWork(access);
  expect(current.prompt).toBe('Retained');
  expect(current.grouping).toBe('sentences');
  await act(async () => current.setModelId('replacement'));
  expect(current.modelId).toBe('replacement');
  expect(current.prompt).toBe('Retained');
  expectNoRecognitionWork(access);
});
it('refuses a changed destination before recognition flush, Save or provider work', async () => {
  const { access } = fixture();
  await mount(access);
  const next = recognitionContext();
  next.providers[0]!.destinationBinding = `sha256:${'b'.repeat(64)}`;
  mocks.catalog.mockResolvedValue(next);
  await act(async () => current.recognize('provider'));
  expect(current.modelUnavailable).toBe(true);
  expect(mocks.remember).not.toHaveBeenCalled();
  expectNoRecognitionWork(access);
});
it.each(['catalog', 'preference'] as const)(
  'cancels pending %s admission before recognition Save',
  async (phase) => {
    const { access } = fixture();
    await mount(access);
    const catalog = deferred<ReturnType<typeof recognitionContext>>();
    const preference = deferred<void>();
    if (phase === 'catalog') mocks.catalog.mockReturnValueOnce(catalog.promise);
    else mocks.remember.mockReturnValueOnce(preference.promise);
    await act(async () => current.recognize('provider'));
    expect(current.running).toBe(true);
    await act(async () => current.cancel());
    await act(async () => {
      catalog.resolve(recognitionContext());
      preference.resolve();
    });
    expect(current.running).toBe(false);
    expect(current.proposal).toBeNull();
    expectNoRecognitionWork(access);
  }
);
it('does not prepare the old session after replacement during preference admission', async () => {
  const old = fixture();
  await mount(old.access);
  const preference = deferred<void>();
  mocks.remember.mockReturnValueOnce(preference.promise);
  await act(async () => current.recognize('provider'));
  const next = fixture();
  await mount(next.access);
  await act(async () => preference.resolve());
  expectNoRecognitionWork(old.access);
  expectNoRecognitionWork(next.access);
  expect(current.proposal).toBeNull();
});
it('admits a capability-only native transcription model without a stored audio profile', async () => {
  const { access } = fixture();
  const next = recognitionContext();
  next.providers[0]!.connectionType = 'deepgram';
  mocks.catalog.mockResolvedValue(next);
  await mount(access);
  expect(current.catalogs?.transcription.models[0]?.audio?.transcription).toBeUndefined();
  expect(current.multimodal).toBe(false);
  await act(async () => current.recognize('provider'));
  expect(mocks.prepare).toHaveBeenCalledOnce();
  expect(mocks.prepare.mock.calls[0]?.[5]).not.toHaveProperty('recognition');
});
it('keeps a completed proposal available when later model admission fails', async () => {
  const { access, proposal } = fixture();
  await mount(access);
  await act(async () => current.recognize('provider'));
  mocks.remember.mockRejectedValueOnce(new Error('refused'));
  await act(async () => current.recognize('provider'));
  expect(current.proposal).toBe(proposal);
  expect(mocks.run).toHaveBeenCalledOnce();
  await act(async () => current.apply());
  expect(mocks.apply).toHaveBeenCalledOnce();
});

it('retains the admitted destination through a deferred recognition flush', async () => {
  const { access } = fixture();
  const flush = Promise.withResolvers<void>();
  access.flushAdvanced = vi.fn(() => flush.promise);
  await mount(access);
  await act(async () => current.recognize('provider'));
  expect(access.flushAdvanced).toHaveBeenCalledOnce();
  const changed = recognitionContext();
  changed.providers[0]!.destinationBinding = `sha256:${'b'.repeat(64)}`;
  mocks.catalog.mockResolvedValue(changed);
  await act(async () => flush.resolve());
  expect(mocks.prepare.mock.calls[0]?.[5]).toMatchObject({
    approvedSelection: {
      modelId: 'model',
      approvedProviderId: 'provider',
      approvedModelCode: mocks.modelCode,
      approvedDestination: `sha256:${'a'.repeat(64)}`,
    },
  });
});
