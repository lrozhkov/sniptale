// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createVideoProjectFromRecording } from '../../../../../features/video/project/factories/creation';
import { createCanvasComment } from '../../../../../features/video/review/comments';
import { useVideoEditorStore } from '../../../../state/store';
import { InspectProjectCommentsPanel } from './comments';
import { InspectCommentPanel } from './comment';

vi.mock('../../../../../platform/i18n', async (original) => ({
  ...(await original<typeof import('../../../../../platform/i18n')>()),
  translate: (key: string) => key,
  useAppLocale: () => 'en',
  getCurrentLocale: () => 'en',
}));
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let initial: ReturnType<typeof useVideoEditorStore.getState>;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  initial = useVideoEditorStore.getState();
  useVideoEditorStore.getState().setProject(
    createVideoProjectFromRecording({
      recordingId: 'notes',
      filename: 'video.webm',
      width: 640,
      height: 360,
      duration: 10,
      mimeType: 'video/webm',
      size: 100,
    })
  );
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
  const selection = useVideoEditorStore((state) => state.selection);
  return project ? (
    selection.kind === 'comment' ? (
      <InspectCommentPanel
        key={JSON.stringify(selection)}
        project={project}
        selection={selection}
      />
    ) : (
      <InspectProjectCommentsPanel project={project} />
    )
  ) : null;
}
function mount() {
  act(() => root.render(<Harness />));
}
function click(label: string) {
  const button = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
    (node) => node.getAttribute('aria-label') === label || node.textContent === label
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
function entry() {
  return useVideoEditorStore.getState().project!.commentDocuments![0]!;
}

it('creates and selects a note, groups typing into one Undo step, and retains empty editable notes', () => {
  mount();
  click('videoEditor.sidebar.commentAddNote');
  expect(useVideoEditorStore.getState().selection.kind).toBe('comment');
  const field = host.querySelector('textarea')!;
  act(() => field.focus());
  type('One');
  type('One two');
  act(() => field.blur());
  expect(entry().annotations[0]!.text).toBe('One two');
  expect(useVideoEditorStore.getState().projectHistory.past).toHaveLength(2);
  act(() => useVideoEditorStore.getState().undoProject());
  expect(entry().annotations[0]!.text).toBe('');
  act(() => useVideoEditorStore.getState().redoProject());
  expect(entry().annotations[0]!.text).toBe('One two');
  click('videoEditor.sidebar.commentBack');
  expect(host.querySelector('[data-ui="video-editor.comments.panel"]')).not.toBeNull();
  click('One two');
  expect(host.querySelector('textarea')!.value).toBe('One two');
});

it('keeps refused input for repair without ending a foreign history transaction', () => {
  mount();
  click('videoEditor.sidebar.commentAddNote');
  const foreign = useVideoEditorStore.getState().beginProjectHistoryTransaction();
  if (!foreign) throw new Error('Expected foreign transaction');
  type('Retry text');
  expect(entry().annotations[0]!.text).toBe('');
  expect(host.querySelector('textarea')!.value).toBe('Retry text');
  expect(host.querySelector('[role="alert"]')).not.toBeNull();
  act(() => host.querySelector('textarea')!.blur());
  expect(useVideoEditorStore.getState().isProjectHistoryTransactionCurrent(foreign)).toBe(true);
  act(() => useVideoEditorStore.getState().endProjectHistoryTransaction(foreign));
  type('Retry text accepted');
  act(() => host.querySelector('textarea')!.blur());
  expect(entry().annotations[0]!.text).toBe('Retry text accepted');
});

it('keeps retired on-video note commands and canvas comments absent', () => {
  const project = useVideoEditorStore.getState().project!;
  useVideoEditorStore.getState().setProject({
    ...project,
    version: 23,
    commentDocuments: [
      {
        id: 'doc',
        binding: { kind: 'project' },
        annotations: [{ id: 'note', text: 'Note only', anchor: { kind: 'point', time: 2 } }],
        canvasComments: [createCanvasComment({ id: 'legacy-bubble', annotationId: 'note' })],
      },
    ],
  });
  mount();
  expect(host.textContent).not.toContain('gallery.videoReview.addOverlayComment');
  expect(host.textContent).not.toContain('gallery.videoReview.overlayPoint');
  click('Note only');
  click('videoEditor.sidebar.actionsTitle');
  expect(host.textContent).not.toContain('gallery.videoReview.showOnVideo');
  expect(host.querySelector('[data-ui="gallery.videoReview.canvasCommentEditor"]')).toBeNull();
  expect(useVideoEditorStore.getState().project!.commentDocuments![0]!.canvasComments).toHaveLength(
    1
  );
});

it('protects locked source documents and clears a removed selection without deleting a clip', () => {
  const project = useVideoEditorStore.getState().project!;
  const clip = project.clips.find((clip) => clip.type === 'VIDEO')!;
  useVideoEditorStore.getState().addCommentDocument(project, {
    id: 'doc',
    target: { kind: 'source', clipId: clip.id },
    note: { id: 'note', text: 'Source note', anchor: { kind: 'point', time: 2 } },
  });
  useVideoEditorStore.getState().selectComment('doc', 'note');
  mount();
  act(() =>
    useVideoEditorStore.getState().updateProject((project) => ({
      ...project,
      tracks: project.tracks.map((track) => ({ ...track, locked: true })),
    }))
  );
  expect(host.querySelector('textarea')!.disabled).toBe(true);
  expect(
    host.querySelector('nav [aria-label="videoEditor.sidebar.commentSourceTime"]')
  ).not.toBeNull();
  const count = useVideoEditorStore.getState().project!.clips.length;
  act(() =>
    useVideoEditorStore.getState().updateProject((project) => ({
      ...project,
      tracks: project.tracks.map((track) => ({ ...track, locked: false })),
    }))
  );
  click('videoEditor.sidebar.actionsTitle');
  click('gallery.videoReview.deleteComment');
  expect(useVideoEditorStore.getState().selection.kind).toBe('scene');
  expect(entry().annotations).toHaveLength(0);
  expect(useVideoEditorStore.getState().project!.clips).toHaveLength(count);
});

function numeric(label: string, value: string) {
  const field = host.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
  if (!field) throw new Error(`Missing field: ${label}`);
  act(() => field.focus());
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(field, value);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
  act(() => field.blur());
}

it('edits point and range timing through controls and clamps project bounds', () => {
  mount();
  click('videoEditor.sidebar.commentAddNote');
  click('videoEditor.sidebar.inspectorGroupTiming');
  numeric('gallery.videoReview.textFragmentStart', '2');
  expect(entry().annotations[0]!.anchor).toEqual({ kind: 'point', time: 2 });
  click('videoEditor.sidebar.commentRange');
  expect(entry().annotations[0]!.anchor).toEqual({ kind: 'range', start: 2, end: 3 });
  numeric('gallery.videoReview.textFragmentEnd', '99');
  expect(entry().annotations[0]!.anchor).toEqual({ kind: 'range', start: 2, end: 10 });
  numeric('gallery.videoReview.textFragmentStart', '4');
  expect(entry().annotations[0]!.anchor).toEqual({ kind: 'range', start: 4, end: 10 });
  click('videoEditor.sidebar.commentPoint');
  expect(entry().annotations[0]!.anchor).toEqual({ kind: 'point', time: 4 });
});

it('adds to the existing clock and removes its complete document through the manager', () => {
  mount();
  click('videoEditor.sidebar.commentAddNote');
  click('videoEditor.sidebar.commentBack');
  act(() => useVideoEditorStore.getState().setCurrentTime(6));
  click('videoEditor.sidebar.commentAddNote');
  expect(useVideoEditorStore.getState().project!.commentDocuments).toHaveLength(1);
  expect(entry().annotations).toHaveLength(2);
  expect(entry().annotations[1]!.anchor).toEqual({ kind: 'point', time: 6 });
  click('videoEditor.sidebar.commentBack');
  click('videoEditor.sidebar.commentDeleteDocument');
  expect(useVideoEditorStore.getState().project!.commentDocuments).toEqual([]);
});

it('adds source notes in source time after rate and placement changes, including a dormant clock', async () => {
  const project = useVideoEditorStore.getState().project!;
  const clip = project.clips.find((clip) => clip.type === 'VIDEO')!;
  useVideoEditorStore.getState().addCommentDocument(project, {
    id: 'source-doc',
    target: { kind: 'source', clipId: clip.id },
    note: { id: 'first', text: 'Source', anchor: { kind: 'point', time: 2 } },
  });
  useVideoEditorStore.getState().updateProject((project) => ({
    ...project,
    clips: project.clips.map((item) =>
      item.id === clip.id
        ? {
            ...item,
            startTime: 2,
            sourceStart: 4,
            duration: 2,
            sourceDuration: 4,
            playbackRate: 2,
          }
        : item
    ),
  }));
  useVideoEditorStore.getState().setCurrentTime(3);
  mount();
  click('videoEditor.sidebar.commentDestination');
  const option = [...document.querySelectorAll<HTMLButtonElement>('[role="option"]')].find((node) =>
    node.textContent?.includes('video.webm')
  )!;
  await act(async () => option.click());
  click('videoEditor.sidebar.commentAddNote');
  expect(entry().annotations[1]!.anchor).toEqual({ kind: 'point', time: 6 });
  click('videoEditor.sidebar.commentSourceTime');
  click('videoEditor.sidebar.commentRange');
  expect(entry().annotations[1]!.anchor).toEqual({ kind: 'range', start: 6, end: 7 });
  click('videoEditor.sidebar.commentBack');
  act(() => useVideoEditorStore.getState().updateProject((project) => ({ ...project, clips: [] })));
  click('videoEditor.sidebar.commentDestination');
  await act(async () =>
    [...document.querySelectorAll<HTMLButtonElement>('[role="option"]')]
      .find((node) => node.textContent?.includes('video.webm'))!
      .click()
  );
  click('videoEditor.sidebar.commentAddNote');
  expect(entry().annotations[2]!.anchor).toEqual({ kind: 'point', time: 0 });
});
