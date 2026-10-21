// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  createEmptyVideoProject,
  createVideoProjectAsset,
} from '../../../../../features/video/project/factories/creation';
import { addVideoProjectManualText } from '../../../../../features/video/project/text/authoring';
import { createReviewCaptionSettings } from '../../../../../features/video/review/text-document';
import { useVideoEditorStore } from '../../../../state/store';
import { InspectProjectTextPanel } from './text';
import {
  useVideoProjectTextVoice,
  type VideoProjectTextVoiceController,
} from '../../../../runtime/session/text-voice';
import {
  useVideoProjectTextRewrite,
  type VideoProjectTextRewriteController,
} from '../../../../runtime/session/text-rewrite';

vi.mock('../../../../../workflows/ai-settings/query', () => ({
  requestAIModelSelectionBootstrap: vi.fn(async () => ({
    chromeAiEnabled: false,
    defaultModelId: null,
    globalSystemPrompt: '',
    models: [],
    providers: [],
  })),
}));

vi.mock('../../../../../platform/i18n', async (original) => ({
  ...(await original<typeof import('../../../../../platform/i18n')>()),
  translate: (key: string) =>
    key === 'gallery.videoReview.speechBatchSelected' ? 'Selected: {count}' : key,
  useAppLocale: () => 'en',
  getCurrentLocale: () => 'en',
}));
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let initial: ReturnType<typeof useVideoEditorStore.getState>;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  initial = useVideoEditorStore.getState();
  useVideoEditorStore.getState().setProject(createEmptyVideoProject('Text'));
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
function Harness() {
  const project = useVideoEditorStore((state) => state.project);
  return project ? <InspectProjectTextPanel key={project.id} project={project} /> : null;
}
function mount() {
  act(() => root.render(<Harness />));
}
function click(label: string) {
  const button = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
    (node) =>
      node.textContent?.includes(label) ||
      node.title === label ||
      node.getAttribute('aria-label') === label
  );
  if (!button) throw new Error(`Missing button: ${label}`);
  act(() => button.click());
}
function type(value: string) {
  const field = host.querySelector('textarea')!;
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
      field,
      value
    );
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
function fragment() {
  return useVideoEditorStore.getState().project!.textDocuments![0]!.document.fragments[0]!;
}
function create() {
  mount();
  click('videoEditor.sidebar.newProjectText');
}
it('creates text, groups typing into one Undo action and retains caption appearance across disable', () => {
  create();
  expect(useVideoEditorStore.getState().project!.duration).toBe(3);
  expect(fragment().timeDomain).toBe('result');
  const field = host.querySelector('textarea')!;
  act(() => field.focus());
  type('One');
  type('One two');
  act(() => field.blur());
  expect(fragment().text).toBe('One two');
  expect(useVideoEditorStore.getState().projectHistory.past).toHaveLength(2);
  act(() => useVideoEditorStore.getState().undoProject());
  expect(fragment().text).toBe('');
  act(() => useVideoEditorStore.getState().redoProject());
  expect(fragment().text).toBe('One two');
  click('gallery.videoReview.captionsEnabled');
  const top =
    host.querySelector<HTMLButtonElement>('[aria-label="gallery.videoReview.captionTop"]') ??
    [...host.querySelectorAll<HTMLButtonElement>('button')].find(
      (node) => node.textContent === 'gallery.videoReview.captionTop'
    )!;
  act(() => top.click());
  click('gallery.videoReview.captionsEnabled');
  click('gallery.videoReview.captionsEnabled');
  expect(useVideoEditorStore.getState().project!.textDocuments![0]!.captions?.style.position).toBe(
    'top'
  );
});
it('preserves refused text for repair and never closes another tool history lease', () => {
  create();
  act(() => host.querySelector('textarea')!.blur());
  let foreign: ReturnType<
    ReturnType<typeof useVideoEditorStore.getState>['beginProjectHistoryTransaction']
  >;
  act(() => {
    foreign = useVideoEditorStore.getState().beginProjectHistoryTransaction();
  });
  act(() => host.querySelector('textarea')!.focus());
  type('Retry me');
  expect(fragment().text).toBe('');
  expect(host.querySelector('textarea')!.value).toBe('Retry me');
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('textEditStale');
  act(() => host.querySelector('textarea')!.blur());
  expect(useVideoEditorStore.getState().isProjectHistoryTransactionCurrent(foreign!)).toBe(true);
  act(() => useVideoEditorStore.getState().endProjectHistoryTransaction(foreign!));
  act(() => host.querySelector('textarea')!.focus());
  type('Retry me repaired');
  expect(fragment().text).toBe('Retry me repaired');
  act(() => root.render(null));
  expect(useVideoEditorStore.getState().projectHistory.transaction).toBeNull();
});
it.each([false, true])(
  'rejects an old project context, including same-ID recreation (%s)',
  (sameId) => {
    const basis = useVideoEditorStore.getState().project!;
    act(() => root.render(<InspectProjectTextPanel project={basis} />));
    act(() =>
      useVideoEditorStore
        .getState()
        .setProject({ ...createEmptyVideoProject('Other'), ...(sameId ? { id: basis.id } : {}) })
    );
    click('videoEditor.sidebar.newProjectText');
    expect(useVideoEditorStore.getState().project!.textDocuments).toBeUndefined();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('textEditStale');
  }
);
it('deletes only text, supports Undo and leaves an empty document for its appearance settings', () => {
  create();
  type('Remove');
  act(() => host.querySelector('textarea')!.blur());
  click('gallery.videoReview.textFragmentDelete');
  expect(useVideoEditorStore.getState().project!.textDocuments![0]!.document.fragments).toEqual([]);
  expect(useVideoEditorStore.getState().project!.duration).toBe(0);
  expect(host.querySelector('[role="status"]')?.textContent).toBe(
    'gallery.videoReview.textFragmentEmpty'
  );
  expect(host.querySelector('[aria-label="gallery.videoReview.captionsEnabled"]')).not.toBeNull();
  expect(
    [...host.querySelectorAll<HTMLButtonElement>('button')].some(
      (node) => node.textContent?.includes('videoEditor.sidebar.newProjectText') && !node.disabled
    )
  ).toBe(true);
  act(() => useVideoEditorStore.getState().undoProject());
  expect(fragment().text).toBe('Remove');
});
it('retains a validation failure draft while the admitted document stays unchanged', () => {
  create();
  act(() => host.querySelector('textarea')!.focus());
  const invalid = 'x'.repeat(16_001);
  type(invalid);
  expect(fragment().text).toBe('');
  expect(host.querySelector('textarea')!.value).toBe(invalid);
  expect(host.querySelector('[role="alert"]')).not.toBeNull();
  type('Valid');
  expect(fragment().text).toBe('Valid');
  expect(host.querySelector('[role="alert"]')).toBeNull();
});
it('mounts retained source text with its native clock and disables jumping when dormant', () => {
  const project = createEmptyVideoProject('Dormant');
  const added = addVideoProjectManualText(project, {
    documentId: 'source',
    fragmentId: 'word',
    start: 1,
  });
  if (!added.ok) throw new Error('Missing text');
  const asset = createVideoProjectAsset(
    'Retained source',
    'AUDIO',
    { kind: 'project-asset', projectAssetId: 'retained' },
    {
      width: 0,
      height: 0,
      duration: 12,
      hasAudio: true,
      mimeType: 'audio/webm',
      size: 1,
      audioPeaks: null,
    }
  );
  added.project.assets.push(asset);
  added.entry.binding = { kind: 'source', assetId: asset.id, sourceInstanceId: 'instance' };
  added.entry.document.fragments[0]!.timeDomain = 'source';
  useVideoEditorStore.getState().setProject(added.project);
  mount();
  act(() => host.querySelector<HTMLButtonElement>('article > button')!.click());
  expect(host.textContent).toContain('textClockSource');
  expect(host.textContent).not.toContain('videoEditor.sidebar.textDuration');
  expect(host.textContent).toContain('textSourceExcluded');
  expect(
    host.querySelector<HTMLButtonElement>('[title="gallery.videoReview.speechJump"]')!.disabled
  ).toBe(true);
});

