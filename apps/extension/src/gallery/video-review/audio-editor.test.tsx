// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AudioTakeLevelFields } from '../../ui/audio/take-fields';
import { ReviewOriginalAudioInspector } from './original-audio-inspector';
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
      <ReviewAudioClipEditor clip={clip} busy={false} onPatch={onPatch} onDelete={onDelete} />
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
  setValue(field('audioClipVolume'), '150');
  act(() => field('audioClipVolume').dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
  expect(onPatch).toHaveBeenCalledWith({ volume: 1.5 });
  act(() =>
    host.querySelector<HTMLButtonElement>('[role="tab"][aria-controls$="-animation"]')!.click()
  );
  setValue(field('audioFadeIn'), '0.5');
  act(() => field('audioFadeIn').dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
  expect(onPatch).toHaveBeenCalledWith({ fadeIn: 0.5 });
  setValue(field('audioFadeOut'), '0.3');
  act(() => field('audioFadeOut').dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
  expect(onPatch).toHaveBeenCalledWith({ fadeOut: 0.3 });
});

it('keeps track mute and inspector mute actions available and deletes the clip', async () => {
  const clip = createQuickEditAudioClip({
    id: 'a1',
    assetId: 'asset:1',
    timelineStart: 1,
    duration: 2,
    endMax: 10,
  });
  renderEditor(clip);
  expect(host.querySelector('[aria-label="gallery.videoReview.audioClipMute"]')).not.toBeNull();
  expect(onPatch).not.toHaveBeenCalled();
  await act(async () =>
    host
      .querySelector<HTMLButtonElement>('[aria-label="gallery.videoReview.audioClipMute"]')!
      .click()
  );
  expect(onPatch).toHaveBeenCalledWith({ volume: 0 });
  await act(async () =>
    host
      .querySelector<HTMLButtonElement>('[aria-label="gallery.videoReview.audioClipDelete"]')!
      .click()
  );
  expect(onDelete).toHaveBeenCalled();
});

it('binds inspector actions to the selected lane without duplicating its heading', async () => {
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
  expect(editor!.textContent).toContain('gallery.videoReview.interval');
  expect(editor!.textContent).not.toContain('gallery.videoReview.audioVoiceover');
  expect(host.querySelector('[aria-label="gallery.videoReview.audioClipMute"]')).not.toBeNull();
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
  ).not.toContain('gallery.videoReview.audioMusic');
  expect(host.querySelector('[aria-label="gallery.videoReview.audioClipMute"]')).not.toBeNull();
  expect(patchClip).not.toHaveBeenCalled();
  act(() =>
    root.render(<ReviewAudioInspectorSection audio={{ selected: null } as never} busy={false} />)
  );
  expect(host.querySelector('[data-ui="gallery.videoReview.audioInspector"]')).toBeNull();
});

it('explains cut suppression without changing the authored mute flag or deleting the recording', () => {
  const clip = createQuickEditAudioClip({
    id: 'voice',
    assetId: 'voice-asset',
    timelineStart: 1,
    duration: 4,
    endMax: 10,
  });
  act(() =>
    root.render(
      <ReviewAudioClipEditor
        clip={clip}
        cutSuppressed
        busy={false}
        onPatch={onPatch}
        onDelete={onDelete}
      />
    )
  );
  expect(host.querySelector('[role="status"]')?.textContent).toContain(
    'gallery.videoReview.voiceoverCut'
  );
  expect(host.querySelector('[aria-label="gallery.videoReview.audioClipMute"]')).not.toBeNull();
  expect(onPatch).not.toHaveBeenCalled();
  expect(onDelete).not.toHaveBeenCalled();
  renderEditor(clip);
  expect(host.querySelector('[role="status"]')).toBeNull();
});

