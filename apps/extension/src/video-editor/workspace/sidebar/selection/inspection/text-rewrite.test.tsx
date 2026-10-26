// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getVideoProject } from '../../../../../composition/persistence/projects';
import { isCurrentVideoProjectSnapshot } from '../../../../../composition/persistence/projects/revision';
import type { ReviewTextProposal } from '../../../../../contracts/ai/review-text';

import {
  createEmptyVideoProject,
  createVideoProjectAsset,
} from '../../../../../features/video/project/factories/creation';
import { createVideoClipFromAsset } from '../../../../../features/video/project/factories/clip';
import {
  requestAIScenarioModelSelection,
  rememberAIScenarioModelSelection,
} from '../../../../../workflows/ai-settings/query';
import { requestLlmSessionToken } from '../../../../../workflows/ai-session/llm-session';
import { runReviewTextJob } from '../../../../../workflows/video-review/text-rewrite-client';
import { useVideoEditorStore } from '../../../../state/store';
import { waitForVideoEditorSave } from '../../../../runtime/session/save-readiness';
import { useVideoProjectTextRewrite } from '../../../../runtime/session/text-rewrite';
import { InspectProjectTextPanel } from './text';

vi.mock('../../../../../composition/persistence/projects', () => ({ getVideoProject: vi.fn() }));
vi.mock('../../../../../composition/persistence/projects/revision', () => ({
  isCurrentVideoProjectSnapshot: vi.fn(),
}));
vi.mock('../../../../../workflows/ai-settings/query', () => ({
  requestAIScenarioModelSelection: vi.fn(),
  rememberAIScenarioModelSelection: vi.fn(),
}));
vi.mock('../../../../../workflows/ai-session/llm-session', () => ({
  requestLlmSessionToken: vi.fn(),
}));
vi.mock('../../../../../workflows/video-review/text-rewrite-client', () => ({
  runReviewTextJob: vi.fn(),
}));
vi.mock('../../../../runtime/session/save-readiness', async (original) => ({
  ...(await original<typeof import('../../../../runtime/session/save-readiness')>()),
  waitForVideoEditorSave: vi.fn(),
}));
vi.mock('../../../../../platform/i18n', async (original) => ({
  ...(await original<typeof import('../../../../../platform/i18n')>()),
  translate: (key: string) =>
    key === 'gallery.videoReview.textRewriteDestination' ? 'Provider: {provider}' : key,
  useAppLocale: () => 'en',
  getCurrentLocale: () => 'en',
}));