it('opens exact single, batch and whole-document scopes and restores the initiating command focus', async () => {
  let project = useVideoEditorStore.getState().project!;
  for (const [index, id] of ['first', 'second', 'third'].entries()) {
    const added = addVideoProjectManualText(project, {
      documentId: 'document',
      fragmentId: id,
      start: index * 3,
      ...(project.textDocuments?.[0] ? { target: project.textDocuments[0] } : {}),
    });
    if (!added.ok) throw new Error('Missing text');
    project = added.project;
  }
  useVideoEditorStore.getState().setProject(project);
  let rewrite: VideoProjectTextRewriteController | undefined;
  function RewriteHarness() {
    const project = useVideoEditorStore((state) => state.project)!;
    const controller = useVideoProjectTextRewrite(project);
    rewrite = controller;
    return <InspectProjectTextPanel project={project} rewrite={controller} />;
  }
  const trigger = (scope: string) =>
    host.querySelector<HTMLButtonElement>(`[data-project-text-rewrite="${scope}"]`)!;
  const close = async () => act(async () => click('gallery.videoReview.textVoiceBack'));
  await act(async () => root.render(<RewriteHarness />));
  await act(async () => {
    trigger('second').focus();
    trigger('second').click();
  });
  expect(rewrite?.target).toEqual({
    documentId: 'document',
    ids: ['second'],
    wholeDocument: false,
  });
  expect(host.querySelector('[data-ui="video-editor.text-rewrite.panel"]')).not.toBeNull();
  expect(host.querySelector('article')).toBeNull();
  await close();
  expect(document.activeElement).toBe(trigger('second'));
  await act(async () => click('gallery.videoReview.speechBatch'));
  const checks = [...host.querySelectorAll<HTMLInputElement>('article input[type="checkbox"]')];
  await act(async () => {
    checks[2]!.click();
    checks[0]!.click();
  });
  expect(host.querySelector('[role="status"]')?.textContent).toBe('Selected: 2');
  await act(async () => trigger('selected').click());
  expect(rewrite?.target).toEqual({
    documentId: 'document',
    ids: ['first', 'third'],
    wholeDocument: false,
  });
  await close();
  expect(document.activeElement).toBe(trigger('selected'));
  await act(async () => trigger('all').click());
  expect(rewrite?.target).toEqual({
    documentId: 'document',
    ids: ['first', 'second', 'third'],
    wholeDocument: true,
  });
  await close();
  expect(document.activeElement).toBe(trigger('all'));
  expect(useVideoEditorStore.getState().projectHistory.past).toHaveLength(0);
});

