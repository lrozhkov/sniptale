// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import type { VideoWorkspaceSnapshot } from '../../composition/persistence/review-workspaces/contracts';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
import type { ReviewAnnotationEffect } from '../../features/video/review/annotation-effects/types';
import { createVideoReviewSession } from '../../workflows/video-review/session';
import type { LoadedReview } from './use-session';
import { useReviewEditorState } from './use-editor-state';
import { ReviewTimelineBinding } from './timeline-binding';
import { translate, getCurrentLocale } from '../../platform/i18n';
import type { EffectBundleCatalogEntry } from '../../features/video/project/effect-bundle/catalog';

const catalogFixture = vi.hoisted((): EffectBundleCatalogEntry => ({
  packId: 'catalog',
  source: 'builtin',
  enabled: true,
  createdAt: 0,
  updatedAt: 0,
  version: '1',
  retainedByteLength: 0,
  sourceSha256: 'hash',
  label: { en: 'Catalog title', ru: 'Заголовок каталога' },
  description: { en: '', ru: '' },
  assets: [],
  documents: [
    {
      id: 'title',
      kind: 'standalone',
      schemaVersion: 'sniptale.effect.v1',
      sha256: 'hash',
      assets: [],
      presentation: { label: { en: 'Catalog title', ru: 'Заголовок каталога' }, duration: 4 },
    },
  ],
}));
vi.mock('./use-annotation-effects-catalog', () => ({
  useReviewAnnotationCatalog: () => ({
    items: [{ status: 'ready', entry: catalogFixture }],
    phase: 'ready',
    reload: vi.fn(),
  }),
}));

// The timeline scroll chrome is outside this source-replacement proof; the real binding and lane remain mounted.
vi.mock('./timeline', () => ({
  ReviewTimeline: (props: Parameters<typeof import('./timeline').ReviewTimeline>[0]) => (
    <>
      {props.tools}
      {props.annotationEffectsTrack}
      {props.zoomTrack}
      {Object.entries(props.audioTracks ?? {}).map(([key, lane]) => (
        <div key={key}>{lane}</div>
      ))}
    </>
  ),
}));
vi.mock('../../workflows/video-review/media-index', async (original) => ({
  ...(await original<typeof import('../../workflows/video-review/media-index')>()),
  inspectReviewMedia: vi.fn(async () => {
    throw new Error('Synthetic media fixture');
  }),
}));

function resource(id: string, zoom = false): LoadedReview {
  const source = readFileSync(
    'apps/extension/public/video-effects/effects/annotations/sniptale-title/effect.sniptale-effect.json',
    'utf8'
  );
  const snapshotId = `effect:${'a'.repeat(64)}`;
  const instance: ReviewAnnotationEffect = {
    id: 'first',
    snapshotId,
    start: 1,
    end: 3,
    enabled: true,
    attachment: 'content',
    transform: { x: 0.1, y: 0.1, width: 0.4, height: 0.2, rotation: 0 },
    controls: {},
    order: 0,
  };
  const advanced = createQuickEditAdvancedState();
  advanced.ui.mode = 'advanced';
  advanced.ui.tracks.zoom = zoom;
  advanced.zoom.enabled = zoom;
  advanced.annotationEffects = { enabled: true, instances: [instance] };
  const snapshot: VideoWorkspaceSnapshot = {
    workspace: {
      aggregateId: `recording:${id}`,
      sourceAssetId: id,
      formatVersion: 1,
      source: { duration: 4, width: 640, height: 360, mimeType: 'video/webm', size: 5 },
      revision: 1,
      cursor: 0,
      history: [],
      advanced,
      effectSnapshots: [
        {
          id: snapshotId,
          sha256: 'a'.repeat(64),
          source,
          schemaVersion: 'sniptale.effect.v1',
          kind: 'standalone',
          documentId: 'sniptale-title',
          retainedByteLength: new TextEncoder().encode(source).byteLength,
          assets: [],
        },
      ],
      createdAt: 1,
      updatedAt: 1,
    },
    draft: null,
  };
  const read = vi.fn(async () => structuredClone(snapshot));
  const session = createVideoReviewSession(snapshot, {
    readVideoWorkspace: read,
    moveVideoWorkspaceHistory: read,
    saveVideoWorkspaceAdvanced: read,
    saveVideoWorkspaceDraft: read,
    commitVideoWorkspace: read,
    saveVideoWorkspaceSnapshot: read,
  });
  session.setAutosaveEnabled(false);
  return {
    source: snapshot.workspace.source,
    snapshot,
    session,
    file: new File(['video'], 'video.webm'),
    filename: 'video.webm',
    url: `blob:${id}`,
    telemetry: null,
  };
}

