// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  createTourDocument,
  createTourImageSlide,
} from '../../../features/scenario/project/public';
import { createTranslator } from '../../../platform/i18n';
import { TourStage } from './stage';

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
function fixture() {
  const tour = createTourDocument();
  const slide = createTourImageSlide('first');
  slide.image = {
    assetId: 'image',
    galleryAssetId: null,
    editDocumentId: null,
    width: 100,
    height: 100,
    alt: 'Image',
    source: { kind: 'import', filename: 'image.png' },
  };
  slide.hotspots = [
    {
      id: 'point',
      point: { x: 0.5, y: 0.5 },
      targetRect: null,
      label: 'Point',
      text: 'Explanation',
      action: { kind: 'next' },
      appearance: null,
      pulse: false,
    },
  ];
  tour.slides = [slide, createTourImageSlide('second')];
  const images: Record<string, string> = {
    image:
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR1sAAAAASUVORK5CYII=',
  };
  return {
    tour,
    images,
    selection: { kind: 'slide' as const, slideId: 'first', objectId: null },
    onSelectObject: vi.fn(),
    onMoveObject: vi.fn(),
    t: createTranslator('en'),
  };
}
function shadow() {
  const value = host.querySelector('.tour-stage-host')?.shadowRoot;
  if (!value) throw new Error('Missing scene shadow root');
  return value;
}
function instantImages() {
  vi.stubGlobal(
    'Image',
    class {
      onload: (() => void) | null = null;
      onerror: ((error?: unknown) => void) | null = null;
      decode = () => Promise.resolve();
      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
  );
}
function playbackFrames() {
  let time = 0;
  let id = 0;
  const callbacks = new Map<number, FrameRequestCallback>();
  vi.spyOn(performance, 'now').mockImplementation(() => time);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callbacks.set(++id, callback);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (token: number) => callbacks.delete(token));
  return async (delta: number) => {
    time += delta;
    const queued = [...callbacks.values()];
    callbacks.clear();
    queued.forEach((callback) => callback(time));
    await Promise.resolve();
    await Promise.resolve();
  };
}
async function renderPreview(props: ReturnType<typeof fixture>) {
  props.tour.transition = { kind: 'none', durationMs: 0, hotspotTravelMs: 0 };
  const tick = playbackFrames();
  await act(async () => root.render(<TourStage {...props} view="preview" />));
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await tick(1200);
  });
  return tick;
}

it('keeps preview interactive: pointer and keyboard hints, pagination, Escape and denied links', async () => {
  const props = fixture();
  const slide = props.tour.slides[0]!;
  if (slide.kind !== 'image') throw new Error('Expected image');
  slide.hotspots[0]!.action = { kind: 'url', url: 'https://example.com/' };
  slide.annotations = [{ id: 'note', text: 'Second page', anchor: null, appearance: null }];
  instantImages();
  await renderPreview(props);
  const stage = host.querySelector<HTMLElement>('.tour-stage-host')!;
  expect(stage.dataset['view']).toBe('preview');
  expect(stage.hasAttribute('inert')).toBe(false);
  const scene = shadow().querySelector<HTMLElement>('[data-tour-scene]')!;
  expect(scene.inert).toBe(false);
  const hotspot = shadow().querySelector<HTMLElement>('.tour-hotspot')!;
  expect(hotspot.tagName).toBe('BUTTON');
  expect(shadow().querySelector('a[href]')).toBeNull();
  const hint = () => shadow().querySelector<HTMLElement>('[data-tour-hint]')!;
  act(() => hotspot.focus());
  expect(hint().hidden).toBe(false);
  expect(hint().querySelector('[data-tour-hint-point-count]')!.textContent).toContain('1 / 2');
  act(() => shadow().querySelector<HTMLButtonElement>('[data-tour-hint-next]')!.click());
  expect(hint().querySelector('[data-tour-hint-point-count]')!.textContent).toContain('2 / 2');
  expect(hint().querySelector('[data-tour-hint-text]')!.textContent).toBe('Second page');
  act(() => shadow().querySelector<HTMLButtonElement>('[data-tour-hint-previous]')!.click());
  expect(hint().querySelector('[data-tour-hint-point-count]')!.textContent).toContain('1 / 2');
  act(() =>
    hotspot.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        composed: true,
        cancelable: true,
      })
    )
  );
  expect(hint().hidden).toBe(true);
  expect(shadow().activeElement).toBe(hotspot);
  act(() => hotspot.click());
  act(() => hotspot.click());
  expect(shadow().querySelector('a[href]')).toBeNull();
  expect(shadow().querySelector('#tour-player')!.getAttribute('data-slide-id')).toBe('first');
  expect(props.onSelectObject).not.toHaveBeenCalled();
});

it('plays preview narration and releases it when the preview player is disposed', async () => {
  const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(async () => {});
  const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  const props = fixture();
  const slide = props.tour.slides[0]!;
  if (slide.kind !== 'image') throw new Error('Expected image');
  slide.narration = {
    assetId: 'voice',
    duration: 2,
    trimStart: 0,
    trimEnd: 2,
    gain: 1,
    transcript: '',
  };
  props.images['voice'] = 'data:audio/wav;base64,AA==';
  instantImages();
  await renderPreview(props);
  const audio = shadow().querySelector('audio');
  expect(audio?.getAttribute('src')).toContain('data:audio');
  expect(play).toHaveBeenCalled();
  act(() => root.render(<TourStage {...props} view="edit" />));
  expect(pause).toHaveBeenCalled();
  expect(shadow().querySelector('audio')).toBeNull();
});

it('starts at the selected slide and navigates the entire tour without editing selection', async () => {
  const props = fixture();
  props.selection.slideId = 'second';
  instantImages();
  await renderPreview(props);
  const player = shadow().querySelector<HTMLElement>('#tour-player')!;
  expect(player.dataset['slideId']).toBe('second');
  expect(shadow().querySelector('[data-tour-counter]')!.textContent).toBe('2 / 2');
  expect(shadow().querySelector('[data-tour-play]')!.getAttribute('aria-pressed')).toBe('true');
  act(() => shadow().querySelector<HTMLButtonElement>('[data-tour-previous]')!.click());
  expect(player.dataset['slideId']).toBe('first');
  act(() => shadow().querySelector<HTMLButtonElement>('[data-tour-next]')!.click());
  expect(player.dataset['slideId']).toBe('second');
  expect(props.onSelectObject).not.toHaveBeenCalled();
});

it('recovers the real preview when narration URL arrives after image URLs', async () => {
  const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  const props = fixture();
  const slide = props.tour.slides[0]!;
  slide.narration = {
    assetId: 'voice',
    duration: 2,
    trimStart: 0,
    trimEnd: 2,
    gain: 1,
    transcript: '',
  };
  instantImages();
  const tick = await renderPreview(props);
  const status = () => shadow().querySelector<HTMLElement>('[data-tour-status]')!;
  expect(status().textContent).toBe('Narration could not play. Try again.');
  expect(play).not.toHaveBeenCalled();
  const images = { ...props.images, voice: 'data:audio/wav;base64,AA==' };
  await act(async () => {
    root.render(<TourStage {...props} images={images} view="preview" />);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  await act(async () => tick(1200));
  expect(status().hidden).toBe(true);
  await act(async () => shadow().querySelector<HTMLButtonElement>('[data-tour-play]')!.click());
  expect(play).toHaveBeenCalledOnce();
  expect(shadow().querySelector('audio')?.getAttribute('src')).toContain('data:audio');
});