it('identifies document caption inheritance and retains complete phrase text on its collapsed row', () => {
  create();
  const phrase = 'Complete phrase '.repeat(20);
  type(phrase);
  act(() => host.querySelector('textarea')!.blur());
  const header = host.querySelector<HTMLButtonElement>('article > button')!;
  expect(header.title).toBe(phrase);
  const style = [...host.querySelectorAll('article summary')].find((node) =>
    node.textContent?.includes('gallery.videoReview.captionStyle')
  )!;
  act(() => style.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  expect(host.querySelector('article')?.textContent).toContain(
    'videoEditor.sidebar.captionInheritDocument'
  );
  expect(host.querySelector('article')?.textContent).not.toContain(
    'gallery.videoReview.captionInherit'
  );
  click('videoEditor.sidebar.captionInheritDocument');
  expect(fragment().style).toEqual(createReviewCaptionSettings().style);
  act(() => header.click());
  expect(host.querySelector<HTMLButtonElement>('article > button')!.title).toBe(phrase);
});

let voiceOperation: VideoProjectTextVoiceController;
function VoiceHarness({ visible = true }: { visible?: boolean }) {
  const project = useVideoEditorStore((state) => state.project)!;
  voiceOperation = useVideoProjectTextVoice(project);
  return visible ? <InspectProjectTextPanel project={project} voice={voiceOperation} /> : null;
}
it('opens the selected speech scope without rewrite and restores the batch trigger on Back', async () => {
  create();
  type('First chosen phrase');
  click('videoEditor.sidebar.newProjectText');
  type('Second chosen phrase');
  await act(async () => root.render(<VoiceHarness />));
  click('gallery.videoReview.speechBatch');
  const checks = host.querySelectorAll<HTMLInputElement>('article input[type="checkbox"]');
  expect(checks).toHaveLength(2);
  act(() => checks[0]!.click());
  expect(host.textContent).toContain('Selected: 1');
  click('gallery.videoReview.textFragmentSelectFound');
  expect(host.textContent).toContain('Selected: 2');
  click('gallery.videoReview.speechGenerateSelected');
  expect(voiceOperation.batch).toBe(true);
  expect(voiceOperation.items).toHaveLength(2);
  expect(host.querySelector('[data-ui="video-editor.text-voice.batch"]')).not.toBeNull();
  await act(async () => root.render(<VoiceHarness visible={false} />));
  await act(async () => root.render(<VoiceHarness />));
  await act(async () => click('gallery.videoReview.textVoiceBack'));
  expect(voiceOperation.target).toBeNull();
  expect(document.activeElement).toBe(host.querySelector('[data-project-text-voice="selected"]'));
});

it('restores the single voice trigger after remount and leaves its phrase collapsed', async () => {
  create();
  type('Single chosen phrase');
  await act(async () => root.render(<VoiceHarness />));
  const trigger = () => host.querySelector<HTMLButtonElement>('[data-project-text-voice]')!;
  act(() => trigger().click());
  await act(async () => root.render(<VoiceHarness visible={false} />));
  await act(async () => root.render(<VoiceHarness />));
  await act(async () => click('gallery.videoReview.textVoiceBack'));
  expect(document.activeElement).toBe(trigger());
  expect(host.querySelector('article > button')?.getAttribute('aria-expanded')).toBe('false');
});

it('changes text duration through the actual store with one history step and retained text', () => {
  mount();
  click('videoEditor.sidebar.newProjectText');
  type('Retained tail');
  act(() => host.querySelector('textarea')!.blur());
  const before = structuredClone(fragment());
  expect(useVideoEditorStore.getState().project!.duration).toBe(3);
  const history = useVideoEditorStore.getState().projectHistory.past.length;
  click('videoEditor.sidebar.textDurationProject');
  expect(useVideoEditorStore.getState().project!.duration).toBe(0);
  expect(useVideoEditorStore.getState().project!.version).toBe(29);
  expect(fragment()).toEqual(before);
  expect(useVideoEditorStore.getState().projectHistory.past).toHaveLength(history + 1);
  click('videoEditor.sidebar.textDurationProject');
  expect(useVideoEditorStore.getState().projectHistory.past).toHaveLength(history + 1);
  act(() => useVideoEditorStore.getState().undoProject());
  expect(useVideoEditorStore.getState().project!.duration).toBe(3);
  expect(fragment()).toEqual(before);
  act(() => useVideoEditorStore.getState().redoProject());
  expect(useVideoEditorStore.getState().project!.duration).toBe(0);
  click('videoEditor.sidebar.textDurationContent');
  expect(useVideoEditorStore.getState().project!.duration).toBe(3);
  expect(fragment()).toEqual(before);
});
