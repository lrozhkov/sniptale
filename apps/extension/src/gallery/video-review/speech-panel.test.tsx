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
import { translate } from '../../platform/i18n';
import { createReviewSpeechEditGuard } from './speech-edit-guard';
const mocks = vi.hoisted(() => ({
  prepare: vi.fn(),
  run: vi.fn(),
  apply: vi.fn(),
  wasApplied: vi.fn(),
}));
vi.mock('../../workflows/video-review/recognition', () => ({
  prepareReviewRecognition: mocks.prepare,
  runReviewRecognition: mocks.run,
  applyReviewRecognition: mocks.apply,
  reviewRecognitionWasApplied: mocks.wasApplied,
}));
vi.mock('../../workflows/ai-settings/query', () => ({
  requestAIModelSelectionBootstrap: async () => ({
    models: [{ id: 'model', displayName: 'Model', providerId: 'provider' }],
    providers: [{ id: 'provider', name: 'Provider' }],
    defaultModelId: 'model',
    chromeAiEnabled: false,
    globalSystemPrompt: '',
  }),
}));
vi.mock('../../features/ai/model-selector', () => ({
  AIModelSelector: (props: {
    selectedModelId: string | null;
    onSelect(id: string | null): void;
  }) => (
    <select
      aria-label="configured model"
      value={props.selectedModelId ?? ''}
      onChange={(event) => props.onSelect(event.target.value)}
    >
      <option value="model">Model</option>
    </select>
  ),
}));
vi.mock('@sniptale/ui/product-form-controls', async (original) => ({
  ...(await original<typeof import('@sniptale/ui/product-form-controls')>()),
  ProductSelect: (props: {
    'aria-label'?: string;
    value: string;
    disabled?: boolean;
    options: Array<{ value: string; label: string }>;
    onChange(value: string): void;
  }) => (
    <select
      aria-label={props['aria-label']}
      value={props.value}
      disabled={props.disabled}
      onChange={(event) => props.onChange(event.target.value)}
    >
      {props.options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}));
import { ReviewSpeechPanel } from './speech-panel';
let root: Root | undefined;
let host: HTMLDivElement;
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  host.remove();
  vi.unstubAllGlobals();
});
async function mount(
  withRelated = false,
  originalSelection?: { start: number; end: number },
  onEnableAdvanced?: () => void
) {
  const advanced = createQuickEditAdvancedState();
  const clip = {
    id: 'clip',
    assetId: 'project-asset:audio',
    timelineStart: 0,
    sourceOffset: 0,
    duration: 5,
    volume: 1,
    muted: false,
    fadeIn: 0,
    fadeOut: 0,
  };
  advanced.audio.voiceover = [clip];
  if (withRelated) {
    let related = createReviewTextDocument();
    for (const id of ['authored', 'recognized', 'unrelated']) {
      const added = addReviewTextFragment(related, { id, text: id + ' text', start: 0, end: 2 });
      if (!added.ok) throw new Error('fixture');
      related = added.document;
    }
    advanced.text = {
      ...related,
      fragments: related.fragments.map((fragment) =>
        fragment.id === 'recognized'
          ? { ...fragment, origin: { kind: 'voiceover', clipId: 'clip', start: 0, end: 2 } }
          : fragment
      ),
    };
    advanced.audio.voiceover = [
      {
        ...clip,
        textSnapshot: {
          kind: 'ai',
          textId: 'authored',
          text: 'authored text',
          revision: 0,
          timingRevision: 0,
          start: 0,
          end: 2,
          timeDomain: 'result',
        },
      },
    ];
  }
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
  const job: ReviewRecognitionJob = {
    id: 'job',
    identity: 'basis',
    workspaceId: 'video',
    workspaceRevision: 1,
    geometry: 'geometry',
    documentBasis: 'document',
    target: originalSelection ? { kind: 'original' } : { kind: 'voiceover', clipId: 'clip' },
    modelId: 'model',
    approvedProviderId: 'provider',
    grouping: 'sentences-pauses',
    source: clip.assetId,
    relatedIds: ['related'],
    ranges: [{ start: 0, end: 5 }],
    chunks: [{ range: 0, start: 0, end: 5 }],
  };
  let document = createReviewTextDocument();
  for (const id of ['first', 'second']) {
    const added = addReviewTextFragment(document, {
      id,
      text: id + ' phrase',
      start: id === 'first' ? 0 : 2,
      end: id === 'first' ? 2 : 4,
    });
    if (!added.ok) throw new Error('fixture');
    document = added.document;
  }
  const proposal: ReviewRecognitionProposal = { job, document };
  mocks.prepare.mockResolvedValue(job);
  mocks.run.mockResolvedValue(proposal);
  mocks.apply.mockResolvedValue(undefined);
  mocks.wasApplied.mockResolvedValue(false);
  const onSelectText = vi.fn();
  const render = async (selection?: { start: number; end: number }) =>
    act(async () =>
      root!.render(
        <ReviewSpeechPanel
          session={session}
          target={job.target}
          original={
            job.target.kind === 'original'
              ? { file: new Blob(['source']), sourceAssetId: 'source' }
              : undefined
          }
          selection={selection}
          beforeAction={(action) => action()}
          flushAdvanced={async () => undefined}
          registerSpeechFlush={guard.register}
          onSelectText={onSelectText}
          {...(onEnableAdvanced ? { onEnableAdvanced } : {})}
          sound={(applying) => (
            <button disabled={applying} data-ui="gallery.videoReview.audioInspector">
              Sound controls
            </button>
          )}
        />
      )
    );
  await render(originalSelection);
  return { session, proposal, onSelectText, render };
}
function button(label: string) {
  const found = Array.from(host.querySelectorAll('button')).find(
    (node) => node.getAttribute('aria-label') === label
  );
  if (!found) throw new Error('Missing button: ' + label);
  return found;
}
async function click(label: string) {
  await act(async () => button(label).click());
}
it('keeps selected-only intent and blocks consent when the ruler interval disappears', async () => {
  const { render } = await mount(false, { start: 1, end: 4 });
  await click(translate('gallery.videoReview.recognitionSelection'));
  await click(translate('gallery.videoReview.recognitionStart'));
  expect(button(translate('gallery.videoReview.speechConsentContinue')).disabled).toBe(false);
  await render();
  expect(
    button(translate('gallery.videoReview.recognitionSelection')).getAttribute('aria-checked')
  ).toBe('true');
  expect(button(translate('gallery.videoReview.speechConsentContinue')).disabled).toBe(true);
  expect(host.textContent).toContain(translate('gallery.videoReview.recognitionSelectionMissing'));
  expect(mocks.prepare).not.toHaveBeenCalled();
  expect(mocks.run).not.toHaveBeenCalled();
  await click(translate('common.actions.cancel'));
  await click(translate('gallery.videoReview.recognitionSelection'));
  await click(translate('gallery.videoReview.recognitionStart'));
  await click(translate('gallery.videoReview.speechConsentContinue'));
  expect(mocks.prepare).toHaveBeenCalledOnce();
  expect(mocks.prepare.mock.calls[0]?.[5]).not.toHaveProperty('selection');
});
async function recognize() {
  await click(translate('gallery.videoReview.recognitionStart'));
  await click(translate('gallery.videoReview.speechConsentContinue'));
}
it('offers advanced editing after accepted source recognition as an explicit action', async () => {
  const enable = vi.fn();
  await mount(false, { start: 0, end: 1 }, enable);
  await recognize();
  expect(
    host.querySelector('[aria-label="' + translate('gallery.videoReview.advancedEditing') + '"]')
  ).toBeNull();
  await click(translate('gallery.videoReview.recognitionApply'));
  expect(enable).not.toHaveBeenCalled();
  await click(translate('gallery.videoReview.advancedEditing'));
  expect(enable).toHaveBeenCalledOnce();
});
it('disables selected clip sound controls only while Apply is in flight', async () => {
  await mount();
  await recognize();
  const sound = () =>
    host.querySelector<HTMLButtonElement>('[data-ui="gallery.videoReview.audioInspector"]')!;
  expect(sound().disabled).toBe(false);
  let release!: () => void;
  mocks.apply.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      })
  );
  await click(translate('gallery.videoReview.recognitionApply'));
  expect(sound().disabled).toBe(true);
  await act(async () => release());
  expect(sound().disabled).toBe(false);
});
it('keeps ordinary audio controls and one compact model form without requesting speech on mount', async () => {
  await mount();
  expect(host.querySelector('[data-ui="gallery.videoReview.audioInspector"]')).not.toBeNull();
  expect(button(translate('gallery.videoReview.recognitionStart'))).toBeDefined();
  expect(host.querySelector('input[type="range"]')).toBeNull();
  expect(host.querySelectorAll('[role="dialog"]')).toHaveLength(0);
  expect(mocks.prepare).not.toHaveBeenCalled();
  expect(host.textContent).toContain(translate('gallery.videoReview.recognitionPauseHint'));
  expect(host.textContent).not.toContain(translate('gallery.videoReview.speechSynthesisModel'));
});
it('requires provider consent in the inspector and lets the user cancel before egress', async () => {
  await mount();
  await click(translate('gallery.videoReview.recognitionStart'));
  expect(host.textContent).toContain('Provider');
  expect(host.textContent).toContain('Model');
  expect(mocks.prepare).not.toHaveBeenCalled();
  await click(translate('common.actions.cancel'));
  expect(mocks.prepare).not.toHaveBeenCalled();
  await recognize();
  expect(mocks.prepare.mock.calls[0]?.[3]).toBe('provider');
  expect(host.querySelector('[data-ui="gallery.videoReview.recognitionResult"]')).not.toBeNull();
  expect(mocks.apply).not.toHaveBeenCalled();
  expect(host.textContent).toContain(translate('gallery.videoReview.recognitionApproximate'));
});
it('uses one expandable phrase and allows all phrases to be collapsed', async () => {
  await mount();
  await recognize();
  const rows = () =>
    Array.from(host.querySelectorAll('[data-ui="gallery.videoReview.textPhrase"]'));
  const toggle = (index: number) => {
    const node = rows()[index]?.querySelector('button[aria-expanded]');
    if (!(node instanceof HTMLButtonElement)) throw new Error('Missing phrase toggle');
    node.click();
  };
  await act(async () => toggle(0));
  expect(host.querySelectorAll('textarea')).toHaveLength(1);
  await act(async () => toggle(1));
  expect(host.querySelectorAll('textarea')).toHaveLength(1);
  expect(host.querySelector('textarea')?.value).toBe('second phrase');
  await act(async () => toggle(1));
  expect(host.querySelectorAll('textarea')).toHaveLength(0);
});
it('applies only on explicit acceptance and enables another recognition after acceptance', async () => {
  const { proposal } = await mount();
  await recognize();
  expect(mocks.apply).not.toHaveBeenCalled();
  mocks.apply.mockImplementationOnce(async () => {
    const before = createQuickEditAdvancedState();
    proposal.receipt = {
      id: 'op',
      at: 1,
      target: 'advancedContent',
      before,
      after: { ...before, text: proposal.document },
    };
  });
  await click(translate('gallery.videoReview.recognitionApply'));
  expect(mocks.apply.mock.calls[0]?.[3]).toBe('add');
  expect(host.textContent).toContain(translate('gallery.videoReview.recognitionAdded'));
  expect(button(translate('gallery.videoReview.recognitionStart')).disabled).toBe(false);
});
it('requires an explicit replacement choice and preserves a failed Apply result for retry', async () => {
  const { proposal } = await mount();
  await recognize();
  const mode = host.querySelector(
    'select[aria-label="' + translate('gallery.videoReview.recognitionMode') + '"]'
  );
  if (!(mode instanceof HTMLSelectElement)) throw new Error('Missing application mode');
  await act(async () => {
    mode.value = 'replace';
    mode.dispatchEvent(new Event('change', { bubbles: true }));
  });
  expect(host.textContent).toContain(translate('gallery.videoReview.recognitionReplaceHint'));
  mocks.apply.mockImplementationOnce(async () => {
    const before = createQuickEditAdvancedState();
    proposal.receipt = {
      id: 'op',
      at: 1,
      target: 'advancedContent',
      before,
      after: { ...before, text: proposal.document },
    };
    throw new Error('lost acknowledgement');
  });
  await click(translate('gallery.videoReview.recognitionApply'));
  expect(mocks.apply.mock.calls[0]?.[3]).toBe('replace');
  expect(host.querySelectorAll('[data-ui="gallery.videoReview.textPhrase"]')).toHaveLength(2);
  expect(button(translate('gallery.videoReview.recognitionApply')).disabled).toBe(false);
  expect(button(translate('gallery.videoReview.recognitionDiscard')).disabled).toBe(true);
  expect(host.textContent).toContain(translate('gallery.videoReview.recognitionReceiptHint'));
});
it('discards the disposable result without modifying canonical text', async () => {
  const { session } = await mount();
  await recognize();
  await click(translate('gallery.videoReview.recognitionDiscard'));
  expect(host.querySelector('[data-ui="gallery.videoReview.recognitionResult"]')).toBeNull();
  expect(session.getSnapshot().document.advancedContent.text).toBeUndefined();
  expect(mocks.apply).not.toHaveBeenCalled();
});
it('links both authored snapshots and recognized origins to individual canonical text', async () => {
  const { onSelectText } = await mount(true);
  expect(button('authored text')).toBeDefined();
  expect(button('recognized text')).toBeDefined();
  expect(host.querySelector('button[aria-label="unrelated text"]')).toBeNull();
  await click('recognized text');
  expect(onSelectText).toHaveBeenCalledWith('recognized');
  expect(host.querySelector('[data-ui="gallery.videoReview.textDocument"]')).toBeNull();
});

it('discloses original audio including cuts for complete and selected requests', async () => {
  await mount(false, { start: 2, end: 4 });
  expect(host.textContent).toContain('включая вырезанные участки');
  expect(host.textContent).not.toContain('без вырезанных участков');
  await act(async () => button(translate('gallery.videoReview.recognitionSelection')).click());
  expect(host.textContent).toContain('включая вырезанные участки');
  expect(host.textContent).not.toContain('без вырезанных участков');
});
it('preserves the retained-audio disclosure for voice clips', async () => {
  await mount();
  expect(host.textContent).toContain('без вырезанных участков');
  expect(host.textContent).not.toContain('включая вырезанные участки');
});
