// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  createVideoProjectFromRecording,
  createVideoProjectAsset,
} from '../../../../../features/video/project/factories/creation';
import { useVideoEditorStore } from '../../../../state/store';
import { SceneBookendPreset } from './scene-bookend-preset';

vi.mock('./scene-bookend-preview', () => ({
  SceneBookendPreview: () => <div data-testid="source-preview" />,
}));
vi.mock('../../../../../platform/i18n', async (original) => ({
  ...(await original<typeof import('../../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let initial: ReturnType<typeof useVideoEditorStore.getState>;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
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
  project.assets.push(
    createVideoProjectAsset(
      'Card',
      'IMAGE',
      { kind: 'project-asset', projectAssetId: 'card-bytes' },
      {
        width: 321,
        height: 181,
        duration: null,
        mimeType: 'image/png',
        size: 100,
        hasAudio: false,
        audioPeaks: null,
      }
    )
  );
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
  return project && <SceneBookendPreset project={project} side="intro" />;
}
function click(text: string) {
  const target = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.textContent === text || button.getAttribute('aria-label') === text
  );
  if (!target) throw new Error(`Missing ${text}`);
  act(() => target.click());
}
function render() {
  act(() => root.render(<Harness />));
}

it('keeps an empty kind selection disposable until a material is chosen', () => {
  render();
  const before = useVideoEditorStore.getState();
  click('gallery.videoReview.presentationImage');
  click('videoEditor.sidebar.bookendChooseImage');
  expect(
    [...document.querySelectorAll('[role="menuitem"]')].map((item) => item.textContent)
  ).toEqual(['Card']);
  const item = document.querySelector('[role="menuitem"]')!;
  act(() =>
    item.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    )
  );
  expect(document.querySelector('[role="menu"]')).toBeNull();
  expect(useVideoEditorStore.getState().project).toBe(before.project);
  expect(useVideoEditorStore.getState().projectHistory).toBe(before.projectHistory);
});

it('retains both variants through mode changes and commits framing without editing timeline instances', () => {
  render();
  const before = useVideoEditorStore.getState().project!;
  click('gallery.videoReview.presentationImage');
  click('videoEditor.sidebar.bookendChooseImage');
  click('Card');
  const image = useVideoEditorStore.getState().project!.bookendPresets!.intro.image!;
  expect(image.duration).toBe(3);
  click('gallery.videoReview.presentationCover');
  expect(useVideoEditorStore.getState().project!.bookendPresets!.intro.image?.fit).toBe('cover');
  click('gallery.videoReview.presentationVideo');
  click('videoEditor.sidebar.bookendChooseVideo');
  click('Source.webm');
  expect(useVideoEditorStore.getState().project!.bookendPresets!.intro).toMatchObject({
    mode: 'video',
    image: { fit: 'cover' },
    video: { trim: { start: 0, end: 6 } },
  });
  click('gallery.videoReview.presentationNone');
  const current = useVideoEditorStore.getState().project!;
  expect(current.bookendPresets!.intro).toMatchObject({
    mode: 'none',
    image: { fit: 'cover' },
    video: { trim: { end: 6 } },
  });
  expect(current.clips).toEqual(before.clips);
  expect(current.assets).toEqual(before.assets);
  expect(host.querySelector('[data-testid="source-preview"]')).toBeNull();
});

it('refuses a foreign history lease and preserves the accepted recipe for retry', () => {
  render();
  click('gallery.videoReview.presentationImage');
  click('videoEditor.sidebar.bookendChooseImage');
  click('Card');
  let lease: symbol | null = null;
  act(() => {
    lease = useVideoEditorStore.getState().beginProjectHistoryTransaction({ onlyIfIdle: true });
  });
  const before = useVideoEditorStore.getState();
  click('gallery.videoReview.presentationNone');
  expect(useVideoEditorStore.getState().project).toBe(before.project);
  expect(host.querySelector('[role="alert"]')).not.toBeNull();
  if (!lease) throw new Error('Expected lease');
  act(() => useVideoEditorStore.getState().endProjectHistoryTransaction(lease!));
  click('gallery.videoReview.presentationNone');
  expect(useVideoEditorStore.getState().project!.bookendPresets!.intro.mode).toBe('none');
  expect(host.querySelector('[role="alert"]')).toBeNull();
});

it('authors a future join recipe without changing existing instances or timeline clips', () => {
  render();
  click('gallery.videoReview.presentationImage');
  click('videoEditor.sidebar.bookendChooseImage');
  click('Card');
  const project = useVideoEditorStore.getState().project!;
  const clip = project.clips.find((item) => item.type === 'VIDEO')!;
  act(() =>
    useVideoEditorStore.getState().setProject({
      ...project,
      version: 26,
      compositionJoins: [
        {
          id: 'existing',
          clipId: clip.id,
          edge: 'start',
          transition: { type: 'dissolve', before: 0.1, after: 0.3 },
        },
      ],
    })
  );
  const before = useVideoEditorStore.getState();
  click('gallery.videoReview.cutFadeColor');
  const after = useVideoEditorStore.getState();
  expect(after.project!.bookendPresets!.introTransition).toEqual({
    type: 'fade-black',
    before: 0.2,
    after: 0.2,
  });
  expect(after.project!.version).toBe(26);
  expect(after.project!.compositionJoins).toEqual(before.project!.compositionJoins);
  expect(after.project!.clips).toEqual(before.project!.clips);
  expect(after.projectHistory.past).toHaveLength(before.projectHistory.past.length + 1);
  click('gallery.videoReview.transitionNone');
  expect(useVideoEditorStore.getState().project!.bookendPresets!.introTransition).toBeUndefined();
  expect(useVideoEditorStore.getState().project!.compositionJoins).toEqual(
    before.project!.compositionJoins
  );
});

it('edits a retained media fade without changing current clips, scene edges or its plain recipe', () => {
  render();
  click('gallery.videoReview.presentationImage');
  click('videoEditor.sidebar.bookendChooseImage');
  click('Card');
  const before = useVideoEditorStore.getState().project!;
  click('gallery.videoReview.presentationFadeIn');
  const enabled = useVideoEditorStore.getState().project!;
  expect(enabled.bookendPresets!.intro.edgeControl?.media.enabled).toBe(true);
  expect(enabled.clips).toEqual(before.clips);
  expect(enabled.sceneEdges).toEqual(before.sceneEdges);
  const plain = enabled.bookendPresets!.intro.edgeControl!.plain;
  click('gallery.videoReview.presentationAudioFade');
  const after = useVideoEditorStore.getState().project!;
  expect(after.bookendPresets!.intro.edgeControl?.media.audioFade).toBe(true);
  expect(after.bookendPresets!.intro.edgeControl?.plain).toEqual(plain);
  click('gallery.videoReview.presentationNone');
  click('gallery.videoReview.presentationImage');
  expect(useVideoEditorStore.getState().project!.bookendPresets!.intro.edgeControl).toEqual(
    after.bookendPresets!.intro.edgeControl
  );
});

it('shows the inherited active edge for a Native preset without an independent fade recipe', () => {
  const project = useVideoEditorStore.getState().project!;
  const fade = { enabled: true, duration: 0.7, color: '#112233ff', audioFade: true };
  act(() =>
    useVideoEditorStore.getState().setProject({
      ...project,
      version: 24,
      sceneEdges: { intro: fade, outro: { enabled: false, duration: 0.4 } },
    })
  );
  render();
  click('gallery.videoReview.presentationImage');
  click('videoEditor.sidebar.bookendChooseImage');
  click('Card');
  const control = host.querySelector(
    '[role="switch"][aria-label="gallery.videoReview.presentationFadeIn"]'
  );
  expect(control?.getAttribute('aria-checked')).toBe('true');
  expect(useVideoEditorStore.getState().project!.bookendPresets!.intro.edgeControl).toBeUndefined();
  click('gallery.videoReview.presentationAudioFade');
  const current = useVideoEditorStore.getState().project!;
  expect(current.bookendPresets!.intro.edgeControl?.plain).toEqual(fade);
  expect(current.bookendPresets!.intro.edgeControl?.media).toEqual({ ...fade, audioFade: false });
  expect(current.sceneEdges!.intro).toEqual(fade);
});