function BindingHarness({
  loaded,
  beforeAction,
  onState,
  onAdd,
  failure,
}: {
  loaded: LoadedReview;
  beforeAction?: (action: () => void) => void;
  onState(state: ReturnType<typeof useReviewEditorState>): void;
  onAdd?: ReturnType<typeof useReviewEditorState>['annotationEffects']['add'];
  failure?: ReturnType<typeof useReviewEditorState>['annotationEffects']['failure'];
}) {
  const state = useReviewEditorState(loaded);
  onState(state);
  return (
    <ReviewTimelineBinding
      annotationEffects={
        onAdd
          ? {
              ...state.annotationEffects,
              add: onAdd,
              failure: failure ?? state.annotationEffects.failure,
            }
          : state.annotationEffects
      }
      annotationSourceId={state.snapshot.snapshot.workspace.sourceAssetId}
      annotationToolCancellation={state.annotationToolCancellation}
      effectSnapshots={state.snapshot.snapshot.workspace.effectSnapshots ?? []}
      selectedAnnotationEffectId={
        state.activeSelection.kind === 'annotation-effect' ? state.activeSelection.id : null
      }
      onSelectAnnotationEffect={(id) => state.setActiveSelection({ kind: 'annotation-effect', id })}
      beforeAction={beforeAction ?? state.beforeAction}
      editing={state.editing}
      edits={state.snapshot.document.edits}
      annotations={state.snapshot.document.annotations}
      source={state.source}
      busy={state.busy}
      composerBusy={false}
      selection={state.selection}
      setSelection={state.setSelection}
      advanced={state.advanced}
      resultDuration={state.timeline.resultDuration}
      outputTime={state.timeline.outputTime}
      toOutputTime={state.timeline.toOutputTime}
      onCutPlacement={vi.fn()}
      setTrackVisibility={state.setTrackVisibility}
      setMode={state.setMode}
      telemetryAvailable={false}
      time={state.time}
      playing={state.playing}
      markers={[]}
      selectedTelemetryRef={undefined}
      zoom={state.zoom}
      audio={state.audio}
      audioState={state.advanced.audio}
      onImportAudioFile={vi.fn()}
      onRecordVoiceover={vi.fn()}
      onMarker={vi.fn()}
      onClearSelection={vi.fn()}
      selectedObject={false}
      onComment={vi.fn()}
      onSeek={state.seek}
      onPlay={state.play}
      onOpenExport={vi.fn()}
    />
  );
}

