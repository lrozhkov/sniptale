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
function click(label: string, owner: ParentNode = host) {
  const button = [...owner.querySelectorAll<HTMLButtonElement>('button')].find(
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
  const seed = useVideoEditorStore.getState().project!;
  useVideoEditorStore.getState().setProject({
    ...seed,
    version: 41,
    bookendPresets: {
      intro: {
        mode: 'none',
        edgeControl: {
          mode: 'media',
          plain: { enabled: true, duration: 1.2 },
          media: { enabled: true, duration: 0.3 },
        },
      },
      outro: { mode: 'none' },
    },
  });
  const stale = useVideoEditorStore.getState().project!;
  useVideoEditorStore.getState().setProject(structuredClone(stale));
  const accepted = useVideoEditorStore.getState().project!;
  act(() => root.render(<SceneEdgesFields project={stale} runtime={{ onPreview }} />));
  click('gallery.videoReview.presentationFadeIn');
  expect(useVideoEditorStore.getState().project).toBe(accepted);
  expect(accepted.sceneEdges).toBeUndefined();
  expect(accepted.bookendPresets).toEqual(stale.bookendPresets);
  expect(host.querySelector('[role="alert"]')).not.toBeNull();
  expect(useVideoEditorStore.getState().projectHistory.past).toHaveLength(0);
  mount();
  click('gallery.videoReview.presentationFadeIn');
  expect(useVideoEditorStore.getState().project!.sceneEdges!.intro.enabled).toBe(true);
  expect(useVideoEditorStore.getState().project!.sceneEdges!.intro.duration).toBe(1.2);
  expect(
    useVideoEditorStore.getState().project!.bookendPresets!.intro.edgeControl!.media.duration
  ).toBe(0.3);
  expect(useVideoEditorStore.getState().projectHistory.past).toHaveLength(1);
});

it('preserves a foreign history lease and retries after its owner ends it', () => {
  const seed = useVideoEditorStore.getState().project!;
  useVideoEditorStore.getState().setProject({
    ...seed,
    version: 41,
    bookendPresets: {
      intro: { mode: 'none' },
      outro: {
        mode: 'none',
        edgeControl: {
          mode: 'media',
          plain: { enabled: true, duration: 0.8 },
          media: { enabled: false, duration: 3.4 },
        },
      },
    },
  });
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
  expect(useVideoEditorStore.getState().project!.sceneEdges!.outro.duration).toBe(0.8);
  expect(
    useVideoEditorStore.getState().project!.bookendPresets!.outro.edgeControl!.media.duration
  ).toBe(3.4);
});

it.each(['intro', 'outro'] as const)(
  'restores the retained %s plain fade and edits it without changing the media recipe or clips',
  (side) => {
    const project = useVideoEditorStore.getState().project!;
    const plain = { enabled: true, duration: 1.2, color: '#112233ff', audioFade: false };
    const media = { enabled: true, duration: 0.3, color: '#445566ff', audioFade: true };
    const edges = {
      intro: { enabled: false, duration: 0.4 },
      outro: { enabled: false, duration: 0.4 },
      [side]: media,
    };
    const presets = {
      intro: { mode: 'none' as const },
      outro: { mode: 'none' as const },
      [side]: { mode: 'none' as const, edgeControl: { mode: 'media' as const, plain, media } },
    };
    act(() =>
      useVideoEditorStore
        .getState()
        .setProject({ ...project, version: 41, sceneEdges: edges, bookendPresets: presets })
    );
    mount();
    const controls = host
      .querySelector(`[data-ui="video-editor.scene-bookends.${side}"]`)!
      .closest('details')!;
    const active = useVideoEditorStore.getState();
    click(
      side === 'intro'
        ? 'gallery.videoReview.presentationFadeIn'
        : 'gallery.videoReview.presentationFadeOut',
      controls
    );
    expect(useVideoEditorStore.getState().project).toBe(active.project);
    expect(useVideoEditorStore.getState().projectHistory).toBe(active.projectHistory);
    duration('0.3');
    expect(useVideoEditorStore.getState().project).toBe(active.project);
    expect(useVideoEditorStore.getState().project!.bookendPresets).toEqual(presets);
    click('gallery.videoReview.presentationNoEffect', controls);
    expect(useVideoEditorStore.getState().project!.bookendPresets).toEqual(presets);
    click(
      side === 'intro'
        ? 'gallery.videoReview.presentationFadeIn'
        : 'gallery.videoReview.presentationFadeOut',
      controls
    );
    const restored = useVideoEditorStore.getState().project!;
    expect(restored.sceneEdges![side]).toEqual(plain);
    expect(restored.bookendPresets![side].edgeControl).toEqual({ mode: 'media', plain, media });
    expect(restored.clips).toEqual(project.clips);
    duration('2');
    const edited = useVideoEditorStore.getState().project!;
    expect(edited.sceneEdges![side].duration).toBe(2);
    expect(edited.bookendPresets![side].edgeControl!.plain).toEqual({ ...plain, duration: 2 });
    expect(edited.bookendPresets![side].edgeControl!.media).toEqual(media);
    expect(edited.clips).toEqual(project.clips);
    act(() => useVideoEditorStore.getState().undoProject());
    expect(useVideoEditorStore.getState().project!.sceneEdges![side]).toEqual(plain);
    expect(
      useVideoEditorStore.getState().project!.bookendPresets![side].edgeControl!.plain
    ).toEqual(plain);
    act(() => useVideoEditorStore.getState().redoProject());
    expect(useVideoEditorStore.getState().project!.sceneEdges![side].duration).toBe(2);
    expect(
      useVideoEditorStore.getState().project!.bookendPresets![side].edgeControl!.plain.duration
    ).toBe(2);
    click('gallery.videoReview.presentationNoEffect', controls);
    click(
      side === 'intro'
        ? 'gallery.videoReview.presentationFadeIn'
        : 'gallery.videoReview.presentationFadeOut',
      controls
    );
    expect(useVideoEditorStore.getState().project!.sceneEdges![side].duration).toBe(2);
  }
);
