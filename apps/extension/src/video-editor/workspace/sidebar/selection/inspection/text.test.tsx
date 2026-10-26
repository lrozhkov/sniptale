// @vitest-environment jsdom
import { usePlaybackSpaceShortcut } from '../../../../../composition/library-preview/shortcuts';
import { act, useEffect } from 'react';
import { RuntimePlaybackContext } from '../../../../runtime/controller/composition/contexts';
import {
  useVideoEditorPlayback,
  type VideoEditorPlaybackController,
} from '../../../../runtime/session/playback';
import type { PlaybackPreviewRuntime } from '../../../../interaction/playback/types';
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
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  });
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
  click('gallery.videoReview.textViewCards');
}
function click(label: string) {
  const scope = label.startsWith('gallery.videoReview.textView')
    ? host.querySelector('[data-ui="text-document.commands"]')!
    : host;
  const button = [...scope.querySelectorAll<HTMLButtonElement>('button')].find(
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
  expect(host.textContent).not.toContain('videoEditor.sidebar.contentDuration');
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
  click('gallery.videoReview.textViewCards');
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
  click('gallery.videoReview.textViewCards');
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
  click('gallery.videoReview.textViewCards');
  const trigger = () => host.querySelector<HTMLButtonElement>('[data-project-text-voice]')!;
  act(() => trigger().click());
  await act(async () => root.render(<VoiceHarness visible={false} />));
  await act(async () => root.render(<VoiceHarness />));
  await act(async () => click('gallery.videoReview.textVoiceBack'));
  expect(document.activeElement).toBe(trigger());
  expect(host.querySelector('textarea')).toBeNull();
});

it('changes text duration through the actual store with one history step and retained text', () => {
  mount();
  click('videoEditor.sidebar.newProjectText');
  type('Retained tail');
  act(() => host.querySelector('textarea')!.blur());
  const before = structuredClone(fragment());
  expect(useVideoEditorStore.getState().project!.duration).toBe(3);
  const history = useVideoEditorStore.getState().projectHistory.past.length;
  click('videoEditor.sidebar.contentDurationProject');
  expect(useVideoEditorStore.getState().project!.duration).toBe(0);
  expect(useVideoEditorStore.getState().project!.version).toBe(29);
  expect(fragment()).toEqual(before);
  expect(useVideoEditorStore.getState().projectHistory.past).toHaveLength(history + 1);
  click('videoEditor.sidebar.contentDurationProject');
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

it('keeps focused phrase Space activation local under the real transport capture listener', () => {
  create();
  type('Phrase');
  const toggle = vi.fn();
  function CaptureHarness() {
    usePlaybackSpaceShortcut(toggle);
    return <Harness />;
  }
  act(() => root.render(<CaptureHarness />));
  act(() => useVideoEditorStore.getState().setCurrentTime(1));
  const phrase = host.querySelector<HTMLElement>('[data-text-phrase-id]')!;
  act(() => {
    phrase.focus();
    phrase.dispatchEvent(
      new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true, cancelable: true })
    );
  });
  expect(toggle).not.toHaveBeenCalled();
  expect(useVideoEditorStore.getState().currentTime).toBe(0);
});

it('preserves the same refused editor receiver across Document and Cards before repair', () => {
  create();
  const field = host.querySelector('textarea')!;
  type('x'.repeat(16_001));
  click('gallery.videoReview.textViewDocument');
  expect(
    host.querySelector('[data-ui="text-document.actions"]')?.getAttribute('data-selected-count')
  ).toBe('1');
  expect(host.querySelector('textarea')).toBe(field);
  expect(field.value).toHaveLength(16_001);
  expect(field.getAttribute('aria-invalid')).toBe('true');
  click('gallery.videoReview.textViewCards');
  expect(host.querySelector('textarea')).toBe(field);
  type('Repaired');
  expect(fragment().text).toBe('Repaired');
  expect(host.querySelector('[role="alert"]')).toBeNull();
});

it('defaults to the whole document and reaches a late phrase editor', () => {
  let project = useVideoEditorStore.getState().project!;
  for (let index = 0; index < 56; index++) {
    const added = addVideoProjectManualText(project, {
      documentId: 'document',
      fragmentId: `phrase-${index}`,
      start: index * 3,
      ...(project.textDocuments?.[0] ? { target: project.textDocuments[0] } : {}),
    });
    if (!added.ok) throw new Error('Missing phrase');
    added.entry.document.fragments.find((fragment) => fragment.id === `phrase-${index}`)!.text =
      `Phrase ${index}`;
    project = added.project;
  }
  useVideoEditorStore.getState().setProject({ ...project, duration: 168 });
  act(() => root.render(<Harness />));
  expect(host.querySelectorAll('[data-text-phrase-id]')).toHaveLength(56);
  const last = host.querySelector<HTMLElement>('[data-text-phrase-id="phrase-55"]')!;
  act(() => last.click());
  expect(useVideoEditorStore.getState().currentTime).toBe(165);
  click('gallery.videoReview.textPhraseEdit');
  expect(host.querySelector('textarea')!.value).toBe('Phrase 55');
  expect(document.activeElement).toBe(host.querySelector('textarea'));
  expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalled();
});

