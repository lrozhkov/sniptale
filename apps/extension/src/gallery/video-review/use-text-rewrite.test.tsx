// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useReviewTextRewrite } from './use-text-rewrite';
import { createVideoReviewSession } from '../../workflows/video-review/session';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
import type { ReviewTextRewritePreview } from '../../workflows/video-review/text-rewrite';
import type { ReviewTextVoiceAccess } from './use-text-voice';

const mocks = vi.hoisted(() => ({
  catalog: vi.fn(),
  generate: vi.fn(),
  apply: vi.fn(),
  wasApplied: vi.fn(),
}));
vi.mock('../../workflows/ai-settings/query', () => ({
  requestAIModelSelectionBootstrap: mocks.catalog,
}));
vi.mock('../../workflows/video-review/text-rewrite', async (original) => ({
  ...(await original<typeof import('../../workflows/video-review/text-rewrite')>()),
  generateReviewTextRewrite: mocks.generate,
  applyReviewTextRewritePreview: mocks.apply,
  reviewTextRewriteWasApplied: mocks.wasApplied,
}));
let host: HTMLDivElement;
let root: Root;
let operation: ReturnType<typeof useReviewTextRewrite>;
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function access(): ReviewTextVoiceAccess {
  const advanced = createQuickEditAdvancedState();
  advanced.text = {
    version: 1,
    fragments: [
      {
        id: 'text',
        text: 'Words',
        originalText: '',
        start: 1,
        end: 2,
        timeDomain: 'result',
        revision: 0,
        timingRevision: 0,
        alignment: 'manual',
        showInVideo: true,
      },
    ],
  };
  return {
    session: createVideoReviewSession({
      workspace: {
        aggregateId: 'video',
        sourceAssetId: 'source',
        formatVersion: 1,
        revision: 1,
        source: { duration: 10, width: 640, height: 360, size: 5, mimeType: 'video/webm' },
        advanced,
        history: [],
        cursor: 0,
        createdAt: 1,
        updatedAt: 1,
      },
      draft: null,
    }),
    beforeRequest: vi.fn(async () => undefined),
  };
}
function Fixture({ source }: { source: ReviewTextVoiceAccess }) {
  operation = useReviewTextRewrite({ access: source, ids: ['text'], wholeDocument: false });
  return null;
}
async function mount(source = access()) {
  await act(async () => root.render(<Fixture source={source} />));
  await act(async () => operation.setOptions((current) => ({ ...current, prompt: 'Shorten' })));
  return source;
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  mocks.catalog.mockResolvedValue({
    chromeAiEnabled: false,
    defaultModelId: 'model',
    globalSystemPrompt: '',
    models: [{ id: 'model', providerId: 'provider', displayName: 'Model', modelCode: 'code' }],
    providers: [
      {
        id: 'provider',
        name: 'Provider',
        hasStoredApiKey: true,
        createdAt: 1,
        connectionType: 'openai-compatible',
        destinationKind: 'external',
        destinationBinding: `sha256:${'a'.repeat(64)}`,
      },
    ],
  });
  mocks.generate.mockImplementation(async (_session, captured: ReviewTextRewritePreview) => ({
    ...captured,
    proposal: { version: 1, fragments: [{ fromIds: ['text'], text: 'Edited' }] },
  }));
  mocks.apply.mockResolvedValue(undefined);
  mocks.wasApplied.mockResolvedValue(false);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('inline text rewrite operation lifetime', () => {
  it('loads only connected text models, freezes the disclosure and owns one request at a time', async () => {
    const source = await mount();
    expect(mocks.catalog).toHaveBeenCalledExactlyOnceWith('text');
    expect(operation.options.changeIntervals).toBe(false);
    expect(operation.options.resegment).toBe(false);
    expect(operation.disclosure?.context.fragments[0]?.text).toBe('Words');
    await act(async () => {
      operation.start();
      operation.start();
    });
    expect(source.beforeRequest).toHaveBeenCalledOnce();
    expect(mocks.generate).toHaveBeenCalledOnce();
    expect(mocks.generate.mock.calls[0]?.[2]).toEqual({
      modelId: 'model',
      approvedProviderId: 'provider',
      approvedDestination: `sha256:${'a'.repeat(64)}`,
      approvedModelCode: 'code',
    });
    expect(operation.preview?.proposal?.fragments[0]?.text).toBe('Edited');
    expect(operation.running).toBe(false);
  });
  it('cancels preparation before Save/request and aborts an unmounted pending provider flight...', async () => {
    const source = access();
    const pending = deferred<void>();
    source.beforeRequest = vi.fn(() => pending.promise);
    await mount(source);
    await act(async () => operation.start());
    expect(operation.running).toBe(true);
    await act(async () => operation.cancel());
    expect(operation.running).toBe(false);
    await act(async () => pending.resolve());
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(operation.preview).toBeNull();
    expect(operation.error).toBeNull();
    const provider = deferred<ReviewTextRewritePreview>();
    source.beforeRequest = vi.fn(async () => undefined);
    mocks.generate.mockImplementationOnce(() => provider.promise);
    await act(async () => operation.start());
    const signal = mocks.generate.mock.calls[0]?.[3] as AbortSignal;
    const captured = mocks.generate.mock.calls[0]?.[1] as ReviewTextRewritePreview;
    await act(async () => root.unmount());
    expect(signal.aborted).toBe(true);
    await act(async () =>
      provider.resolve({
        ...captured,
        proposal: { version: 1, fragments: [{ fromIds: ['text'], text: 'Late' }] },
      })
    );
    expect(operation.preview).toBeNull();
    root = createRoot(host);
  });
  it('edits a disposable proposal and acknowledges an accepted retry before joining any new buffers', async () => {
    const source = await mount();
    await act(async () => operation.start());
    await act(async () =>
      operation.edit((proposal) => ({
        ...proposal,
        fragments: [{ ...proposal.fragments[0]!, text: 'Manual correction' }],
      }))
    );
    expect(operation.preview?.proposal?.fragments[0]?.text).toBe('Manual correction');
    mocks.wasApplied.mockResolvedValue(true);
    const before = vi.mocked(source.beforeRequest).mock.calls.length;
    await act(async () => operation.apply('replace'));
    expect(source.beforeRequest).toHaveBeenCalledTimes(before);
    expect(mocks.apply).not.toHaveBeenCalled();
    expect(operation.accepted).toBe(true);
    await act(async () => operation.discard());
    expect(operation.preview).toBeNull();
  });
  it('keeps the editable result on an Apply failure and stops elapsed timers on cancellation', async () => {
    await mount();
    await act(async () => operation.start());
    mocks.apply.mockRejectedValueOnce(new Error('stale'));
    await act(async () => operation.apply('replace'));
    expect(operation.error).toBe('stale');
    expect(operation.preview).not.toBeNull();
    await act(async () => operation.discard());
    const pending = deferred<ReviewTextRewritePreview>();
    mocks.generate.mockImplementationOnce(() => pending.promise);
    vi.useFakeTimers();
    await act(async () => operation.start());
    await act(async () => vi.advanceTimersByTimeAsync(1_500));
    expect(operation.elapsed).toBe(1);
    const captured = mocks.generate.mock.calls.at(-1)?.[1] as ReviewTextRewritePreview;
    await act(async () => {
      operation.cancel();
      pending.resolve(captured);
    });
    expect(vi.getTimerCount()).toBe(0);
    expect(operation.running).toBe(false);
    expect(operation.preview).toBeNull();
  });
});

it('keeps its known catalog and choice through delayed refresh and a discovery failure', async () => {
  await mount();
  const previous = operation.catalog!;
  const waiting = deferred<typeof previous>();
  mocks.catalog.mockReturnValueOnce(waiting.promise);
  await act(async () => operation.reloadModels());
  expect(operation.catalog).toBe(previous);
  expect(operation.modelId).toBe('model');
  const refreshed = {
    ...previous,
    defaultModelId: 'new-default',
    models: [
      ...previous.models,
      { ...previous.models[0]!, id: 'new-default', displayName: 'New default' },
    ],
  };
  await act(async () => waiting.resolve(refreshed));
  expect(operation.catalog?.models).toHaveLength(2);
  expect(operation.modelId).toBe('model');
  const known = operation.catalog;
  mocks.catalog.mockRejectedValueOnce(new Error('unavailable'));
  await act(async () => operation.reloadModels());
  expect(operation.catalog).toBe(known);
  expect(operation.modelId).toBe('model');
  expect(operation.error).toBe('model-unavailable');
  expect(mocks.generate).not.toHaveBeenCalled();
});
