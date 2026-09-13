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
  return {
    tour,
    images: {
      image:
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR1sAAAAASUVORK5CYII=',
    },
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

it('mounts the shared scene and updates selection without replacing its viewport', () => {
  const props = fixture();
  act(() => root.render(<TourStage {...props} />));
  const viewport = shadow().querySelector('[data-tour-viewport]');
  expect(shadow().querySelector('.tour-image')).not.toBeNull();
  act(() => shadow().querySelector<HTMLButtonElement>('.tour-hotspot')!.click());
  expect(props.onSelectObject).toHaveBeenCalledWith('point');
  act(() =>
    root.render(
      <TourStage {...props} selection={{ kind: 'slide', slideId: 'first', objectId: 'point' }} />
    )
  );
  expect(shadow().querySelector('[data-tour-viewport]')).toBe(viewport);
  expect(shadow().querySelector<HTMLElement>('.tour-hotspot')!.dataset['selected']).toBe('true');
  expect(host.querySelector('style')).toBeNull();
});

it('leaves Escape in an application input outside the authoring scene alone', () => {
  act(() => root.render(<TourStage {...fixture()} />));
  const input = document.createElement('input');
  host.append(input);
  input.focus();
  input.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
  );
  expect(shadow().querySelector<HTMLElement>('[data-tour-hint]')!.hidden).toBe(false);
  input.remove();
});