function PreparedTextHarness({
  preview,
  controls,
  visible = true,
}: {
  visible?: boolean;
  preview: PlaybackPreviewRuntime;
  controls: { current: VideoEditorPlaybackController | null };
}) {
  const state = useVideoEditorStore();
  const runtime = useVideoEditorPlayback(
    state.project,
    {
      currentTime: state.currentTime,
      isPlaying: state.isPlaying,
      playbackRange: null,
      selection: state.selection,
      placementMode: null,
      projectHistoryTransactionActive: false,
      shortcutsEnabled: false,
      selectedClipId: null,
      selectedActionOccurrence: null,
      selectedMotionRegion: null,
    },
    state
  );
  controls.current = runtime;
  const registerPreviewRuntime = runtime.registerPreviewRuntime;
  useEffect(() => {
    registerPreviewRuntime(preview);
    return () => registerPreviewRuntime(null);
  }, [preview, registerPreviewRuntime]);
  return (
    <RuntimePlaybackContext.Provider value={runtime}>
      {visible ? <Harness /> : null}
    </RuntimePlaybackContext.Provider>
  );
}

function preparePhrasePlayback() {
  const added = addVideoProjectManualText(useVideoEditorStore.getState().project!, {
    documentId: 'document',
    fragmentId: 'late',
    start: 3,
  });
  if (!added.ok) throw new Error('Missing phrase');
  useVideoEditorStore.getState().setProject({ ...added.project, duration: 8 });
  const ready = Promise.withResolvers<'live-ready'>();
  const preview: PlaybackPreviewRuntime = {
    prepare: vi.fn<PlaybackPreviewRuntime['prepare']>((request) =>
      request.reason === 'play' ? ready.promise : Promise.resolve('live-ready')
    ),
    cancel: vi.fn(),
    present: vi.fn(),
    settle: vi.fn(),
    subscribe: () => () => {},
  };
  const frames = new Map<number, FrameRequestCallback>();
  let frameId = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++frameId, callback);
    return frameId;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  const frame = () =>
    act(() => {
      const pending = [...frames.values()];
      frames.clear();
      pending.forEach((callback) => callback(performance.now()));
    });
  const controls = { current: null as VideoEditorPlaybackController | null };
  act(() => root.render(<PreparedTextHarness preview={preview} controls={controls} />));
  act(() => host.querySelector<HTMLElement>('[data-text-phrase-id="late"]')!.click());
  return { ready, preview, controls, frame };
}

it('prepares phrase playback at the projected start before advancing the real runtime clock', async () => {
  const { ready, preview, frame } = preparePhrasePlayback();
  click('gallery.videoReview.textPlayFromHere');
  expect(useVideoEditorStore.getState().isPlaying).toBe(false);
  frame();
  expect(preview.prepare).toHaveBeenCalledWith(
    expect.objectContaining({ reason: 'play', time: 3 })
  );
  expect(useVideoEditorStore.getState().isPlaying).toBe(false);
  await act(async () => {
    ready.resolve('live-ready');
    await ready.promise;
  });
  expect(useVideoEditorStore.getState().isPlaying).toBe(true);
  expect(useVideoEditorStore.getState().currentTime).toBe(3);
  const now = vi.spyOn(performance, 'now').mockReturnValue(performance.now() + 500);
  try {
    frame();
    expect(useVideoEditorStore.getState().currentTime).toBeGreaterThan(3.4);
    expect(preview.present).toHaveBeenCalled();
  } finally {
    now.mockRestore();
  }
});

