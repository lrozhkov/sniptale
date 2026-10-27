// @vitest-environment jsdom
import { act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getVideoProject } from '../../../composition/persistence/projects';
import { isCurrentVideoProjectSnapshot } from '../../../composition/persistence/projects/revision';
import type { ReviewTextProposal } from '../../../contracts/ai/review-text';

import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import {
  requestAIScenarioModelSelection,
  rememberAIScenarioModelSelection,
} from '../../../workflows/ai-settings/query';
import { requestLlmSessionToken } from '../../../workflows/ai-session/llm-session';
import { runReviewTextJob } from '../../../workflows/video-review/text-rewrite-client';
import { useVideoEditorStore } from '../../state/store';
import { waitForVideoEditorSave } from './save-readiness';
import { useVideoProjectTextRewrite, type VideoProjectTextRewriteController } from './text-rewrite';

vi.mock('../../../composition/persistence/projects', () => ({ getVideoProject: vi.fn() }));
vi.mock('../../../composition/persistence/projects/revision', () => ({
  isCurrentVideoProjectSnapshot: vi.fn(),
}));
vi.mock('../../../workflows/ai-settings/query', () => ({
  requestAIScenarioModelSelection: vi.fn(),
  rememberAIScenarioModelSelection: vi.fn(),
}));
vi.mock('../../../workflows/ai-session/llm-session', () => ({ requestLlmSessionToken: vi.fn() }));
vi.mock('../../../workflows/video-review/text-rewrite-client', () => ({
  runReviewTextJob: vi.fn(),
}));
vi.mock('./save-readiness', async (original) => ({
  ...(await original<typeof import('./save-readiness')>()),
  waitForVideoEditorSave: vi.fn(),
}));