it('retains a refused choice, completes one placement and ignores an old activation result', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  const dialog = document.createElement('dialog');
  dialog.open = true;
  dialog.dataset['ui'] = 'gallery.videoReview.dialog';
  const host = document.createElement('div');
  dialog.append(host);
  document.body.append(dialog);
  const root = createRoot(host);
  const loaded = resource('addition-source');
  const replacement = resource('replacement-source');
  const add = vi
    .fn<ReturnType<typeof useReviewEditorState>['annotationEffects']['add']>()
    .mockResolvedValue(null);
  let current: ReturnType<typeof useReviewEditorState> | undefined;
  const trigger = () =>
    host.querySelector<HTMLButtonElement>(
      `[aria-label="${translate('gallery.videoReview.annotationEffectsAdd')}"]`
    )!;
  const selector = () =>
    host.querySelector<HTMLButtonElement>(
      `[aria-label="${translate('gallery.videoReview.annotationEffectsChoose')}"]`
    )!;
  try {
    await act(async () =>
      root.render(
        <BindingHarness
          loaded={loaded}
          onAdd={add}
          onState={(state) => {
            current = state;
          }}
        />
      )
    );
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>(
          '[data-review-header-track="annotationEffects"] [data-review-track-select]'
        )!
        .click()
    );
    await act(async () => current?.setSelection({ kind: 'range', start: 2, end: 3 }));
    await act(async () => trigger().click());
    expect(
      dialog.querySelector('[data-ui="gallery.videoReview.annotationEffectsPicker"]')
    ).toBeNull();
    expect(selector()).not.toBeNull();
    expect(selector().textContent).toContain(catalogFixture.label[getCurrentLocale()]);
    expect(
      host
        .querySelector('[data-ui="gallery.videoReview.annotationEffectsLane"]')
        ?.getAttribute('tabindex')
    ).toBe('0');
    expect(add).not.toHaveBeenCalled();
    await act(async () => selector().click());
    const choice = [...dialog.querySelectorAll<HTMLButtonElement>('[role="option"]')].find(
      (node) => node.textContent === catalogFixture.label[getCurrentLocale()]
    )!;
    expect(choice).not.toBeNull();
    await act(async () => choice.click());
    expect(add).not.toHaveBeenCalled();
    expect(loaded.session.getSnapshot().snapshot.workspace.history).toHaveLength(0);
    expect(trigger().getAttribute('aria-pressed')).toBe('true');
    let captured = false;
    const currentLane = () => {
      const node = host.querySelector<HTMLDivElement>(
        '[data-ui="gallery.videoReview.annotationEffectsLane"]'
      )!;
      vi.spyOn(node, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 200, 400, 32));
      Object.assign(node, {
        setPointerCapture: () => {
          captured = true;
        },
        hasPointerCapture: () => captured,
        releasePointerCapture: () => {
          captured = false;
        },
      });
      return node;
    };
    let lane = currentLane();
    for (const [type, x] of [
      ['pointerdown', 100],
      ['pointermove', 300],
      ['pointerup', 300],
    ] as const) {
      const event = new MouseEvent(type, { bubbles: true, clientX: x, button: 0 });
      Object.defineProperty(event, 'pointerId', { value: 1 });
      await act(async () => lane.dispatchEvent(event));
    }
    expect(add).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenLastCalledWith(
      expect.objectContaining({
        catalog: catalogFixture,
        documentId: 'title',
        start: 1,
        end: 3,
        plane: { width: 640, height: 360 },
      })
    );
    expect(selector().textContent).toContain(catalogFixture.label[getCurrentLocale()]);
    expect(loaded.session.getSnapshot().snapshot.workspace.history).toHaveLength(0);

    for (const [type, x] of [
      ['pointerdown', 100],
      ['pointermove', 300],
      ['pointerup', 300],
    ] as const) {
      const event = new MouseEvent(type, { bubbles: true, clientX: x, button: 0 });
      Object.defineProperty(event, 'pointerId', { value: 1 });
      await act(async () => lane.dispatchEvent(event));
    }
    expect(add).toHaveBeenCalledTimes(2);
    let completeOld: (id: string) => void = () => {};
    add.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          completeOld = resolve;
        })
    );
    await act(async () =>
      lane.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
      )
    );
    expect(add).toHaveBeenCalledTimes(3);
    await act(async () => trigger().click());
    await act(async () => trigger().click());
    await act(async () => selector().click());
    await act(async () => dialog.querySelector<HTMLButtonElement>('[role="option"]')!.click());
    await act(async () => completeOld('old-instance'));
    expect(trigger().getAttribute('aria-pressed')).toBe('true');
    lane = currentLane();
    expect(lane.isConnected).toBe(true);
    expect(lane.getAttribute('tabindex')).toBe('0');
    expect(selector().textContent).toContain(catalogFixture.label[getCurrentLocale()]);
    add.mockResolvedValueOnce('new-instance');
    await act(async () =>
      lane.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
      )
    );
    expect(add).toHaveBeenCalledTimes(4);
    expect(trigger().getAttribute('aria-pressed')).toBe('false');
    expect(selector()).toBeNull();
    lane = currentLane();
    await act(async () =>
      lane.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
      )
    );
    expect(add).toHaveBeenCalledTimes(4);
    await act(async () => trigger().click());
    await act(async () => selector().click());
    await act(async () => dialog.querySelector<HTMLButtonElement>('[role="option"]')!.click());
    lane = currentLane();
    for (const [type, x] of [
      ['pointerdown', 100],
      ['pointermove', 250],
    ] as const) {
      const event = new MouseEvent(type, { bubbles: true, clientX: x, button: 0 });
      Object.defineProperty(event, 'pointerId', { value: 1 });
      await act(async () => lane.dispatchEvent(event));
    }
    expect(captured).toBe(true);
    lane.focus();
    await act(async () =>
      lane.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'v', code: 'KeyV', bubbles: true, cancelable: true })
      )
    );
    expect(trigger().getAttribute('aria-pressed')).toBe('false');
    expect(selector()).toBeNull();
    expect(captured).toBe(false);
    await act(async () =>
      lane.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, clientX: 250, button: 0 }))
    );
    expect(add).toHaveBeenCalledTimes(4);
    await act(async () => trigger().click());
    expect(selector().textContent).toContain(catalogFixture.label[getCurrentLocale()]);
    await act(async () => selector().click());
    await act(async () => dialog.querySelector<HTMLButtonElement>('[role="option"]')!.click());
    const oldHash = catalogFixture.sourceSha256;
    catalogFixture.sourceSha256 = 'updated-catalog';
    await act(async () =>
      root.render(
        <BindingHarness
          loaded={loaded}
          onAdd={add}
          onState={(state) => {
            current = state;
          }}
        />
      )
    );
    expect(selector().textContent).toContain(catalogFixture.label[getCurrentLocale()]);
    expect(
      host
        .querySelector('[data-ui="gallery.videoReview.annotationEffectsLane"]')
        ?.getAttribute('tabindex')
    ).toBe('0');
    catalogFixture.sourceSha256 = oldHash;
    await act(async () =>
      root.render(
        <BindingHarness
          loaded={loaded}
          onAdd={add}
          failure="unsupported"
          onState={(state) => {
            current = state;
          }}
        />
      )
    );
    const failure = dialog.querySelector('[role="alert"]');
    expect(failure?.textContent).toBe(
      translate('gallery.videoReview.annotationEffectsUnsupported')
    );
    expect(failure?.querySelector('button')).toBeNull();
    expect(selector().disabled).toBe(false);
    expect(loaded.session.getSnapshot().snapshot.workspace.history).toHaveLength(0);
    await act(async () => selector().click());
    await act(async () => dialog.querySelector<HTMLButtonElement>('[role="option"]')!.click());
    await act(async () =>
      root.render(
        <BindingHarness
          loaded={replacement}
          onAdd={add}
          onState={(state) => {
            current = state;
          }}
        />
      )
    );
    expect(selector()).toBeNull();
    expect(trigger()).toBeNull();
    expect(loaded.session.getSnapshot().snapshot.workspace.history).toHaveLength(0);
    expect(replacement.session.getSnapshot().snapshot.workspace.history).toHaveLength(0);
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>(
          '[data-review-header-track="annotationEffects"] [data-review-track-select]'
        )!
        .click()
    );
    await act(async () => trigger().click());
    await act(async () =>
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    );
    expect(trigger().getAttribute('aria-pressed')).toBe('false');
  } finally {
    await act(async () => root.unmount());
    await loaded.session.dispose();
    await replacement.session.dispose();
    dialog.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});

