// @vitest-environment jsdom
import { act, useContext } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { ReviewTimelineCloneScope as CloneSurface } from './timeline-clone-action';
import { ReviewTimelineBatchInspector as BatchSurface } from './timeline-batch-inspector';
import { ReviewInspectorCloneContext } from './inspector-sections';
import { ReviewTimelineMultiSelectionContext } from './selection-actions';
import {
  createQuickEditAdvancedState,
  createQuickEditAdvancedContent,
} from '../../features/video/review/advanced/defaults';
import type { ReviewEdit, ReviewSelection } from '../../features/video/review/types';
type FixtureState = ReturnType<typeof import('./use-editor-state').useReviewEditorState>;
function ReviewTimelineBatchInspector(props: { state: FixtureState; duration: number }) {
  const { state } = props;
  return (
    <BatchSurface
      document={state.snapshot.document}
      advanced={state.advanced}
      markers={state.projected.markers}
      cursorFocusPath={state.cursorFocusPath}
      cursorFocusKeys={state.cursorFocusKeys}
      busy={state.busy || state.editing.exporter.phase !== 'idle'}
      duration={props.duration}
      commands={{
        session: state.session,
        run: state.run,
        flushAdvanced: state.flushAdvanced,
        canStart: state.canStart,
        setMessage: state.setMessage,
      }}
    />
  );
}
function ReviewTimelineCloneScope(props: {
  state: FixtureState;
  duration: number;
  children: React.ReactNode;
}) {
  const { state } = props;
  return (
    <CloneSurface
      document={state.snapshot?.document ?? state.session.getSnapshot().document}
      advanced={state.advanced}
      selection={state.activeSelection}
      busy={state.busy || state.editing.exporter.phase !== 'idle'}
      duration={props.duration}
      commands={{
        session: state.session,
        run: state.run,
        flushAdvanced: state.flushAdvanced,
        canStart: state.canStart,
        setMessage: state.setMessage,
      }}
    >
      {props.children}
    </CloneSurface>
  );
}
vi.mock('../../platform/i18n', async (original) => ({
  ...(await original<typeof import('../../platform/i18n')>()),
  translate: (key: string) => key,
}));

it('copies edits through accepted history and refuses unavailable or separately owned commands', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const advanced = createQuickEditAdvancedState();
  const documentState = {
    advancedContent: createQuickEditAdvancedContent(),
    edits: [
      {
        id: 'a',
        kind: 'speed',
        start: 0,
        end: 1,
        requestedStart: 0,
        requestedEnd: 1,
        rate: 2,
        audio: 'speed',
      },
    ] as ReviewEdit[],
  };
  let admitted = true;
  const commit = vi.fn(async (operation) => {
    if (operation.target === 'edit') documentState.edits.push(operation.after);
  });
  const message = vi.fn(),
    flush = vi.fn();
  const state = {
    activeSelection: { kind: 'edit', id: 'a' } as ReviewSelection,
    advanced,
    busy: false,
    editing: { exporter: { phase: 'idle' } },
    canStart: () => admitted,
    flushAdvanced: flush,
    run: async (action: () => Promise<void>) => action(),
    session: { getSnapshot: () => ({ document: documentState }), commit },
    setMessage: message,
  } as unknown as Parameters<typeof ReviewTimelineCloneScope>[0]['state'];
  function Commands() {
    return useContext(ReviewInspectorCloneContext);
  }
  const render = (duration = 4) =>
    act(() =>
      root.render(
        <ReviewTimelineCloneScope state={state} duration={duration}>
          <Commands />
        </ReviewTimelineCloneScope>
      )
    );
  const copy = () => act(async () => host.querySelector('button')!.click());
  try {
    render();
    admitted = false;
    await copy();
    expect(commit).not.toHaveBeenCalled();
    admitted = true;
    await copy();
    expect(documentState.edits).toHaveLength(2);
    expect(documentState.edits[1]).toMatchObject({ kind: 'speed', start: 1, end: 2, rate: 2 });
    expect(documentState.edits[1]!.id).not.toBe('a');
    expect(flush).toHaveBeenCalled();
    render(1);
    await copy();
    expect(message).toHaveBeenCalledWith('gallery.videoReview.timelineSelectionCloneUnavailable');
    expect(documentState.edits).toHaveLength(2);
    for (const selection of [
      { kind: 'none' },
      { kind: 'zoom', id: 'focus' },
      { kind: 'annotation-effect', id: 'annotation' },
      { kind: 'cursor-motion', id: 'cursor' },
    ] as ReviewSelection[]) {
      state.activeSelection = selection;
      render();
      expect(host.querySelector('button')).toBeNull();
    }
  } finally {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});