type SelectionContext = Awaited<ReturnType<typeof requestAIScenarioModelSelection>>;
const catalog: SelectionContext = {
  scenario: 'video-text-edit',
  globalSystemPrompt: '',
  remembered: null,
  resolution: { status: 'initial', modelId: 'model', previousSelection: null, reason: null },
  providers: [
    {
      id: 'provider',
      name: 'Provider',
      connectionType: 'neuraldeep',
      incarnation: 'provider-incarnation',
      hasStoredApiKey: true,
      createdAt: 1,
      destinationKind: 'external',
      destinationBinding: `sha256:${'a'.repeat(64)}`,
    },
  ],
  models: [{ id: 'model', providerId: 'provider', displayName: 'Text', modelCode: 'text' }],
};
const response: ReviewTextProposal = {
  version: 1,
  fragments: [{ fromIds: ['phrase'], text: 'Rewritten text' }],
};
function gate<T>() {
  let release!: (value: T) => void;
  const promise = new Promise<T>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let initial: ReturnType<typeof useVideoEditorStore.getState>;
let controller: VideoProjectTextRewriteController | null;
let durable: NonNullable<ReturnType<typeof useVideoEditorStore.getState>['project']>;
let revision: number;
let requestEntered: ReturnType<typeof gate<void>>;
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
  controller = useVideoProjectTextRewrite(project);
  return (
    <>
      {autoLoad && <InitialCatalog load={controller.loadModels} />}
      {visible && <output>{controller.preview?.proposal?.fragments[0]?.text}</output>}
    </>
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  initial = useVideoEditorStore.getState();
  const project = createEmptyVideoProject('Rewrite');
  project.version = 5;
  project.duration = 4;
  project.textDocuments = [
    {
      id: 'document',
      binding: { kind: 'project' },
      document: {
        version: 1,
        fragments: [
          {
            id: 'phrase',
            text: 'Original text',
            originalText: 'Original text',
            start: 0,
            end: 4,
            revision: 0,
            timingRevision: 0,
            alignment: 'manual',
            timeDomain: 'result',
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
    async (project, expected) =>
      expected === revision && JSON.stringify(project) === JSON.stringify(durable)
  );
  vi.mocked(waitForVideoEditorSave).mockImplementation(async () => {
    const project = useVideoEditorStore.getState().project!;
    if (JSON.stringify(durable) !== JSON.stringify(project)) revision++;
    durable = structuredClone(project);
  });
  vi.mocked(requestAIScenarioModelSelection).mockResolvedValue(catalog);
  vi.mocked(rememberAIScenarioModelSelection).mockResolvedValue(undefined);
  vi.mocked(requestLlmSessionToken).mockResolvedValue('token');
  requestEntered = gate();
  vi.mocked(runReviewTextJob).mockImplementation(async () => {
    requestEntered.release();
    return structuredClone(response);
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
  act(() => current().open('document', ['phrase'], true));
  act(() => current().setOptions((options) => ({ ...options, prompt: 'Make clear' })));
}
async function generate() {
  requestEntered = gate();
  await act(async () => {
    current().start();
    await requestEntered.promise;
  });
}
it('retains hidden drafts and applies one Undo and Redo', async () => {
  await mount();
  const load = current().loadModels;
  const options = current().setOptions;
  await act(async () => root.render(<Harness visible={false} />));
  expect(current().target?.ids).toEqual(['phrase']);
  expect(current().options.prompt).toBe('Make clear');
  expect(current().loadModels).toBe(load);
  expect(current().setOptions).toBe(options);
  await generate();
  await act(async () => root.render(<Harness />));
  expect(host.textContent).toBe('Rewritten text');
  expect(
    useVideoEditorStore.getState().project!.textDocuments![0]!.document.fragments[0]!.text
  ).toBe('Original text');
  await act(async () => current().apply('replace'));
  expect(current().accepted).toBe(true);
  expect(useVideoEditorStore.getState().projectHistory.past).toHaveLength(1);
  expect(durable.textDocuments![0]!.document.fragments[0]!.text).toBe('Rewritten text');
  act(() => useVideoEditorStore.getState().undoProject());
  expect(
    useVideoEditorStore.getState().project!.textDocuments![0]!.document.fragments[0]!.text
  ).toBe('Original text');
  act(() => useVideoEditorStore.getState().redoProject());
  expect(
    useVideoEditorStore.getState().project!.textDocuments![0]!.document.fragments[0]!.text
  ).toBe('Rewritten text');
});
it('keeps an edited proposal and retries only receipt acknowledgement after Save failure', async () => {
  await mount();
  await generate();
  act(() =>
    current().edit((proposal) => ({
      ...proposal,
      fragments: proposal.fragments.map((fragment) => ({ ...fragment, text: 'Edited text' })),
    }))
  );
  const edited = current().preview;
  vi.mocked(waitForVideoEditorSave).mockRejectedValueOnce(new Error('private storage details'));
  await act(async () => current().apply('variant'));
  expect(current().error).toBe('storage-failed');
  expect(current().preview).toBe(edited);
  expect(current().preview?.receipt?.mode).toBe('variant');
  expect(current().accepted).toBe(false);
  act(() => current().edit(() => response));
  expect(current().preview).toBe(edited);
  await act(async () => current().apply('replace'));
  expect(current().error).toBe('invalid-request');
  await act(async () => current().apply('variant'));
  expect(current().accepted).toBe(true);
  expect(runReviewTextJob).toHaveBeenCalledOnce();
  expect(useVideoEditorStore.getState().projectHistory.past).toHaveLength(1);
  expect(durable.textDocuments![0]!.document.fragments).toHaveLength(2);
  expect(durable.textDocuments![0]!.document.fragments[1]!.text).toBe('Edited text');
});
it('refuses edits during generation and an occupied history lease', async () => {
  await mount();
  const reply = gate<ReviewTextProposal>();
  vi.mocked(runReviewTextJob).mockImplementationOnce(async () => {
    requestEntered.release();
    return reply.promise;
  });
  await generate();
  expect(current().running).toBe(true);
  act(() => {
    current().open('other', ['unknown'], false);
    current().setOptions((value) => ({ ...value, prompt: 'Changed' }));
    current().setModelId('unknown');
    current().close();
    current().start();
  });
  expect(current().options.prompt).toBe('Make clear');
  expect(current().target?.documentId).toBe('document');
  expect(current().modelId).toBe('model');
  await act(async () => reply.release(structuredClone(response)));
  const lease = useVideoEditorStore.getState().beginProjectHistoryTransaction();
  await act(async () => current().apply('replace'));
  expect(current().error).toBe('stale');
  expect(current().preview?.proposal).toEqual(response);
  expect(runReviewTextJob).toHaveBeenCalledOnce();
  expect(
    useVideoEditorStore.getState().project!.textDocuments![0]!.document.fragments[0]!.text
  ).toBe('Original text');
  if (lease) act(() => useVideoEditorStore.getState().endProjectHistoryTransaction(lease));
});
it('seals history before waiting for Save so unrelated edits remain separate', async () => {
  await mount();
  await generate();
  const saving = gate<void>();
  const entered = gate<void>();
  vi.mocked(waitForVideoEditorSave).mockImplementationOnce(async () => {
    entered.release();
    await saving.promise;
    durable = structuredClone(useVideoEditorStore.getState().project!);
    revision++;
  });
  await act(async () => {
    current().apply('replace');
    await entered.promise;
  });
  expect(useVideoEditorStore.getState().projectHistory.transaction).toBeNull();
  act(() =>
    useVideoEditorStore.getState().updateProject((project) => ({ ...project, name: 'Other edit' }))
  );
  expect(useVideoEditorStore.getState().projectHistory.past).toHaveLength(2);
  await act(async () => saving.release());
  expect(current().accepted).toBe(true);
});
it('cancels promptly and an old completion cannot clear or publish into a successor', async () => {
  await mount();
  const first = gate<ReviewTextProposal>();
  const second = gate<ReviewTextProposal>();
  vi.mocked(runReviewTextJob).mockImplementationOnce(async () => {
    requestEntered.release();
    return first.promise;
  });
  await generate();
  act(() => current().cancel());
  expect(current().running).toBe(false);
  requestEntered = gate();
  vi.mocked(runReviewTextJob).mockImplementationOnce(async () => {
    requestEntered.release();
    return second.promise;
  });
  await generate();
  await act(async () =>
    first.release({ version: 1, fragments: [{ fromIds: ['phrase'], text: 'Old' }] })
  );
  expect(current().running).toBe(true);
  expect(current().preview).toBeNull();
  await act(async () => second.release(structuredClone(response)));
  expect(current().running).toBe(false);
  expect(current().preview?.proposal).toEqual(response);
});
it.each(['replacement', 'recreation', 'unmount'] as const)(
  'does not publish late work after project %s',
  async (change) => {
    await mount();
    const reply = gate<ReviewTextProposal>();
    let signal: AbortSignal | undefined;
    vi.mocked(runReviewTextJob).mockImplementationOnce(async (_start, capturedSignal) => {
      signal = capturedSignal;
      requestEntered.release();
      return reply.promise;
    });
    await generate();
    await act(async () => {
      if (change === 'unmount') root.render(null);
      else {
        const next =
          change === 'replacement'
            ? createEmptyVideoProject('Other')
            : { ...useVideoEditorStore.getState().project!, createdAt: durable.createdAt + 1 };
        useVideoEditorStore.getState().setProject(next);
      }
    });
    expect(signal?.aborted).toBe(true);
    await act(async () => reply.release(structuredClone(response)));
    if (change !== 'unmount') {
      expect(current().preview).toBeNull();
      expect(current().target).toBeNull();
      expect(current().accepted).toBe(false);
    }
    expect(useVideoEditorStore.getState().projectHistory.past).toHaveLength(0);
  }
);
it('refuses changes during generation and refuses resurrection after Undo before Save retry', async () => {
  await mount();
  vi.mocked(runReviewTextJob).mockImplementationOnce(async () => {
    useVideoEditorStore
      .getState()
      .updateProject((project) => ({ ...project, name: 'Concurrent edit' }));
    requestEntered.release();
    return structuredClone(response);
  });
  await generate();
  expect(current().error).toBe('stale');
  expect(current().preview).toBeNull();
  await generate();
  vi.mocked(waitForVideoEditorSave).mockRejectedValueOnce(new Error('Save failed'));
  await act(async () => current().apply('variant'));
  act(() => useVideoEditorStore.getState().undoProject());
  await act(async () => current().apply('variant'));
  expect(current().error).toBe('stale');
  expect(
    useVideoEditorStore.getState().project!.textDocuments![0]!.document.fragments
  ).toHaveLength(1);
  expect(runReviewTextJob).toHaveBeenCalledTimes(2);
});
it('admits the first catalog from a remembered child section and ignores unknown choices', async () => {
  await act(async () => root.render(<Harness autoLoad />));
  expect(current().catalog?.models.map((model) => model.id)).toEqual(['model']);
  expect(current().modelId).toBe('model');
  act(() => current().setModelId('speech'));
  expect(current().modelId).toBe('model');
  expect(rememberAIScenarioModelSelection).not.toHaveBeenCalled();
  expect(runReviewTextJob).not.toHaveBeenCalled();
});
it('keeps the latest catalog response and retains it after failed refresh', async () => {
  await mount();
  const old = gate<SelectionContext>();
  vi.mocked(requestAIScenarioModelSelection).mockImplementationOnce(() => old.promise);
  let first: Promise<void> | undefined;
  act(() => {
    first = current().loadModels();
  });
  const latest = {
    ...catalog,
    models: [...catalog.models, { ...catalog.models[0]!, id: 'latest' }],
  };
  vi.mocked(requestAIScenarioModelSelection).mockResolvedValueOnce(latest);
  await act(async () => current().loadModels());
  await act(async () => {
    old.release(catalog);
    await first;
  });
  expect(current().catalog).toEqual(latest);
  vi.mocked(requestAIScenarioModelSelection).mockRejectedValueOnce(new Error('Private details'));
  await act(async () => current().loadModels());
  expect(current().catalog).toEqual(latest);
  expect(current().catalogError).toBe(true);
  expect(current().error).toBeNull();
});

it.each(['catalog', 'preference', 'destination'] as const)(
  'sends no video generation request or project edit after %s preparation refusal',
  async (failure) => {
    await mount();
    const before = useVideoEditorStore.getState().project;
    expect(rememberAIScenarioModelSelection).not.toHaveBeenCalled();
    if (failure === 'catalog')
      vi.mocked(requestAIScenarioModelSelection).mockRejectedValueOnce(new Error('Unavailable'));
    if (failure === 'preference')
      vi.mocked(rememberAIScenarioModelSelection).mockRejectedValueOnce(new Error('Unavailable'));
    if (failure === 'destination') {
      const next = structuredClone(catalog);
      next.providers[0]!.destinationBinding = `sha256:${'b'.repeat(64)}`;
      vi.mocked(requestAIScenarioModelSelection).mockResolvedValueOnce(next);
    }
    await act(async () => current().start());
    expect(runReviewTextJob).not.toHaveBeenCalled();
    expect(useVideoEditorStore.getState().project).toBe(before);
    expect(current().preview).toBeNull();
    expect(current().running).toBe(false);
    expect(current().catalogError).toBe(failure === 'catalog');
    expect(current().selectionFailed).toBe(failure === 'preference');
    expect(current().selectionUnavailable).toBe(failure === 'destination');
  }
);
