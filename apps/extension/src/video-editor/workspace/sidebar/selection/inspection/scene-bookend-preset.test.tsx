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