it('keeps long fades available by typing while using a five-second slider', () => {
  const clip = createQuickEditAudioClip({
    id: 'music',
    assetId: 'long-music',
    timelineStart: 0,
    duration: 120,
    endMax: 120,
  });
  renderEditor(clip);
  act(() =>
    host.querySelector<HTMLButtonElement>('[role="tab"][aria-controls$="-animation"]')!.click()
  );
  const ranges = [...host.querySelectorAll<HTMLInputElement>('input[type="range"]')];
  expect(ranges.map((range) => range.max)).toEqual(['5', '5']);
  const fade = host.querySelector<HTMLInputElement>(
    '[aria-label="gallery.videoReview.audioFadeOut"]'
  )!;
  setValue(fade, '20');
  act(() => fade.dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
  expect(onPatch).toHaveBeenLastCalledWith({ fadeOut: 20 });
});

it.each(['voiceover', 'music'] as const)('exposes an independent tempo only for %s', (lane) => {
  const clip = createQuickEditAudioClip({
    id: 'tempo',
    assetId: 'asset',
    timelineStart: 1,
    duration: 4,
    endMax: 12,
  });
  act(() =>
    root.render(
      <ReviewAudioClipEditor
        clip={clip}
        lane={lane}
        busy={false}
        onPatch={onPatch}
        onDelete={onDelete}
      />
    )
  );
  const field = host.querySelector<HTMLInputElement>(
    '[aria-label="gallery.videoReview.voiceoverTempo"]'
  );
  if (lane === 'music') {
    expect(field).toBeNull();
    return;
  }
  expect(field?.value).toBe('1');
  act(() => setValue(field!, '2'));
  act(() => field!.dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
  expect(onPatch).toHaveBeenLastCalledWith({ tempo: 2 });
  // A controlled consumer echoes the accepted value before the next gesture.
  act(() =>
    root.render(
      <ReviewAudioClipEditor
        clip={{ ...clip, tempo: 2 }}
        lane={lane}
        busy={false}
        onPatch={onPatch}
        onDelete={onDelete}
      />
    )
  );
  act(() => setValue(field!, '1'));
  act(() => field!.dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
  expect(onPatch).toHaveBeenLastCalledWith({ tempo: 1 });
});

it('bounds a short audio fade to its duration', () => {
  const clip = createQuickEditAudioClip({
    id: 'short',
    assetId: 'music',
    timelineStart: 0,
    duration: 2,
    endMax: 2,
  });
  const { field } = renderEditor(clip);
  act(() =>
    host.querySelector<HTMLButtonElement>('[role="tab"][aria-controls$="-animation"]')!.click()
  );
  setValue(field('audioFadeIn'), '12');
  act(() => field('audioFadeIn').dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
  expect(onPatch).toHaveBeenLastCalledWith({ fadeIn: 2 });
});

it.each(['voiceover', 'music'] as const)(
  'sets %s clip volume to zero from its shared Mute action',
  (lane) => {
    const clip = createQuickEditAudioClip({
      id: 'mute',
      assetId: 'asset:mute',
      timelineStart: 0,
      duration: 2,
      endMax: 10,
    });
    act(() =>
      root.render(
        <ReviewAudioClipEditor
          clip={clip}
          lane={lane}
          busy={false}
          onPatch={onPatch}
          onDelete={onDelete}
        />
      )
    );
    const mute = host.querySelector<HTMLButtonElement>(
      '[aria-label="gallery.videoReview.audioClipMute"]'
    )!;
    expect(mute.disabled).toBe(false);
    act(() => mute.click());
    expect(onPatch).toHaveBeenCalledWith({ volume: 0 });
    act(() =>
      root.render(
        <ReviewAudioClipEditor
          clip={{ ...clip, volume: 0 }}
          lane={lane}
          busy={false}
          onPatch={onPatch}
          onDelete={onDelete}
        />
      )
    );
    expect(
      host.querySelector<HTMLButtonElement>('[aria-label="gallery.videoReview.audioClipMute"]')!
        .disabled
    ).toBe(true);
  }
);

it('offers voiceover tempo choices without replacing an authored custom tempo', () => {
  const clip = {
    ...createQuickEditAudioClip({
      id: 'custom',
      assetId: 'asset',
      timelineStart: 0,
      duration: 4,
      endMax: 10,
    }),
    tempo: 1.37,
  };
  act(() =>
    root.render(
      <ReviewAudioClipEditor
        clip={clip}
        lane="voiceover"
        busy={false}
        onPatch={onPatch}
        onDelete={onDelete}
      />
    )
  );
  expect(
    host.querySelector<HTMLInputElement>('[aria-label="gallery.videoReview.voiceoverTempo"]')?.value
  ).toBe('1.37');
  const choices = [
    ...host.querySelectorAll<HTMLButtonElement>(
      '[data-ui="shared.ui.compact-inspector.segmented-row"] button'
    ),
  ];
  expect(choices.map((choice) => choice.textContent)).toEqual([
    '0.5×',
    '0.75×',
    '1×',
    '1.5×',
    '2×',
    '4×',
  ]);
  expect(choices.every((choice) => choice.getAttribute('aria-pressed') === 'false')).toBe(true);
  expect(onPatch).not.toHaveBeenCalled();
  act(() => choices[5]!.click());
  expect(onPatch).toHaveBeenLastCalledWith({ tempo: 4 });
});

it.each(['voiceover', 'music'] as const)('separates processing from %s level fields', (lane) => {
  const clip = createQuickEditAudioClip({
    id: 'effects',
    assetId: 'asset',
    timelineStart: 0,
    duration: 4,
    endMax: 10,
  });
  act(() =>
    root.render(
      <ReviewAudioClipEditor
        clip={clip}
        lane={lane}
        busy={false}
        onPatch={onPatch}
        onDelete={onDelete}
      />
    )
  );
  expect(host.querySelector('[data-ui="audio.processing-fields"]')).toBeNull();
  act(() =>
    host.querySelector<HTMLButtonElement>('[role="tab"][aria-controls$="-audio-effects"]')!.click()
  );
  expect(host.querySelector('[data-ui="audio.processing-fields"]')).not.toBeNull();
  expect(host.querySelector('[aria-label="gallery.videoReview.audioClipVolume"]')).toBeNull();
  act(() =>
    host.querySelector<HTMLButtonElement>('[aria-label="audioProcessing.denoise"]')!.click()
  );
  expect(onPatch).toHaveBeenLastCalledWith({
    audioProcessing: expect.objectContaining({
      denoise: expect.objectContaining({ enabled: true }),
    }),
  });
});

it('keeps original gain and mute recovery hints while timeline owns range bounds', () => {
  const patchOriginal = vi.fn();
  act(() =>
    root.render(
      <ReviewOriginalAudioInspector
        audio={
          {
            selectedOriginal: { id: 'gain', start: 1, end: 3, volume: 0.5 },
            patchOriginal,
            removeOriginal: vi.fn(),
          } as never
        }
        duration={10}
        speedMuted
        originalMuted
      />
    )
  );
  expect(host.querySelector('[aria-label="gallery.videoReview.rangeStart"]')).toBeNull();
  expect(host.querySelector('[aria-label="gallery.videoReview.rangeEnd"]')).toBeNull();
  expect(host.textContent).toContain('gallery.videoReview.audioRangeSpeedHint');
  expect(host.textContent).toContain('gallery.videoReview.originalAudioMutedHint');
  const volume = host.querySelector<HTMLInputElement>(
    'input[aria-label="gallery.videoReview.volume"]'
  )!;
  act(() => setValue(volume, '120'));
  act(() => volume.dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
  expect(patchOriginal).toHaveBeenCalledWith('gain', { volume: 1.2 });
});

it('retains combined level and processing fields for consumers that do not opt into sections', () => {
  const clip = createQuickEditAudioClip({
    id: 'legacy',
    assetId: 'asset',
    timelineStart: 0,
    duration: 4,
    endMax: 10,
  });
  act(() =>
    root.render(<AudioTakeLevelFields clip={clip} disabled={false} showTempo onPatch={onPatch} />)
  );
  expect(host.querySelector('[aria-label="gallery.videoReview.audioClipVolume"]')).not.toBeNull();
  expect(host.querySelector('[data-ui="audio.processing-fields"]')).not.toBeNull();
  expect(host.querySelector('[data-ui="shared.ui.compact-inspector.segmented-row"]')).toBeNull();
});
