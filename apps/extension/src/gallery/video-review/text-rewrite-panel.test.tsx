// @vitest-environment jsdom
import { act } from 'react';
import { InspectorLayout } from '../../ui/compact-inspector-controls/layout';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ReviewTextRewriteForm } from './text-rewrite-panel';
import { createVideoReviewSession } from '../../workflows/video-review/session';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
import type { ReviewTextVoiceAccess } from './use-text-voice';
import type { ReviewTextRewritePreview } from '../../workflows/video-review/text-rewrite';

const catalog = vi.hoisted(() => vi.fn());
const jobs = vi.hoisted(() => ({ generate: vi.fn(), apply: vi.fn(), wasApplied: vi.fn() }));
vi.mock('../../workflows/video-review/text-rewrite', async (original) => ({
  ...(await original<typeof import('../../workflows/video-review/text-rewrite')>()),
  generateReviewTextRewrite: jobs.generate,
  applyReviewTextRewritePreview: jobs.apply,
  reviewTextRewriteWasApplied: jobs.wasApplied,
}));
vi.mock('../../workflows/ai-settings/query', () => ({ requestAIModelSelectionBootstrap: catalog }));
vi.mock('../../platform/i18n', async (original) => ({
  ...(await original<typeof import('../../platform/i18n')>()),
  translate: (key: string) => key,
}));
let host: HTMLDivElement;
let root: Root;
function access(withSecondSource = false): ReviewTextVoiceAccess {
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
  if (withSecondSource)
    advanced.text.fragments.push({
      ...advanced.text.fragments[0]!,
      id: 'second',
      text: 'Other words',
      start: 3,
      end: 4,
    });
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
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  jobs.generate.mockImplementation(async (_session, preview: ReviewTextRewritePreview) => ({
    ...preview,
    proposal: {
      version: 1,
      fragments: Array.from({ length: preview.context.resegment ? 51 : 1 }, (_, index) => ({
        fromIds: ['text'],
        text: `New ${index}`,
        ...(preview.context.changeIntervals ? { start: 1, end: 2 } : {}),
      })),
    },
  }));
  jobs.wasApplied.mockResolvedValue(false);
  jobs.apply.mockResolvedValue(undefined);
  catalog.mockResolvedValue({
    chromeAiEnabled: false,
    defaultModelId: 'model',
    globalSystemPrompt: '',
    models: [
      {
        id: 'model',
        providerId: 'provider',
        modelCode: 'code',
        displayName: 'Configured text model',
      },
    ],
    providers: [
      {
        id: 'provider',
        name: 'Disclosed provider',
        connectionType: 'openai-compatible',
        destinationKind: 'external',
        destinationBinding: `sha256:${'a'.repeat(64)}`,
        hasStoredApiKey: true,
        createdAt: 1,
      },
    ],
  });
});

const click = async (label: string) =>
  act(async () => {
    const element = host.querySelector<HTMLButtonElement>(
      `[aria-label="gallery.videoReview.${label}"]`
    );
    if (!element) throw new Error(`Missing ${label}`);
    element.click();
  });