type SelectionContext = Awaited<ReturnType<typeof requestAIScenarioModelSelection>>;
const catalog: SelectionContext = {
  scenario: 'video-text-edit',
  remembered: null,
  resolution: { status: 'initial', modelId: 'model', previousSelection: null, reason: null },
  providers: [
    {
      id: 'provider',
      name: 'Approved provider',
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
let durable: NonNullable<ReturnType<typeof useVideoEditorStore.getState>['project']>;
let revision: number;
let requestEntered: ReturnType<typeof gate<void>>;
function fixture(source: boolean) {
  const project = createEmptyVideoProject('Rewrite');
  project.version = 5;
  project.duration = 2;
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
            originalText: '',
            start: 0,
            end: 2,
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
  if (source) {
    const asset = createVideoProjectAsset(
      'Source',
      'VIDEO',
      { kind: 'project-asset', projectAssetId: 'bytes' },
      {
        width: 640,
        height: 360,
        duration: 4,
        mimeType: 'video/webm',
        size: 1,
        hasAudio: true,
        audioPeaks: null,
      }
    );
    const clip = createVideoClipFromAsset(project.tracks[0]!.id, asset, 640, 360);
    if (clip.type !== 'VIDEO') throw new Error('Missing video');
    project.assets = [asset];
    project.clips = [
      { ...clip, sourceInstanceId: 'instance' },
      { ...clip, id: 'second', sourceInstanceId: 'instance', startTime: 6 },
    ];
    project.duration = 10;
    project.textDocuments[0]!.binding = {
      kind: 'source',
      assetId: asset.id,
      sourceInstanceId: 'instance',
    };
    project.textDocuments[0]!.document.fragments[0]!.timeDomain = 'source';
  }
  return project;
}
function Harness() {
  const project = useVideoEditorStore((state) => state.project)!;
  const rewrite = useVideoProjectTextRewrite(project);
  return <InspectProjectTextPanel project={project} rewrite={rewrite} />;
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  initial = useVideoEditorStore.getState();
  revision = 1;
  requestEntered = gate();
  vi.mocked(requestAIScenarioModelSelection).mockResolvedValue(catalog);
  vi.mocked(rememberAIScenarioModelSelection).mockResolvedValue(undefined);
  vi.mocked(requestLlmSessionToken).mockResolvedValue('token');
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
    if (JSON.stringify(project) !== JSON.stringify(durable)) revision++;
    durable = structuredClone(project);
  });
  vi.mocked(runReviewTextJob).mockImplementation(async (start) => {
    requestEntered.release();
    return {
      version: 1,
      fragments: [
        {
          fromIds: ['phrase'],
          text: 'Suggested text',
          ...(start.context.changeIntervals ? { start: 0.5, end: 1.5 } : {}),
        },
      ],
    };
  });
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
function button(key: string) {
  const label = key.includes('.') ? key : `gallery.videoReview.${key}`;
  const result = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
    (node) => node.getAttribute('aria-label') === label || node.textContent === label
  );
  if (!result) throw new Error(`Missing button: ${label}`);
  return result;
}
async function click(key: string) {
  await act(async () => button(key).click());
}
async function fill(field: HTMLTextAreaElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
      field,
      value
    );
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function mount(source = false) {
  useVideoEditorStore.getState().setProject(fixture(source));
  durable = structuredClone(useVideoEditorStore.getState().project!);
  await act(async () => root.render(<Harness />));
  await click('textViewCards');
  await act(async () =>
    host.querySelector<HTMLButtonElement>('[data-project-text-rewrite="all"]')!.click()
  );
  await fill(host.querySelector('textarea')!, 'Make the text clear');
}
async function generate() {
  await click('textRewriteStart');
  expect(host.querySelector('[role="alert"]')).toBeNull();
  await requestEntered.promise;
  await act(async () => {
    expect(runReviewTextJob).toHaveBeenCalledOnce();
  });
}

function proposalField() {
  return host.querySelector<HTMLTextAreaElement>(
    '[data-ui="video.text-rewrite.proposal"] textarea'
  )!;
}
it('discloses exact repeated source placement and explicit independent project timing before sending', async () => {
  await mount(true);
  expect(host.textContent).toContain('Approved provider');
  const recipient = [...host.querySelectorAll('p')].find(
    (node) => node.textContent === 'Provider: Approved provider'
  )!;
  expect(recipient.closest('details')).toBeNull();
  expect(host.textContent).toContain('videoEditor.sidebar.textRewriteSourceScope');
  expect(host.textContent).toContain('videoEditor.sidebar.textRewritePlacements');
  expect(host.textContent).not.toContain('videoEditor.sidebar.textRewriteProjectTiming');
  const outbound = [...host.querySelectorAll('summary')].find((summary) =>
    summary.textContent?.includes('videoEditor.sidebar.textRewriteScopeDetails')
  )!;
  const details = outbound.closest('details')!;
  expect(details.dataset['variant']).toBe('information');
  expect(details.open).toBe(false);
  for (const key of [
    'gallery.videoReview.textRewriteDisclosure',
    'videoEditor.sidebar.textRewriteSaveDisclosure',
  ]) {
    const essential = [...host.querySelectorAll('p')].find((node) => node.textContent === key)!;
    expect(essential).toBeDefined();
    expect(essential.closest('details')).toBeNull();
  }
  expect(details.textContent).toContain('videoEditor.sidebar.textRewriteSourceScope');
  expect(details.textContent).toContain('videoEditor.sidebar.textRewritePlacements');
  await act(async () => outbound.click());
  expect(outbound.closest('details')?.open).toBe(true);
  const disclosed = JSON.parse(host.querySelector('pre')!.textContent!);
  expect(disclosed.fragments).toEqual([
    {
      id: 'phrase',
      text: 'Original text',
      start: 0,
      end: 8,
      ranges: [
        { start: 0, end: 2 },
        { start: 6, end: 8 },
      ],
    },
  ]);
  expect(runReviewTextJob).not.toHaveBeenCalled();
  await click('textRewriteTiming');
  expect(host.textContent).toContain('videoEditor.sidebar.textRewriteProjectTiming');
  const warning = [...host.querySelectorAll('p')].find(
    (node) => node.textContent === 'videoEditor.sidebar.textRewriteProjectTiming'
  )!;
  expect(warning.closest('details')).toBeNull();
  await generate();
  expect(runReviewTextJob).toHaveBeenCalledWith(
    expect.objectContaining({
      scope: expect.objectContaining({ kind: 'project-text', documentId: 'document' }),
      context: expect.objectContaining({ fragments: disclosed.fragments, changeIntervals: true }),
    }),
    expect.any(AbortSignal)
  );
  expect(proposalField().value).toBe('Suggested text');
  expect(
    host.querySelector<HTMLElement>('[data-ui="video.text-rewrite.proposal"] details')?.dataset[
      'variant'
    ]
  ).toBe('structural');
  await click('textRewriteReplace');
  expect(durable.textDocuments?.map((entry) => entry.binding.kind)).toEqual(['source', 'project']);
  expect(durable.textDocuments![1]!.document.fragments[0]).toMatchObject({
    text: 'Suggested text',
    start: 0.5,
    end: 1.5,
    timeDomain: 'result',
  });
  expect(durable.clips).toHaveLength(2);
  expect(useVideoEditorStore.getState().projectHistory.past).toHaveLength(1);
  expect(
    host.querySelector('[data-ui="video.text-rewrite.proposal"] [role="status"]')?.textContent
  ).toContain('textRewriteApplied');
  expect(host.querySelector('[role="alert"]')).toBeNull();
});
it('edits a project proposal and locks its accepted receipt while a failed Save can be retried', async () => {
  await mount();
  expect(host.textContent).toContain('videoEditor.sidebar.textRewriteProjectScope');
  await generate();
  await fill(proposalField(), 'Edited before Apply');
  expect(proposalField().value).toBe('Edited before Apply');
  vi.mocked(waitForVideoEditorSave).mockRejectedValueOnce(new Error('private error text'));
  await click('textRewriteVariant');
  expect(host.querySelector('[role="alert"]')?.textContent).toContain(
    'videoEditor.sidebar.recognitionFailed'
  );
  expect(host.textContent).not.toContain('private error text');
  expect(host.textContent).toContain('videoEditor.sidebar.recognitionSaveRetry');
  const retry = [...host.querySelectorAll('p')].find(
    (node) => node.textContent === 'videoEditor.sidebar.recognitionSaveRetry'
  )!;
  expect(retry.closest('details')).toBeNull();
  expect(proposalField().closest('fieldset')?.disabled).toBe(true);
  expect(button('textRewriteReplace').disabled).toBe(true);
  expect(button('textRewriteVariant').disabled).toBe(false);
  await click('textRewriteVariant');
  expect(
    host.querySelector('[data-ui="video.text-rewrite.proposal"] [role="status"]')?.textContent
  ).toContain('textRewriteApplied');
  expect(host.querySelector('[role="alert"]')).toBeNull();
  expect(runReviewTextJob).toHaveBeenCalledOnce();
  expect(useVideoEditorStore.getState().projectHistory.past).toHaveLength(1);
  expect(durable.textDocuments![0]!.document.fragments[1]).toMatchObject({
    text: 'Edited before Apply',
    showInVideo: false,
  });
});
it('shows waiting state, locks fields, and cancels without applying a late result', async () => {
  await mount();
  const reply = gate<ReviewTextProposal>();
  vi.mocked(runReviewTextJob).mockImplementationOnce(async () => {
    requestEntered.release();
    return reply.promise;
  });
  await generate();
  expect(host.querySelector('[role="status"]')?.textContent).toContain('textRewriteWaiting');
  expect(host.querySelector('fieldset')?.disabled).toBe(true);
  expect(button('textVoiceBack').disabled).toBe(true);
  await click('common.actions.cancel');
  expect(button('textRewriteStart').disabled).toBe(false);
  await act(async () =>
    reply.release({ version: 1, fragments: [{ fromIds: ['phrase'], text: 'Late text' }] })
  );
  expect(proposalField()).toBeNull();
  expect(durable.textDocuments![0]!.document.fragments[0]!.text).toBe('Original text');
  expect(useVideoEditorStore.getState().projectHistory.past).toHaveLength(0);
});
it('closes a disposable receipt without undoing accepted local work and restores logical focus', async () => {
  await mount();
  await generate();
  vi.mocked(waitForVideoEditorSave).mockRejectedValueOnce(new Error('Save failed'));
  await click('textRewriteReplace');
  await click('textVoiceBack');
  expect(host.querySelector('[data-ui="video-editor.text-rewrite.panel"]')).toBeNull();
  expect(document.activeElement).toBe(host.querySelector('[data-project-text-rewrite="all"]'));
  const current = useVideoEditorStore.getState().project!;
  expect(current.textDocuments![0]!.document.fragments[0]!.text).toBe('Suggested text');
  expect(useVideoEditorStore.getState().projectHistory.past).toHaveLength(1);
  act(() => useVideoEditorStore.getState().undoProject());
  expect(
    useVideoEditorStore.getState().project!.textDocuments![0]!.document.fragments[0]!.text
  ).toBe('Original text');
});