it.each(['navigation', 'selection', 'project', 'unmount', 'view', 'seek'] as const)(
  'cancels delayed phrase Play after %s without changing source text',
  async (trigger) => {
    const { ready, preview, controls, frame } = preparePhrasePlayback();
    const source = useVideoEditorStore.getState().project!.textDocuments;
    click('gallery.videoReview.textPlayFromHere');
    if (trigger === 'navigation')
      act(() => host.querySelector<HTMLElement>('[data-text-phrase-id="late"]')!.click());
    if (trigger === 'selection')
      act(() =>
        host
          .querySelector<HTMLElement>('[data-text-phrase-id="late"]')!
          .dispatchEvent(new MouseEvent('click', { ctrlKey: true, bubbles: true }))
      );
    if (trigger === 'project')
      act(() => useVideoEditorStore.getState().setProject(createEmptyVideoProject('Other')));
    if (trigger === 'unmount') act(() => root.render(null));
    if (trigger === 'view') click('gallery.videoReview.textViewCards');
    if (trigger === 'seek') act(() => controls.current!.seekTo(5));
    frame();
    await act(async () => {
      ready.resolve('live-ready');
      await ready.promise;
    });
    expect(preview.prepare).not.toHaveBeenCalledWith(expect.objectContaining({ reason: 'play' }));
    expect(useVideoEditorStore.getState().isPlaying).toBe(false);
    if (trigger !== 'project')
      expect(useVideoEditorStore.getState().project!.textDocuments).toBe(source);
  }
);

it('retains competing prepared transport intent instead of starting the pending phrase request', async () => {
  const { ready, preview, controls, frame } = preparePhrasePlayback();
  click('gallery.videoReview.textPlayFromHere');
  act(() => controls.current!.togglePlayback());
  frame();
  expect(
    vi.mocked(preview.prepare).mock.calls.filter(([request]) => request.reason === 'play')
  ).toHaveLength(1);
  await act(async () => {
    ready.resolve('live-ready');
    await ready.promise;
  });
  expect(useVideoEditorStore.getState().isPlaying).toBe(true);
});

it.each(['navigation', 'failure'] as const)(
  'does not start late after prepared phrase playback %s',
  async (trigger) => {
    const { ready, frame } = preparePhrasePlayback();
    const source = useVideoEditorStore.getState().project!.textDocuments;
    click('gallery.videoReview.textPlayFromHere');
    frame();
    expect(useVideoEditorStore.getState().isPlaying).toBe(false);
    if (trigger === 'navigation')
      act(() => host.querySelector<HTMLElement>('[data-text-phrase-id="late"]')!.click());
    await act(async () => {
      if (trigger === 'failure') ready.reject(new Error('Playback unavailable'));
      else ready.resolve('live-ready');
      await ready.promise.catch(() => {});
    });
    frame();
    expect(useVideoEditorStore.getState().isPlaying).toBe(false);
    expect(useVideoEditorStore.getState().project!.textDocuments).toBe(source);
  }
);

it.each(['cards', 'unmount'] as const)(
  'preserves successor playback after %s while the older phrase preparation remains unresolved',
  async (trigger) => {
    const { ready, preview, controls, frame } = preparePhrasePlayback();
    let starts = 0;
    vi.mocked(preview.prepare).mockImplementation((request) =>
      request.reason === 'play' && ++starts === 1 ? ready.promise : Promise.resolve('live-ready')
    );
    click('gallery.videoReview.textPlayFromHere');
    frame();
    expect(starts).toBe(1);
    act(() => controls.current!.togglePlayback());
    await act(async () => controls.current!.togglePlayback());
    expect(starts).toBe(2);
    expect(useVideoEditorStore.getState().isPlaying).toBe(true);
    if (trigger === 'cards') click('gallery.videoReview.textViewCards');
    else
      act(() =>
        root.render(<PreparedTextHarness preview={preview} controls={controls} visible={false} />)
      );
    expect(useVideoEditorStore.getState().isPlaying).toBe(true);
    await act(async () => {
      ready.resolve('live-ready');
      await ready.promise;
    });
    expect(useVideoEditorStore.getState().isPlaying).toBe(true);
    const now = vi.spyOn(performance, 'now').mockReturnValue(performance.now() + 500);
    try {
      frame();
      expect(useVideoEditorStore.getState().currentTime).toBeGreaterThan(3.4);
    } finally {
      now.mockRestore();
    }
  }
);

it.each(['cards', 'unmount'] as const)(
  'keeps accepted phrase preparation owned by shared transport after %s',
  async (trigger) => {
    const { ready, preview, controls, frame } = preparePhrasePlayback();
    const source = useVideoEditorStore.getState().project!.textDocuments;
    click('gallery.videoReview.textPlayFromHere');
    frame();
    expect(useVideoEditorStore.getState().isPlaying).toBe(false);
    if (trigger === 'cards') click('gallery.videoReview.textViewCards');
    else
      act(() =>
        root.render(<PreparedTextHarness preview={preview} controls={controls} visible={false} />)
      );
    await act(async () => {
      ready.resolve('live-ready');
      await ready.promise;
    });
    expect(useVideoEditorStore.getState().isPlaying).toBe(true);
    expect(useVideoEditorStore.getState().currentTime).toBe(3);
    expect(useVideoEditorStore.getState().project!.textDocuments).toBe(source);
  }
);