it('source replacement cancels deferred pointer-up and preserves both histories', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const first = resource('first-source');
  const second = resource('second-source');
  let admission: (() => void) | undefined;
  let current: ReturnType<typeof useReviewEditorState> | undefined;
  try {
    await act(async () =>
      root.render(
        <BindingHarness
          loaded={first}
          beforeAction={(action) => {
            admission = action;
          }}
          onState={(state) => {
            current = state;
          }}
        />
      )
    );
    const block = host.querySelector<HTMLElement>('[data-annotation-effect-id="first"]')!;
    expect(block).not.toBeNull();
    let captured = false;
    Object.assign(block, {
      setPointerCapture: () => {
        captured = true;
      },
      hasPointerCapture: () => captured,
      releasePointerCapture: () => {
        captured = false;
      },
    });
    Object.assign(block.parentElement!, {
      getBoundingClientRect: () => new DOMRect(0, 0, 400, 32),
    });
    for (const [type, x] of [
      ['pointerdown', 100],
      ['pointermove', 200],
      ['pointerup', 200],
    ] as const) {
      const event = new MouseEvent(type, { bubbles: true, clientX: x, button: 0 });
      Object.defineProperty(event, 'pointerId', { value: 1 });
      await act(async () => block.dispatchEvent(event));
    }
    expect(admission).toBeDefined();
    await act(async () =>
      root.render(
        <BindingHarness
          loaded={second}
          beforeAction={(action) => {
            admission = action;
          }}
          onState={(state) => {
            current = state;
          }}
        />
      )
    );
    expect(block.isConnected).toBe(false);
    const replacement = host.querySelector('[data-annotation-effect-id="first"]');
    expect(replacement).not.toBeNull();
    expect(replacement).not.toBe(block);
    await act(async () => admission?.());
    expect(current?.activeSelection.kind).toBe('none');
    expect(first.session.getSnapshot().snapshot.workspace.history).toHaveLength(0);
    expect(second.session.getSnapshot().snapshot.workspace.history).toHaveLength(0);
  } finally {
    await act(async () => root.unmount());
    await first.session.dispose();
    await second.session.dispose();
    host.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});

