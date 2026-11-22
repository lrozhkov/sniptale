// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { act, useEffect, type ComponentProps, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { parseVideoWorkspace } from '../../composition/persistence/review-workspaces/parser';
import type { VideoWorkspaceSnapshot } from '../../composition/persistence/review-workspaces/contracts';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
import { createVideoReviewSession } from '../../workflows/video-review/session';
import type { LoadedReview } from './use-session';
import type { useReviewEditorState } from './use-editor-state';
import type { ReviewHistoryControls } from './timeline-chrome';
import type { ReviewTimelineBinding } from './timeline-binding';
import { VideoReview } from './index';
import { translate } from '../../platform/i18n';
import { inspectReviewMedia } from '../../workflows/video-review/media-index';
import type { usePresentationPreview } from './use-presentation-preview';
import * as audioEngine from '../../workflows/video-review/audio-playback-engine';

const observed: {
  preview: Parameters<typeof usePresentationPreview>[0];
  previewPause: (() => void) | null;
  loaded: LoadedReview | null;
  state: ReturnType<typeof useReviewEditorState> | null;
  history: ComponentProps<typeof ReviewHistoryControls> | null;
  actualInspector: boolean;
  renders: { root: number; preview: number; timeline: number };
} = vi.hoisted(() => ({
  preview: null,
  previewPause: null,
  loaded: null,
  state: null,
  history: null,
  actualInspector: false,
  renders: { root: 0, preview: 0, timeline: 0 },
}));
vi.mock('./use-session', async (original) => ({
  ...(await original<typeof import('./use-session')>()),
  useLoadedReview: () => ({ resource: observed.loaded, failed: null, retry: vi.fn() }),
}));
vi.mock('./use-editor-state', async (original) => {
  const actual = await original<typeof import('./use-editor-state')>();
  return {
    ...actual,
    useReviewEditorState(resource: LoadedReview) {
      observed.renders.root++;
      const state = actual.useReviewEditorState(resource);
      observed.state = state;
      return state;
    },
  };
});
vi.mock('../../workflows/video-review/media-index', async (original) => ({
  ...(await original<typeof import('../../workflows/video-review/media-index')>()),
  inspectReviewMedia: vi.fn(async () => {
    throw new Error('Synthetic media fixture');
  }),
}));
vi.mock('./use-presentation-preview', async (original) => {
  const actual = await original<typeof import('./use-presentation-preview')>();
  return {
    ...actual,
    usePresentationPreview(...args: Parameters<typeof usePresentationPreview>) {
      observed.preview = args[0];
      observed.previewPause = args[2];
      return actual.usePresentationPreview(...args);
    },
  };
});
vi.mock('./review-dialog', () => ({
  ReviewDialog: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('./preview-binding', () => ({
  ReviewPreviewBinding: ({
    onPreviewRaster,
    previewOverlay,
  }: ComponentProps<typeof import('./preview-binding').ReviewPreviewBinding>) => {
    observed.renders.preview++;
    useEffect(() => {
      onPreviewRaster?.({ width: 640, height: 360 });
    }, [onPreviewRaster]);
    return previewOverlay ?? null;
  },
}));
vi.mock('./inspector-binding', async (original) => {
  const actual = await original<typeof import('./inspector-binding')>();
  return {
    ...actual,
    ReviewInspectorBinding: (props: ComponentProps<typeof actual.ReviewInspectorBinding>) =>
      observed.actualInspector ? <actual.ReviewInspectorBinding {...props} /> : null,
  };
});
vi.mock('./timeline-binding', () => ({
  ReviewTimelineBinding: (props: ComponentProps<typeof ReviewTimelineBinding>) => {
    observed.renders.timeline++;
    return (
      <>
        {props.navigationControls}
        {props.historyControls}
        {props.utilityControls}
      </>
    );
  },
}));
vi.mock('./timeline-chrome', async (original) => ({
  ...(await original<typeof import('./timeline-chrome')>()),
  ReviewHistoryControls: (props: ComponentProps<typeof ReviewHistoryControls>) => {
    observed.history = props;
    return null;
  },
}));
vi.mock('./panel-layout', () => ({
  useReviewPanelLayout: () => ({
    container: { current: null },
    timeline: { current: null },
    inspectorWidth: 380,
    timelineHeight: 200,
    inspector: {},
    timelineResize: {},
  }),
  ReviewPanelResizeHandle: () => null,
}));
vi.mock('./audio-waveform', () => ({ useReviewWaveforms: () => new Map() }));

let root: Root;
let host: HTMLDivElement;
let loaded: LoadedReview;
let failRead = false;
const save = vi.fn();
function setup() {
  const text = readFileSync(
    'apps/extension/src/features/video/project/effect-bundle/fixtures/retained/callout.sniptale-animation.json',
    'utf8'
  );
  const advanced = createQuickEditAdvancedState();
  advanced.ui.mode = 'advanced';
  advanced.annotationEffects = {
    enabled: true,
    instances: [
      {
        id: 'first',
        snapshotId: `effect:${'a'.repeat(64)}`,
        start: 1,
        end: 3,
        attachment: 'content',
        enabled: true,
        transform: { x: 0.1, y: 0.1, width: 0.4, height: 0.2, rotation: 0 },
        controls: { title: 'Persisted title' },
        anchors: { tip: { x: 0.5, y: 0.5 } },
        order: 0,
      },
    ],
  };
  const snapshot: VideoWorkspaceSnapshot = {
    workspace: {
      aggregateId: 'recording:r',
      sourceAssetId: 'source',
      formatVersion: 1,
      revision: 1,
      cursor: 0,
      history: [],
      source: { duration: 4, width: 640, height: 360, mimeType: 'video/webm', size: 5 },
      advanced,
      effectSnapshots: [
        {
          id: `effect:${'a'.repeat(64)}`,
          sha256: 'a'.repeat(64),
          source: text,
          schemaVersion: 'sniptale.animation.v1',
          kind: 'standalone',
          documentId: 'sniptale-callout',
          retainedByteLength: new TextEncoder().encode(text).byteLength,
          assets: [],
        },
      ],
      createdAt: 1,
      updatedAt: 1,
    },
    draft: null,
  };
  const read = vi.fn(async () => {
    if (failRead) throw new Error('Synthetic reload failure');
    return structuredClone(snapshot);
  });
  save.mockImplementation(async () => {
    throw new Error('Synthetic Save failure');
  });
  const session = createVideoReviewSession(snapshot, {
    readVideoWorkspace: read,
    moveVideoWorkspaceHistory: read,
    saveVideoWorkspaceAdvanced: read,
    saveVideoWorkspaceDraft: read,
    commitVideoWorkspace: read,
    saveVideoWorkspaceSnapshot: save,
  });
  session.setAutosaveEnabled(false);
  loaded = {
    source: snapshot.workspace.source,
    snapshot,
    session,
    file: new File(['video'], 'video.webm'),
    filename: 'video.webm',
    url: 'blob:r',
    telemetry: null,
  };
  observed.loaded = loaded;
  return read;
}
function state() {
  if (!observed.state) throw new Error('Missing actual editor state');
  return observed.state;
}
async function failedSaveAndNewField() {
  await act(async () => {
    state().annotationEffects.change('first', { start: 0.5 });
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });
  expect(loaded.session.getSnapshot().dirty).toBe(true);
  await act(async () => {
    await expect(loaded.session.saveBuffered()).rejects.toThrow();
  });
  expect(observed.history?.autosave?.error).toBe('storage');
  act(() => {
    expect(state().annotationEffects.beginGesture('first')).toBe(true);
    state().annotationEffects.previewGesture({ controls: { title: 'Recoverable typed title' } });
  });
  expect(state().annotationEffects.previewLane?.instances[0]?.controls['title']).toBe(
    'Recoverable typed title'
  );
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  failRead = false;
  observed.actualInspector = false;
  observed.renders = { root: 0, preview: 0, timeline: 0 };
  save.mockReset();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

it('keeps first lane settings and local subsection navigation inside the actual inspector owner', async () => {
  setup();
  observed.actualInspector = true;
  await act(async () => root.render(<VideoReview aggregateId="recording:r" onBack={vi.fn()} />));
  const tab = (id: string) =>
    host.querySelector<HTMLButtonElement>(
      `[data-ui="gallery.videoReview.trackWorkspace"] [role="tab"][aria-controls$="-${id}"]`
    )!;
  expect(tab('list').getAttribute('aria-selected')).toBe('true');
  const before = { ...observed.renders };
  await act(async () => tab('canvas').click());
  expect(tab('canvas').getAttribute('aria-selected')).toBe('true');
  expect(observed.renders).toEqual(before);
  await act(async () => tab('source-filters').click());
  expect(tab('source-filters').getAttribute('aria-selected')).toBe('true');
  expect(observed.renders).toEqual(before);
  await act(async () => tab('list').click());
  expect(tab('list').getAttribute('aria-selected')).toBe('true');
  expect(observed.renders).toEqual(before);
  await act(async () => state().setActiveSelection({ kind: 'annotation-effect', id: 'first' }));
  const presentation = host.querySelector<HTMLButtonElement>(
    '[data-ui="gallery.videoReview.inspectorPresentation"]'
  )!;
  expect(presentation).not.toBeNull();
  const selected = { ...observed.renders };
  await act(async () => presentation.click());
  expect(presentation.getAttribute('aria-pressed')).toBe('true');
  expect(observed.renders).toEqual(selected);
  await act(async () => presentation.click());
  expect(presentation.getAttribute('aria-pressed')).toBe('false');
  expect(observed.renders).toEqual(selected);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  await loaded.session.dispose();
  observed.preview = null;
  observed.loaded = null;
  observed.state = null;
  observed.history = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('cancels the field draft only after the actual confirmed root Reload has restored persisted history', async () => {
  setup();
  await act(async () => root.render(<VideoReview aggregateId="recording:r" onBack={vi.fn()} />));
  await failedSaveAndNewField();
  await act(async () => {
    await observed.history?.autosave?.onReload();
  });
  expect(loaded.session.getSnapshot().error).toBeNull();
  expect(loaded.session.getSnapshot().dirty).toBe(false);
  expect(state().annotationEffects.gestureId).toBeNull();
  expect(state().annotationEffects.previewLane?.instances[0]?.controls['title']).toBe(
    'Persisted title'
  );
  expect(parseVideoWorkspace(loaded.session.getSnapshot().snapshot.workspace)).not.toBeNull();
  expect(save).toHaveBeenCalledOnce();
});

it('preserves the disposable text and storage recovery state when the actual root Reload read fails', async () => {
  setup();
  await act(async () => root.render(<VideoReview aggregateId="recording:r" onBack={vi.fn()} />));
  await failedSaveAndNewField();
  failRead = true;
  await act(async () => {
    await observed.history?.autosave?.onReload();
  });
  expect(state().annotationEffects.gestureId).toBe('first');
  expect(state().annotationEffects.previewLane?.instances[0]?.controls['title']).toBe(
    'Recoverable typed title'
  );
  expect(loaded.session.getSnapshot().error).toBe('storage');
  expect(save).toHaveBeenCalledOnce();
  failRead = false;
  await act(async () => {
    await observed.history?.autosave?.onReload();
  });
  expect(state().annotationEffects.gestureId).toBeNull();
  expect(state().annotationEffects.previewLane?.instances[0]?.controls['title']).toBe(
    'Persisted title'
  );
});

it('passes sniptale.animation.v1 snapshots to the Gallery presentation preview', async () => {
  setup();
  vi.mocked(inspectReviewMedia).mockResolvedValue({
    duration: 4,
    boundaries: [0, 4],
    videoCodec: 'vp9',
    audioCodec: null,
    container: 'webm',
    rotation: 0,
    frameRate: 30,
    width: 640,
    height: 360,
  });
  await act(async () => root.render(<VideoReview aggregateId="recording:r" onBack={vi.fn()} />));
  await act(async () => {
    await vi.waitFor(() => expect(state().editing.exporter.index).not.toBeNull());
  });
  expect(observed.preview).not.toBeNull();
  expect(observed.preview?.effectSnapshots).toBe(
    state().snapshot.snapshot.workspace.effectSnapshots
  );
  expect(observed.preview?.effectSnapshots?.[0]?.documentId).toBe('sniptale-callout');
});

it('keeps two accepted root pointer gestures in separate Undo actions before autosave', async () => {
  const read = setup();
  await act(async () => root.render(<VideoReview aggregateId="recording:r" onBack={vi.fn()} />));
  const workspace = host.querySelector('[data-ui="gallery.videoReview.workspace"]')!;
  const button = document.createElement('button');
  workspace.append(button);
  const readsBefore = read.mock.calls.length;
  for (const volume of [1.4, 1.5]) {
    act(() => {
      button.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
      state().audio.setOriginal({ volume });
    });
  }
  expect(state().advanced.audio.original.volume).toBe(1.5);
  expect(loaded.session.getSnapshot().snapshot.workspace.history).toHaveLength(0);
  expect(read).toHaveBeenCalledTimes(readsBefore);
  expect(save).not.toHaveBeenCalled();
  for (const volume of [1.4, 1]) {
    await act(async () => {
      await state().moveHistory('undo');
    });
    expect(state().advanced.audio.original.volume).toBe(volume);
  }
  for (const volume of [1.4, 1.5]) {
    await act(async () => {
      await state().moveHistory('redo');
    });
    expect(state().advanced.audio.original.volume).toBe(volume);
  }
  expect(loaded.session.getSnapshot().snapshot.workspace.history).toHaveLength(2);
  expect(save).not.toHaveBeenCalled();
});

it.each(['text', 'number', 'search', 'textarea', 'contenteditable'])(
  'keeps a focused %s field group when the pointer only moves its caret',
  async (kind) => {
    setup();
    await act(async () => root.render(<VideoReview aggregateId="recording:r" onBack={vi.fn()} />));
    const workspace = host.querySelector('[data-ui="gallery.videoReview.workspace"]')!;
    const field = document.createElement(
      kind === 'textarea' ? 'textarea' : kind === 'contenteditable' ? 'div' : 'input'
    );
    if (field instanceof HTMLInputElement) field.type = kind;
    if (kind === 'contenteditable') {
      field.setAttribute('contenteditable', 'true');
      field.tabIndex = 0;
    }
    workspace.append(field);
    field.focus();
    act(() => state().audio.setOriginal({ volume: 1.4 }));
    act(() => {
      field.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
      state().audio.setOriginal({ volume: 1.5 });
    });
    await act(async () => {
      await state().moveHistory('undo');
    });
    expect(state().advanced.audio.original.volume).toBe(1);
    expect(loaded.session.getSnapshot().snapshot.workspace.history).toHaveLength(1);
  }
);

it('does not split a content group for a non-primary root pointer', async () => {
  setup();
  await act(async () => root.render(<VideoReview aggregateId="recording:r" onBack={vi.fn()} />));
  const workspace = host.querySelector('[data-ui="gallery.videoReview.workspace"]')!;
  act(() => state().audio.setOriginal({ volume: 1.4 }));
  act(() => {
    workspace.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 2 }));
    state().audio.setOriginal({ volume: 1.5 });
  });
  await act(async () => {
    await state().moveHistory('undo');
  });
  expect(state().advanced.audio.original.volume).toBe(1);
  expect(loaded.session.getSnapshot().snapshot.workspace.history).toHaveLength(1);
});

it('routes rare commands into one More menu in Basic and Advanced without permanent project actions', async () => {
  setup();
  await act(async () => root.render(<VideoReview aggregateId="recording:r" onBack={vi.fn()} />));
  for (const mode of ['basic', 'advanced'] as const) {
    await act(async () => state().setMode(mode));
    expect(host.querySelector('[data-ui="gallery.videoReview.newProject"]')).toBeNull();
    const trigger = host.querySelector<HTMLButtonElement>(
      '[data-ui="gallery.videoReview.moreActions"]'
    )!;
    expect(trigger).not.toBeNull();
    await act(async () => trigger.click());
    const menu = document.querySelector('[role="menu"]')!;
    expect([...menu.querySelectorAll('[role="menuitem"]')].map((item) => item.textContent)).toEqual(
      [
        translate('videoEditor.app.newProjectAction'),
        translate('gallery.videoReview.editHistoryTitle'),
        translate('gallery.keyboard.title'),
        translate('gallery.app.selectionBackup'),
        ...(mode === 'advanced'
          ? [translate('gallery.videoReview.returnBasicMode'), translate('common.actions.close')]
          : []),
      ]
    );
    await act(async () => trigger.click());
    expect(document.querySelector('[role="menu"]')).toBeNull();
  }
});

it('makes the live seek toolbar toggle available after metadata and keeps it outside project history', async () => {
  setup();
  let ready!: (index: Awaited<ReturnType<typeof inspectReviewMedia>>) => void;
  const metadata = new Promise<Awaited<ReturnType<typeof inspectReviewMedia>>>((resolve) => {
    ready = resolve;
  });
  vi.mocked(inspectReviewMedia).mockReturnValue(metadata);
  await act(async () => root.render(<VideoReview aggregateId="recording:r" onBack={vi.fn()} />));
  const button = () =>
    host.querySelector<HTMLButtonElement>('[data-ui="gallery.videoReview.liveSeekToggle"]')!;
  expect(button().disabled).toBe(true);
  await act(async () =>
    ready({
      duration: 4,
      boundaries: [0, 4],
      videoCodec: 'vp9',
      audioCodec: null,
      container: 'webm',
      rotation: 0,
      frameRate: 30,
      width: 640,
      height: 360,
    })
  );
  expect(button().disabled).toBe(false);
  expect(button().getAttribute('aria-pressed')).toBe('true');
  const before = loaded.session.getSnapshot();
  await act(async () => button().click());
  expect(button().getAttribute('aria-pressed')).toBe('false');
  expect(loaded.session.getSnapshot().snapshot).toEqual(before.snapshot);
  expect(loaded.session.getSnapshot().dirty).toBe(before.dirty);
  await act(async () => button().click());
  expect(button().getAttribute('aria-pressed')).toBe('true');
  expect(loaded.session.getSnapshot().snapshot).toEqual(before.snapshot);
});

it('keeps the advanced editor open when its exit checkpoint cannot be saved', async () => {
  setup();
  const onBack = vi.fn();
  const flush = vi.spyOn(loaded.session, 'flush');
  await act(async () => root.render(<VideoReview aggregateId="recording:r" onBack={onBack} />));
  await act(async () => state().setMode('advanced'));
  expect(
    host.querySelector('header [aria-label="' + translate('common.actions.close') + '"]')
  ).toBeNull();
  const trigger = host.querySelector<HTMLButtonElement>(
    '[data-ui="gallery.videoReview.moreActions"]'
  )!;
  await act(async () => trigger.click());
  const close = [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(
    (node) => node.textContent === translate('common.actions.close')
  )!;
  await act(async () => close.click());
  expect(flush).toHaveBeenCalledOnce();
  expect(onBack).not.toHaveBeenCalled();
});

it.each(['exit', 'join-preview'])(
  'pauses logical freeze playback before %s work',
  async (action) => {
    setup();
    vi.mocked(inspectReviewMedia).mockResolvedValue({
      duration: 4,
      boundaries: [0, 4],
      videoCodec: 'vp9',
      audioCodec: null,
      container: 'webm',
      rotation: 0,
      frameRate: 30,
      width: 640,
      height: 360,
    });
    vi.spyOn(audioEngine, 'createReviewAudioEngine').mockReturnValue({
      now: () => 0,
      resume: async () => {},
      decode: async () => ({ duration: 4 }),
      prepareClip: async (buffer) => buffer,
      scheduleClip: () => ({ stop() {} }),
      setOriginalGain() {},
      setOutputGain() {},
      stopAll() {},
      dispose() {},
    });
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn(() => 1)
    );
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    await act(async () => root.render(<VideoReview aggregateId="recording:r" onBack={vi.fn()} />));
    const video = document.createElement('video');
    video.src = loaded.url;
    Object.defineProperty(video, 'readyState', { value: 4 });
    video.pause = vi.fn();
    state().video.current = video;
    await act(async () =>
      loaded.session.commit({
        id: 'freeze',
        at: 1,
        target: 'edit',
        before: null,
        after: {
          id: 'freeze',
          kind: 'freeze',
          start: 1,
          end: 1,
          requestedStart: 1,
          requestedEnd: 1,
          duration: 2,
          frameTime: 0.98,
          frameDuration: 0.04,
        },
      })
    );
    await act(async () => {
      state().seekResult(1.5);
      await state().play();
    });
    expect(state().readPosition().source?.kind).toBe('freeze');
    expect(state().transport.getStatusSnapshot()).toMatchObject({ mode: 'playing', playing: true });
    if (action === 'join-preview') {
      await act(async () => observed.previewPause!());
      expect(state().transport.getStatusSnapshot().playing).toBe(false);
      return;
    }
    let finish!: () => void;
    vi.spyOn(loaded.session, 'flush').mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        })
    );
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[data-ui="gallery.videoReview.moreActions"]')!.click()
    );
    const close = [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(
      (node) => node.textContent === translate('common.actions.close')
    )!;
    await act(async () => close.click());
    const wasPlaying = state().transport.getStatusSnapshot().playing;
    await act(async () => finish());
    expect(wasPlaying).toBe(false);
  }
);
