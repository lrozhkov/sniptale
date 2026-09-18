// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ReviewAudioClipEditor, ReviewAudioInspectorSection } from './audio-editor';
import { createQuickEditAudioClip } from '../../features/video/review/advanced/audio';
import type { QuickEditAudioClip } from '../../features/video/review/advanced/types';

vi.mock('../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/i18n')>()),
  translate: (key: string) => key,
}));

let root: Root;
let host: HTMLDivElement;

const onPatch = vi.fn((_patch: Partial<Omit<QuickEditAudioClip, 'id' | 'assetId'>>) => undefined);
const onDelete = vi.fn();

const setValue = (input: HTMLInputElement, value: string) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
};

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  onPatch.mockClear();
  onDelete.mockClear();
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const renderEditor = (clip: QuickEditAudioClip) => {
  act(() => {
    root.render(
      <ReviewAudioClipEditor
        clip={clip}
        laneLabel="gallery.videoReview.audioMusic"
        busy={false}
        onPatch={onPatch}
        onDelete={onDelete}
      />
    );
  });
  const field = (key: string) =>
    host.querySelector<HTMLInputElement>(`[aria-label="gallery.videoReview.${key}"]`)!;
  return { field };
};

it('patches volume and fades from numeric fields', () => {
  const clip = createQuickEditAudioClip({
    id: 'a1',
    assetId: 'asset:1',
    timelineStart: 1,
    duration: 2,
    endMax: 10,
  });
  const { field } = renderEditor(clip);
  setValue(field('audioClipVolume'), '');
  expect(onPatch).not.toHaveBeenCalled();
  setValue(field('audioClipVolume'), '1.5');
  expect(onPatch).toHaveBeenCalledWith({ volume: 1.5 });
  setValue(field('audioFadeIn'), '0.5');
  expect(onPatch).toHaveBeenCalledWith({ fadeIn: 0.5 });
  setValue(field('audioFadeOut'), '0.3');
  expect(onPatch).toHaveBeenCalledWith({ fadeOut: 0.3 });
});

it('toggles mute and deletes the clip', async () => {
  const clip = createQuickEditAudioClip({
    id: 'a1',
    assetId: 'asset:1',
    timelineStart: 1,
    duration: 2,
    endMax: 10,
  });
  renderEditor(clip);
  const mute = host.querySelector<HTMLButtonElement>(
    '[aria-label="gallery.videoReview.audioClipMute"]'
  )!;
  expect(mute.getAttribute('aria-pressed')).toBe('false');
  await act(async () => mute.click());
  expect(onPatch).toHaveBeenCalledWith({ muted: true });
  await act(async () =>
    host
      .querySelector<HTMLButtonElement>('[aria-label="gallery.videoReview.audioClipDelete"]')!
      .click()
  );
  expect(onDelete).toHaveBeenCalled();
});

it('binds the inspector section to the hook selection and lane labels', async () => {
  const clip = createQuickEditAudioClip({
    id: 'a1',
    assetId: 'asset:1',
    timelineStart: 1,
    duration: 2,
    endMax: 10,
  });
  const patchClip = vi.fn();
  const removeClip = vi.fn();
  const audio = { selected: { lane: 'voiceover' as const, clip }, patchClip, removeClip };
  act(() => {
    root.render(<ReviewAudioInspectorSection audio={audio as never} busy={false} />);
  });
  const editor = host.querySelector('[data-ui="gallery.videoReview.audioInspector"]')!;
  expect(editor!.textContent).toContain('gallery.videoReview.audioVoiceover');
  await act(async () =>
    host
      .querySelector<HTMLButtonElement>('[aria-label="gallery.videoReview.audioClipMute"]')!
      .click()
  );
  expect(patchClip).toHaveBeenCalledWith('voiceover', 'a1', { muted: true });
  await act(async () =>
    host
      .querySelector<HTMLButtonElement>('[aria-label="gallery.videoReview.audioClipDelete"]')!
      .click()
  );
  expect(removeClip).toHaveBeenCalledWith('voiceover', 'a1');
  const musicAudio = { selected: { lane: 'music' as const, clip }, patchClip, removeClip };
  act(() => root.render(<ReviewAudioInspectorSection audio={musicAudio as never} busy={false} />));
  expect(
    host.querySelector('[data-ui="gallery.videoReview.audioInspector"]')!.textContent
  ).toContain('gallery.videoReview.audioMusic');
  act(() =>
    root.render(<ReviewAudioInspectorSection audio={{ selected: null } as never} busy={false} />)
  );
  expect(host.querySelector('[data-ui="gallery.videoReview.audioInspector"]')).toBeNull();
});