it('real note completion held across pointer-up commits the annotation gesture once after admission', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const loaded = resource('source');
  let current: ReturnType<typeof useReviewEditorState> | undefined;
  let release!: () => void;
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  const originalCommit = loaded.session.commit;
  const noteCommit = vi
    .spyOn(loaded.session, 'commit')
    .mockImplementation(async (operation, consumeDraft) => {
      if (operation.target === 'annotation') await waiting;
      return originalCommit(operation, consumeDraft);
    });
  try {
    await act(async () =>
      root.render(
        <BindingHarness
          loaded={loaded}
          onState={(state) => {
            current = state;
          }}
        />
      )
    );
    await act(async () => current?.add());
    const note = current?.composer.getCurrent().annotation;
    if (!note) throw new Error('Missing new note fixture');
    await act(async () => current?.composer.change({ ...note, text: 'Pending note' }, null));
    const block = host.querySelector<HTMLElement>('[data-annotation-effect-id="first"]')!;
    let captured = false;
    Object.assign(block, {
      setPointerCapture: () => {
        captured = true;
      },
      hasPointerCapture: () => captured,
      releasePointerCapture: () => {
        captured = false;
      },
    });
    Object.assign(block.parentElement!, {
      getBoundingClientRect: () => new DOMRect(0, 0, 400, 32),
    });
    for (const [type, x] of [
      ['pointerdown', 100],
      ['pointermove', 200],
      ['pointerup', 200],
    ] as const) {
      const event = new MouseEvent(type, { bubbles: true, clientX: x, button: 0 });
      Object.defineProperty(event, 'pointerId', { value: 1 });
      await act(async () => block.dispatchEvent(event));
    }
    expect(noteCommit).toHaveBeenCalledTimes(1);
    expect(current?.busy).toBe(true);
    expect(
      loaded.session.getSnapshot().document.advancedContent.annotationEffects?.instances[0]
    ).toMatchObject({ start: 1, end: 3 });
    await act(async () => {
      release();
      await vi.waitFor(() =>
        expect(
          loaded.session.getSnapshot().document.advancedContent.annotationEffects?.instances[0]
        ).toMatchObject({ start: 2, end: 4 })
      );
    });
    const history = loaded.session.getSnapshot().snapshot.workspace.history;
    expect(history.filter((operation) => operation.target === 'annotation')).toHaveLength(1);
    expect(history.filter((operation) => operation.target === 'advancedContent')).toHaveLength(1);
  } finally {
    release();
    await act(async () => root.unmount());
    await loaded.session.dispose();
    host.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});

