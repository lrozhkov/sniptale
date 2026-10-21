// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createVideoProjectFromRecording } from '../../../../../features/video/project/factories/creation';
import { useVideoEditorStore } from '../../../../state/store';
import { SceneJoinFields } from './scene-joins';

vi.mock('../../../../../platform/i18n', async (original) => ({
  ...(await original<typeof import('../../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let initial: ReturnType<typeof useVideoEditorStore.getState>;
const preview = vi.fn();
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  preview.mockClear();
  initial = useVideoEditorStore.getState();
  const project = createVideoProjectFromRecording({
    recordingId: 'recording',
    filename: 'Source.webm',
    width: 640,
    height: 360,
    duration: 6,
    size: 100,
    mimeType: 'video/webm',
  });
  const anchor = project.clips.find((clip) => clip.type === 'VIDEO')!;
  project.version = 26;
  project.duration = 8;
  project.compositionJoins = [{ id: 'join', clipId: anchor.id, edge: 'end' }];
  useVideoEditorStore.getState().setProject(project);
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
  return project && <SceneJoinFields project={project} runtime={{ onPreview: preview }} />;
}
function render() {
  act(() => root.render(<Harness />));
}
function click(label: string) {
  const button = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
    (item) => item.getAttribute('aria-label') === label || item.textContent === label
  );
  if (!button) throw new Error(`Missing ${label}`);
  act(() => button.click());
}
it('edits the exact instance in one history step, keeps None as a boundary and leaves its recipe unchanged', () => {
  render();
  const before = useVideoEditorStore.getState();
  click('gallery.videoReview.cutDissolve');
  const after = useVideoEditorStore.getState();
  expect(after.project!.compositionJoins![0]).toMatchObject({
    id: 'join',
    transition: { type: 'dissolve', before: 0.2, after: 0.2 },
  });
  expect(after.project!.clips).toEqual(before.project!.clips);
  expect(after.project!.bookendPresets).toEqual(before.project!.bookendPresets);
  expect(after.projectHistory.past).toHaveLength(before.projectHistory.past.length + 1);
  click('gallery.videoReview.transitionNone');
  expect(useVideoEditorStore.getState().project!.compositionJoins).toEqual(
    before.project!.compositionJoins
  );
  expect(preview).toHaveBeenLastCalledWith(null);
});
it('seeks the actual clip edge after a move without changing selection or history', () => {
  render();
  const before = useVideoEditorStore.getState();
  click('videoEditor.sidebar.compositionJoinSeek');
  expect(useVideoEditorStore.getState().currentTime).toBe(6);
  const moved = {
    ...before.project!,
    clips: before.project!.clips.map((clip) => ({ ...clip, startTime: 1 })),
  };
  act(() => useVideoEditorStore.getState().setProject(moved));
  const current = useVideoEditorStore.getState();
  click('videoEditor.sidebar.compositionJoinSeek');
  expect(useVideoEditorStore.getState().currentTime).toBe(7);
  expect(useVideoEditorStore.getState().selection).toBe(current.selection);
  expect(useVideoEditorStore.getState().projectHistory).toBe(current.projectHistory);
});
it('refuses a foreign history lease, keeps accepted state and supports retry', () => {
  render();
  let lease: symbol | null = null;
  act(() => {
    lease = useVideoEditorStore.getState().beginProjectHistoryTransaction({ onlyIfIdle: true });
  });
  const before = useVideoEditorStore.getState();
  click('gallery.videoReview.cutFadeColor');
  expect(useVideoEditorStore.getState().project).toBe(before.project);
  expect(host.querySelector('[role="alert"]')).not.toBeNull();
  if (!lease) throw new Error('Missing lease');
  act(() => useVideoEditorStore.getState().endProjectHistoryTransaction(lease!));
  click('gallery.videoReview.cutFadeColor');
  expect(useVideoEditorStore.getState().project!.compositionJoins![0]!.transition!.type).toBe(
    'fade-black'
  );
  expect(host.querySelector('[role="alert"]')).toBeNull();
});
it('clears the disposable preview on project replacement and panel unmount', () => {
  render();
  act(() =>
    useVideoEditorStore
      .getState()
      .setProject(structuredClone(useVideoEditorStore.getState().project!))
  );
  expect(preview).toHaveBeenLastCalledWith(null);
  preview.mockClear();
  act(() => root.render(null));
  expect(preview).toHaveBeenLastCalledWith(null);
});
