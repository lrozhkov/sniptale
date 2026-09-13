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
  expect(shadow().querySelector('.tour-hotspot')!.textContent).toBe('');
  expect(shadow().querySelector('[data-tour-hint-point-count]')).not.toBeNull();
  expect(shadow().querySelector('[data-tour-hint-previous]')!.textContent).toBeTruthy();
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

it('keeps a dismissed explanation closed when the same selection is republished', () => {
  const props = fixture();
  const selection = { kind: 'slide' as const, slideId: 'first', objectId: 'point' };
  act(() => root.render(<TourStage {...props} selection={selection} />));
  act(() => shadow().querySelector<HTMLButtonElement>('[data-tour-hint-close]')!.click());
  expect(shadow().querySelector<HTMLElement>('[data-tour-hint]')!.hidden).toBe(true);
  act(() => root.render(<TourStage {...props} selection={{ ...selection }} />));
  expect(shadow().querySelector<HTMLElement>('[data-tour-hint]')!.hidden).toBe(true);
});

it('mounts the caption disclosure control in the editor scaffold', () => {
  const props = fixture();
  props.tour.style.textAppearance.presentation = 'caption-bottom';
  const slide = props.tour.slides[0]!;
  if (slide.kind !== 'image') throw new Error('Expected image');
  slide.hotspots[0]!.text = 'A'.repeat(170);
  const selection = { kind: 'slide' as const, slideId: 'first', objectId: 'point' };
  act(() => root.render(<TourStage {...props} selection={selection} />));
  const toggle = shadow().querySelector<HTMLButtonElement>('[data-tour-hint-toggle]')!;
  expect(toggle.hidden).toBe(false);
  act(() => shadow().querySelector<HTMLButtonElement>('[data-tour-hint-next]')!.click());
  expect(shadow().querySelector('[data-tour-hint-text]')!.textContent).toBe('A'.repeat(10));
  act(() => toggle.click());
  expect(shadow().querySelector<HTMLElement>('[data-tour-hint-text]')!.hidden).toBe(true);
  act(() =>
    root.render(<TourStage {...props} selection={selection} tour={structuredClone(props.tour)} />)
  );
  expect(shadow().querySelector<HTMLElement>('[data-tour-hint-text]')!.hidden).toBe(true);
  expect(shadow().querySelector('[data-tour-hint-text]')!.textContent).toBe('A'.repeat(10));
  act(() => toggle.click());
  expect(shadow().querySelector<HTMLElement>('[data-tour-hint-text]')!.hidden).toBe(false);
});

it('resizes a selected mask on canvas with live geometry, one commit and Escape rollback', () => {
  const props = fixture();
  const slide = props.tour.slides[0]!;
  if (slide.kind !== 'image') throw new Error('Expected image');
  slide.masks = [
    {
      id: 'mask',
      kind: 'highlight',
      color: '#f97316',
      opacity: 0.3,
      rect: { x: 0.2, y: 0.2, width: 0.3, height: 0.2 },
    },
  ];
  const onResizeObject = vi.fn();
  act(() =>
    root.render(
      <TourStage
        {...props}
        selection={{ kind: 'slide', slideId: 'first', objectId: 'mask' }}
        onResizeObject={onResizeObject}
      />
    )
  );
  const box = shadow().querySelector<HTMLElement>('.tour-mask')!;
  const handle = box.querySelector<HTMLButtonElement>('[data-edge=se]')!;
  expect(box.dataset['selected']).toBe('true');
  expect(box.querySelectorAll('.tour-resize-handle')).toHaveLength(8);
  const original = box.style.width;
  const pointer = (name: string, x: number) => {
    const event = new MouseEvent(name, { bubbles: true, button: 0, clientX: x, clientY: x });
    Object.defineProperty(event, 'pointerId', { value: 1 });
    act(() => handle.dispatchEvent(event));
  };
  pointer('pointerdown', 0);
  pointer('pointermove', 30);
  expect(box.style.width).not.toBe(original);
  expect(onResizeObject).not.toHaveBeenCalled();
  act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  expect(box.style.width).toBe(original);
  pointer('pointerup', 30);
  expect(onResizeObject).not.toHaveBeenCalled();
  pointer('pointerdown', 0);
  pointer('pointermove', 1000);
  pointer('pointerup', 1000);
  expect(onResizeObject).toHaveBeenCalledExactlyOnceWith('mask', {
    x: 0.2,
    y: 0.2,
    width: 0.8,
    height: 0.8,
  });
  expect(props.onMoveObject).not.toHaveBeenCalled();
});

it('renders independent neutral spotlight and visual blur; locked resize stays inert', () => {
  const props = fixture();
  const slide = props.tour.slides[0]!;
  if (slide.kind !== 'image') throw new Error('Expected image');
  const mask = {
    id: 'mask',
    kind: 'spotlight' as const,
    color: '#f97316',
    opacity: 0.3,
    rect: { x: 0.2, y: 0.2, width: 0.3, height: 0.2 },
  };
  slide.masks = [mask];
  const onResizeObject = vi.fn();
  act(() => root.render(<TourStage {...props} disabled onResizeObject={onResizeObject} />));
  const effect = () => shadow().querySelector<HTMLElement>('.tour-mask-effect')!;
  expect(effect().style.boxShadow).toContain('#111827');
  expect(effect().style.opacity).toBe('0.6');
  const handle = shadow().querySelector('[data-edge=se]')!;
  act(() =>
    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
  );
  expect(onResizeObject).not.toHaveBeenCalled();
  slide.masks = [{ ...mask, kind: 'blur', blurRadius: 20 }];
  act(() => root.render(<TourStage {...props} tour={structuredClone(props.tour)} />));
  const imageWidth = Number.parseFloat(
    shadow().querySelector<HTMLElement>('.tour-image')!.style.width
  );
  expect(effect().style.backdropFilter).toBe(`blur(${(20 * imageWidth) / 100}px)`);
  expect(effect().style.opacity).toBe('');
});