it('flushes the actual annotation field before the editor Save action or selection continuation', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const loaded = resource('field-save');
  const host = document.createElement('div');
  const root = createRoot(host);
  let state: ReturnType<typeof useReviewEditorState> | undefined;
  try {
    await act(async () =>
      root.render(
        <BindingHarness
          loaded={loaded}
          onState={(next) => {
            state = next;
          }}
        />
      )
    );
    let observed: string | number | undefined;
    await act(async () => {
      if (!state) throw new Error('Missing state');
      expect(state.annotationEffects.beginGesture('first')).toBe(true);
      state.annotationEffects.previewGesture({ controls: { title: 'Same-turn field' } });
      await state.run(async () => {
        observed =
          loaded.session.getSnapshot().document.advancedContent.annotationEffects?.instances[0]
            ?.controls['title'];
      });
    });
    expect(observed).toBe('Same-turn field');
    expect(loaded.session.getSnapshot().snapshot.workspace.history).toHaveLength(1);
    await act(async () => {
      if (!state) throw new Error('Missing state');
      state.annotationEffects.beginGesture('first');
      state.annotationEffects.previewGesture({ controls: { title: 'Before selection' } });
      state.setActiveSelection({ kind: 'none' });
    });
    expect(
      loaded.session.getSnapshot().document.advancedContent.annotationEffects?.instances[0]
        ?.controls['title']
    ).toBe('Before selection');
    expect(loaded.session.getSnapshot().snapshot.workspace.history).toHaveLength(2);
  } finally {
    await act(async () => root.unmount());
    await loaded.session.dispose();
    vi.unstubAllGlobals();
  }
});
it('mounted result-time lanes keep zoom changes behind the existing action admission', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  const host = document.createElement('div'),
    root = createRoot(host),
    loaded = resource('lane-source', true);
  let current: ReturnType<typeof useReviewEditorState> | undefined,
    allowed = false;
  const render = () =>
    act(async () =>
      root.render(
        <BindingHarness
          loaded={loaded}
          beforeAction={(action) => {
            if (allowed) action();
          }}
          onState={(state) => {
            current = state;
          }}
        />
      )
    );
  const toggle = () =>
    host.querySelector<HTMLButtonElement>(
      `[aria-label="${translate('gallery.videoReview.zoomEnabled')}"]`
    )!;
  try {
    await render();
    await act(async () => current!.setTrackVisibility('zoom', true));
    expect(host.querySelector('[data-ui="gallery.videoReview.audioLane"]')).not.toBeNull();
    const original = current!.advanced.zoom.enabled;
    await act(async () => toggle().click());
    expect(current!.advanced.zoom.enabled).toBe(original);
    allowed = true;
    await act(async () => toggle().click());
    expect(current!.advanced.zoom.enabled).toBe(!original);
    expect(current!.advanced.ui.tracks.zoom).toBe(true);
    expect(host.querySelector('[data-review-track="zoom"]')).not.toBeNull();
    expect(
      host.querySelector('[data-review-track="zoom"]')?.getAttribute('data-review-track-muted')
    ).toBe(String(original));
    await act(async () => current!.flushAdvanced());
    await act(async () => loaded.session.history('undo'));
    await act(async () => loaded.session.history('redo'));
    expect(current!.advanced.ui.tracks.zoom).toBe(true);
    expect(host.querySelector('[data-review-track="zoom"]')).not.toBeNull();
    await act(async () => current!.addCursorFocusKey(1));
    expect(current!.activeSelection).toMatchObject({ kind: 'cursor-focus', time: 1 });
    const key = current!.cursorFocusKeys[0]!;
    expect(key).toMatchObject({ time: 1, anchor: 'manual' });
    await act(async () => current!.selectCursorFocusKey(key.id, 1));
    expect(current!.activeSelection).toMatchObject({ kind: 'cursor-focus', id: key.id, time: 1 });
    expect(current!.selection).toEqual({ kind: 'point', time: 1 });
  } finally {
    await act(async () => root.unmount());
    loaded.session.dispose();
    host.remove();
    vi.unstubAllGlobals();
  }
});

it('admits track changes and falls back after disabling or replacing the source', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const loaded = resource('lane-source', true);
  const replacement = resource('lane-replacement');
  let current: ReturnType<typeof useReviewEditorState> | undefined;
  let continuation: (() => void) | undefined;
  let hold = false;
  const beforeAction = (action: () => void) => {
    if (hold) continuation = action;
    else action();
  };
  const render = (value = loaded) =>
    act(async () =>
      root.render(
        <BindingHarness
          loaded={value}
          beforeAction={beforeAction}
          onState={(state) => {
            current = state;
          }}
        />
      )
    );
  const select = (track: string) =>
    host.querySelector<HTMLButtonElement>(
      `[data-review-header-track="${track}"] [data-review-track-select]`
    )!;
  const annotation = () =>
    host.querySelector<HTMLButtonElement>(
      `[aria-label="${translate('gallery.videoReview.annotationEffectsAdd')}"]`
    );
  try {
    await render();
    expect(annotation()).toBeNull();
    await act(async () => select('annotationEffects').click());
    await act(async () => annotation()!.click());
    expect(annotation()?.getAttribute('aria-pressed')).toBe('true');
    hold = true;
    await act(async () => select('zoom').click());
    expect(select('annotationEffects').getAttribute('aria-pressed')).toBe('true');
    expect(annotation()?.getAttribute('aria-pressed')).toBe('true');
    await act(async () => continuation?.());
    expect(select('zoom').getAttribute('aria-pressed')).toBe('true');
    expect(annotation()).toBeNull();
    expect(loaded.session.getSnapshot().snapshot.workspace.history).toHaveLength(0);
    hold = false;
    await act(async () => current?.setTrackVisibility('zoom', false));
    expect(
      host.querySelector(`[aria-label="${translate('gallery.videoReview.cutMode')}"]`)
    ).not.toBeNull();
    await act(async () => select('annotationEffects').click());
    await render(replacement);
    expect(annotation()).toBeNull();
    expect(replacement.session.getSnapshot().snapshot.workspace.history).toHaveLength(0);
  } finally {
    await act(async () => root.unmount());
    await loaded.session.dispose();
    await replacement.session.dispose();
    host.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});