async function fill(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  await act(async () => {
    const prototype =
      element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function mountForm(wholeDocument = false, withSecondSource = false) {
  await act(async () =>
    root.render(
      <InspectorLayout>
        <ReviewTextRewriteForm
          access={access(withSecondSource)}
          ids={withSecondSource ? ['text', 'second'] : ['text']}
          wholeDocument={wholeDocument}
          onClose={vi.fn()}
        />
      </InspectorLayout>
    )
  );
  await fill(host.querySelector('textarea')!, 'Shorten');
}

it('lets the user correct, add and remove captured phrase mappings before Apply', async () => {
  jobs.generate.mockImplementation(async (_session, preview: ReviewTextRewritePreview) => ({
    ...preview,
    proposal: {
      version: 1,
      fragments: [
        { fromIds: ['second'], text: 'New first', start: 1, end: 2 },
        { fromIds: ['text'], text: 'New second', start: 3, end: 4 },
      ],
    },
  }));
  await mountForm(true, true);
  await click('textRewriteMode');
  await act(async () =>
    [...document.querySelectorAll<HTMLElement>('[role="option"]')]
      .find((entry) => entry.textContent?.includes('gallery.videoReview.textRewriteScript'))!
      .click()
  );
  await click('textRewriteTiming');
  await click('textRewriteStructure');
  await click('textRewriteStart');
  const choose = async (key: string, row: number, text: string) => {
    await act(async () =>
      host
        .querySelectorAll<HTMLButtonElement>(`[aria-label="gallery.videoReview.${key}"]`)
        [row]!.click()
    );
    await act(async () =>
      [...document.querySelectorAll<HTMLElement>('[role="option"]')]
        .find((entry) => entry.textContent?.includes(text))!
        .click()
    );
  };
  await choose('textRewriteSource', 0, 'Words');
  await choose('textRewriteSource', 1, 'Other words');
  await choose('textRewriteSourceAdd', 0, 'Other words');
  await act(async () =>
    host
      .querySelectorAll<HTMLButtonElement>(
        '[aria-label="gallery.videoReview.textRewriteSourceRemove"]'
      )[1]!
      .click()
  );
  await click('textRewriteReplace');
  expect(
    jobs.apply.mock.calls[0]?.[1].proposal.fragments.map(
      (entry: { fromIds: string[] }) => entry.fromIds
    )
  ).toEqual([['text'], ['second']]);
});

it('requires script permissions, pages and edits the proposal, and creates a hidden variant', async () => {
  await mountForm(true);
  await click('textRewriteMode');
  const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find((entry) =>
    entry.textContent?.includes('gallery.videoReview.textRewriteScript')
  );
  expect(option).toBeDefined();
  await act(async () => option!.click());
  await click('textRewriteTiming');
  await click('textRewriteStructure');
  await click('textRewriteStart');
  expect(host.querySelectorAll('textarea')).toHaveLength(51);
  expect(host.textContent).toContain('gallery.videoReview.textRewriteTakeHint');
  await click('textFragmentMore');
  expect(host.querySelectorAll('textarea')).toHaveLength(52);
  const result = host.querySelector<HTMLTextAreaElement>(
    'textarea[aria-label="gallery.videoReview.textRewriteResult"]'
  )!;
  await fill(result, 'Manual revision');
  await click('textRewriteVariant');
  expect(jobs.apply.mock.calls[0]?.[1].proposal.fragments[0].text).toBe('Manual revision');
  expect(jobs.apply.mock.calls[0]?.[3]).toBe('variant');
  expect(host.textContent).toContain('gallery.videoReview.textRewriteApplied');
  await click('recognitionDiscard');
  expect(host.querySelectorAll('textarea')).toHaveLength(1);
});

it('keeps the instruction and editable preview after request and Apply failures', async () => {
  jobs.generate.mockRejectedValueOnce(new Error('stale'));
  await mountForm();
  await click('textRewriteStart');
  expect(host.querySelector('[role="alert"]')?.textContent).toBe(
    'gallery.videoReview.speechChanged'
  );
  expect(host.querySelector('textarea')?.value).toBe('Shorten');
  await click('textRewriteStart');
  jobs.apply.mockRejectedValueOnce(new Error('write failed'));
  await click('textRewriteReplace');
  expect(host.querySelector('[role="alert"]')?.textContent).toBe(
    'gallery.videoReview.speechFailed'
  );
  expect(host.querySelectorAll('textarea')).toHaveLength(2);
  await click('textRewriteReplace');
  expect(jobs.apply).toHaveBeenCalledTimes(2);
  expect(host.textContent).toContain('gallery.videoReview.textRewriteApplied');
});

it('cancels waiting work without publishing its late preview and reloads a failed model query', async () => {
  catalog.mockRejectedValueOnce(new Error('offline'));
  await act(async () =>
    root.render(
      <ReviewTextRewriteForm
        access={access()}
        ids={['text']}
        wholeDocument={false}
        onClose={vi.fn()}
      />
    )
  );
  await click('speechReloadModels');
  await fill(host.querySelector('textarea')!, 'Shorten');
  let resolve!: (preview: ReviewTextRewritePreview) => void;
  jobs.generate.mockImplementationOnce(
    () =>
      new Promise<ReviewTextRewritePreview>((done) => {
        resolve = done;
      })
  );
  await click('textRewriteStart');
  expect(host.querySelector('[role="status"]')).not.toBeNull();
  await act(async () =>
    host.querySelector<HTMLButtonElement>('[aria-label="common.actions.cancel"]')!.click()
  );
  await act(async () =>
    resolve({
      ...jobs.generate.mock.calls[0]![1],
      proposal: { version: 1, fragments: [{ fromIds: ['text'], text: 'Late' }] },
    })
  );
  expect(host.querySelectorAll('textarea')).toHaveLength(1);
  expect(host.querySelector('[role="alert"]')).toBeNull();
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

it('names the prompt, discloses the recipient, and disables Start before a valid context', async () => {
  const source = access();
  await act(async () =>
    root.render(
      <ReviewTextRewriteForm
        access={source}
        ids={['text']}
        wholeDocument={false}
        onClose={vi.fn()}
      />
    )
  );
  expect(
    host.querySelector('textarea[aria-label="gallery.videoReview.textRewritePrompt"]')
  ).not.toBeNull();
  expect(host.textContent).toContain('Disclosed provider');
  expect(host.querySelector('[role=switch]')?.getAttribute('aria-checked')).toBe('false');
  expect(host.querySelector('[aria-label="gallery.videoReview.textRewriteStructure"]')).toBeNull();
  const start = host.querySelector<HTMLButtonElement>(
    'button[aria-label="gallery.videoReview.textRewriteStart"]'
  );
  expect(start?.disabled).toBe(true);
  expect(source.beforeRequest).not.toHaveBeenCalled();
  expect(host.querySelector('dialog')).toBeNull();
});

it('clears the rewrite prompt draft without submitting or changing the source document', async () => {
  await mountForm();
  const prompt = host.querySelector<HTMLTextAreaElement>(
    'textarea[aria-label="gallery.videoReview.textRewritePrompt"]'
  )!;
  await act(async () =>
    prompt
      .closest('.sniptale-parameter-row')!
      .querySelector<HTMLButtonElement>('.sniptale-field-clear')!
      .click()
  );
  expect(prompt.value).toBe('');
  expect(document.activeElement).toBe(prompt);
  expect(jobs.generate).not.toHaveBeenCalled();
  expect(jobs.apply).not.toHaveBeenCalled();
  await fill(prompt, 'Shorten again');
  await click('textRewriteStart');
  expect(jobs.generate).toHaveBeenCalledTimes(1);
  expect(jobs.generate.mock.calls[0]?.[1].context.prompt).toBe('Shorten again');
});

it('uses a timing switch and keeps the outbound notice without single-item counters or raw context JSON', async () => {
  await mountForm();
  expect(
    host.querySelector('[role="switch"][aria-label="gallery.videoReview.textRewriteTiming"]')
  ).not.toBeNull();
  expect(host.textContent).not.toContain('gallery.videoReview.textRewriteSelectedScope');
  expect(host.textContent).not.toContain('gallery.videoReview.textRewriteDestination');
  expect(host.textContent).toContain('gallery.videoReview.textRewriteDisclosure');
  expect(host.textContent).not.toContain('gallery.videoReview.textRewriteOutbound');
  expect(jobs.generate).not.toHaveBeenCalled();
});

it('offers explicit catalog retry after successful empty discovery without selecting a replacement', async () => {
  const available = await catalog();
  catalog.mockResolvedValueOnce({ ...available, models: [] });
  await mountForm();
  const retry = host.querySelector<HTMLButtonElement>(
    '[aria-label="gallery.videoReview.speechReloadModels"]'
  );
  expect(retry).not.toBeNull();
  expect(jobs.generate).not.toHaveBeenCalled();
  await act(async () => retry!.click());
  expect(catalog).toHaveBeenCalledTimes(3);
  expect(host.querySelector('[aria-label="gallery.videoReview.speechReloadModels"]')).toBeNull();
  const picker = host.querySelector<HTMLButtonElement>(
    'button[data-invalid="true"][aria-expanded]'
  );
  expect(picker).not.toBeNull();
  vi.spyOn(picker!.parentElement!, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(100, 100, 280, 32)
  );
  await act(async () => picker!.click());
  expect(document.body.textContent).toContain('Configured text model');
  expect(jobs.generate).not.toHaveBeenCalled();
});

it.each(['ru', 'en'] as const)(
  'discloses metadata-only history in the %s rewrite notice',
  async (locale) => {
    const { translate } =
      await vi.importActual<typeof import('../../platform/i18n')>('../../platform/i18n');
    const notice = translate('gallery.videoReview.textRewriteDisclosure', locale);
    expect(notice).toContain(
      locale === 'ru'
        ? 'В истории AI сохраняются только модель, время и статус запроса.'
        : 'AI history stores only model, time and request status.'
    );
  }
);
