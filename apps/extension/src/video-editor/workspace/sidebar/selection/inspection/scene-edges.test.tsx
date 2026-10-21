// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createVideoProjectFromRecording } from '../../../../../features/video/project/factories/creation';
import { useVideoEditorStore } from '../../../../state/store';
import { SceneEdgesFields } from './scene-edges';

vi.mock('../../../../../platform/i18n', async (original) => ({
  ...(await original<typeof import('../../../../../platform/i18n')>()),
  translate: (key: string) => key,
  useAppLocale: () => 'en',
}));
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let initial: ReturnType<typeof useVideoEditorStore.getState>;
const onPreview = vi.fn();
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  initial = useVideoEditorStore.getState();
  onPreview.mockClear();
  useVideoEditorStore.getState().setProject(
    createVideoProjectFromRecording({
      recordingId: 'edges',
      filename: 'source.webm',
      width: 640,
      height: 360,
      duration: 10,
      mimeType: 'video/webm',
      size: 100,
    })
  );
  useVideoEditorStore.getState().selectScene();
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
  const project = useVideoEditorStore((state) => state.project)!;
  return <SceneEdgesFields project={project} runtime={{ onPreview }} />;
}
function mount() {
  act(() => root.render(<Harness />));
}
function click(label: string) {
  const button = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
    (node) => node.getAttribute('aria-label') === label || node.textContent === label
  );
  if (!button) throw new Error(`Missing button ${label}`);
  act(() => button.click());
}
function duration(value: string) {
  const input = host.querySelector<HTMLInputElement>(
    'input[aria-label="gallery.videoReview.presentationDuration"]'
  )!;
  act(() => input.focus());
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  });
  act(() => input.blur());
}

it('authors independent dormant scene edges through history without changing clips', () => {
  const clips = structuredClone(useVideoEditorStore.getState().project!.clips);
  mount();
  expect(useVideoEditorStore.getState().project!.sceneEdges).toBeUndefined();
  expect(useVideoEditorStore.getState().projectHistory.past).toHaveLength(0);
  click('gallery.videoReview.presentationFadeIn');
  expect(useVideoEditorStore.getState().project!.version).toBe(24);
  expect(useVideoEditorStore.getState().projectHistory.past).toHaveLength(1);
  duration('2');
  expect(useVideoEditorStore.getState().project!.sceneEdges!.intro.duration).toBe(2);
  act(() => host.querySelector<HTMLButtonElement>('[role="switch"]')!.click());
  expect(useVideoEditorStore.getState().project!.sceneEdges!.intro.audioFade).toBe(true);
  click('gallery.videoReview.presentationNoEffect');
  const current = useVideoEditorStore.getState().project!;
  expect(current.sceneEdges!.intro).toEqual({ enabled: false, duration: 2, audioFade: true });
  expect(current.clips).toEqual(clips);
  act(() => useVideoEditorStore.getState().undoProject());
  expect(useVideoEditorStore.getState().project!.sceneEdges!.intro.enabled).toBe(true);
  act(() => useVideoEditorStore.getState().redoProject());
  expect(useVideoEditorStore.getState().project!.sceneEdges!.intro.enabled).toBe(false);
  expect(useVideoEditorStore.getState().project!.sceneEdges!.outro.enabled).toBe(false);
});

it('refuses stale same-id roots and accepts a fresh retry without history loss', () => {
  const stale = useVideoEditorStore.getState().project!;
  useVideoEditorStore.getState().setProject(structuredClone(stale));
  const accepted = useVideoEditorStore.getState().project!;
  act(() => root.render(<SceneEdgesFields project={stale} runtime={{ onPreview }} />));
  click('gallery.videoReview.presentationFadeIn');
  expect(useVideoEditorStore.getState().project).toBe(accepted);
  expect(accepted.sceneEdges).toBeUndefined();
  expect(host.querySelector('[role="alert"]')).not.toBeNull();
  expect(useVideoEditorStore.getState().projectHistory.past).toHaveLength(0);
  mount();
  click('gallery.videoReview.presentationFadeIn');
  expect(useVideoEditorStore.getState().project!.sceneEdges!.intro.enabled).toBe(true);
  expect(useVideoEditorStore.getState().projectHistory.past).toHaveLength(1);
});

it('preserves a foreign history lease and retries after its owner ends it', () => {
  mount();
  const accepted = useVideoEditorStore.getState().project;
  const lease = useVideoEditorStore.getState().beginProjectHistoryTransaction();
  if (!lease) throw new Error('Expected transaction');
  click('gallery.videoReview.presentationFadeOut');
  expect(useVideoEditorStore.getState().project).toBe(accepted);
  expect(useVideoEditorStore.getState().isProjectHistoryTransactionCurrent(lease)).toBe(true);
  expect(host.querySelector('[role="alert"]')).not.toBeNull();
  act(() => useVideoEditorStore.getState().endProjectHistoryTransaction(lease));
  click('gallery.videoReview.presentationFadeOut');
  expect(useVideoEditorStore.getState().project!.sceneEdges!.outro.enabled).toBe(true);
});