it.each(['cut', 'freeze'] as const)(
  'removes a mixed %s selection and unregisters Delete on dismissal or incomplete selection',
  async (kind) => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    const advanced = createQuickEditAdvancedState();
    const documentState = {
      advancedContent: createQuickEditAdvancedContent(),
      edits: [
        kind === 'freeze'
          ? {
              id: 'a',
              kind: 'freeze',
              start: 0,
              end: 0,
              requestedStart: 0,
              requestedEnd: 0,
              duration: 2,
              frameTime: 0,
              frameDuration: 0.04,
            }
          : { id: 'a', kind: 'cut', start: 0, end: 1 },
        { id: 'b', kind: 'speed', start: 2, end: 3, rate: 2 },
      ] as ReviewEdit[],
    };
    const group = {
      keys: ['edit:a', 'edit:b'],
      clear: vi.fn(),
      captureModified: () => false,
      deleteAction: { current: null as (() => void) | null },
    };
    const commit = vi.fn(async (operation) => {
      if (operation.target === 'edit')
        documentState.edits = documentState.edits.filter((edit) => edit.id !== operation.before.id);
    });
    const state = {
      advanced,
      snapshot: { document: documentState },
      projected: { markers: [] },
      cursorFocusKeys: [],
      busy: false,
      editing: { exporter: { phase: 'idle' } },
      canStart: () => true,
      flushAdvanced: vi.fn(),
      run: async (action: () => Promise<void>) => action(),
      session: { getSnapshot: () => ({ document: documentState }), commit },
      setMessage: vi.fn(),
    } as unknown as Parameters<typeof ReviewTimelineBatchInspector>[0]['state'];
    const render = () =>
      act(() =>
        root.render(
          <ReviewTimelineMultiSelectionContext value={group}>
            <ReviewTimelineBatchInspector state={state} duration={4} />
          </ReviewTimelineMultiSelectionContext>
        )
      );
    try {
      render();
      if (kind === 'freeze')
        expect(
          host.querySelector('[aria-label="gallery.videoReview.timelineSelectionClone"]')
        ).toBeNull();
      expect(group.deleteAction.current).not.toBeNull();
      await act(async () => group.deleteAction.current!());
      expect(documentState.edits).toEqual([]);
      expect(group.clear).toHaveBeenCalledOnce();
      group.keys = ['edit:missing', 'edit:also-missing'];
      render();
      expect(group.deleteAction.current).toBeNull();
      await act(async () =>
        host
          .querySelector<HTMLButtonElement>(
            '[aria-label="gallery.videoReview.timelineSelectionClear"]'
          )!
          .click()
      );
      expect(group.clear).toHaveBeenCalledTimes(2);
    } finally {
      act(() => root.unmount());
      expect(group.deleteAction.current).toBeNull();
      host.remove();
      vi.unstubAllGlobals();
    }
  }
);

it('copies cursor groups and preserves the accepted document when space is unavailable', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const advanced = createQuickEditAdvancedState();
  advanced.cursorMotions = ['a', 'b'].map((id, index) => ({
    id,
    start: index,
    end: index + 1,
    enabled: true,
    shape: 'arrow',
    size: 48,
    color: '#000000',
    outline: '#ffffff',
    shadow: true,
    easing: 'smooth',
    points: [
      { id: `${id}:start`, at: 0, x: 0.2, y: 0.3 },
      { id: `${id}:end`, at: 1, x: 0.7, y: 0.8 },
    ],
  }));
  const documentState = {
    advancedContent: { ...createQuickEditAdvancedContent(), cursorMotions: advanced.cursorMotions },
    edits: [],
  };
  const commit = vi.fn(async (operation) => {
    documentState.advancedContent = operation.after;
  });
  const message = vi.fn();
  const group = {
    keys: ['cursor-motion:a', 'cursor-motion:b'],
    clear: vi.fn(),
    captureModified: () => false,
    deleteAction: { current: null as (() => void) | null },
  };
  const state = {
    advanced,
    snapshot: { document: documentState },
    projected: { markers: [] },
    cursorFocusKeys: [],
    editing: { exporter: { phase: 'idle' } },
    canStart: () => true,
    flushAdvanced: vi.fn(),
    run: async (action: () => Promise<void>) => action(),
    session: { getSnapshot: () => ({ document: documentState }), commit },
    setMessage: message,
  } as unknown as Parameters<typeof ReviewTimelineBatchInspector>[0]['state'];
  const render = (duration: number) =>
    act(() =>
      root.render(
        <ReviewTimelineMultiSelectionContext value={group}>
          <ReviewTimelineBatchInspector state={state} duration={duration} />
        </ReviewTimelineMultiSelectionContext>
      )
    );
  const copy = () =>
    act(async () =>
      host
        .querySelector<HTMLButtonElement>(
          '[aria-label="gallery.videoReview.timelineSelectionClone"]'
        )!
        .click()
    );
  try {
    render(2);
    await copy();
    expect(commit).not.toHaveBeenCalled();
    expect(message).toHaveBeenCalledWith('gallery.videoReview.timelineSelectionCloneUnavailable');
    render(4);
    await copy();
    expect(commit).toHaveBeenCalledOnce();
    expect(documentState.advancedContent.cursorMotions).toHaveLength(4);
    expect(advanced.cursorMotions).toHaveLength(2);
    expect(group.clear).not.toHaveBeenCalled();
  } finally {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
