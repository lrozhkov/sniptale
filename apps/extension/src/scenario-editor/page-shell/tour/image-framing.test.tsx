import type { TourDocument, TourImageSlide } from '@sniptale/runtime-contracts/scenario/types/tour';
// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_WINDOW_HEADER } from '@sniptale/runtime-contracts/window-header';
import {
  createTourDocument,
  createTourImageSlide,
} from '../../../features/scenario/project/public';
import { createTranslator, translate } from '../../../platform/i18n';
import { TourImageFraming } from './image-framing';
import { TourDocumentSettings } from './document-settings';

vi.mock('../../../composition/background-resources/catalog', () => ({
  useBackgroundCatalog: () => ({ status: 'ready', presets: [] }),
}));
vi.mock('../../../workflows/background-images/intake', () => ({
  BACKGROUND_IMAGE_ACCEPT: 'image/png',
  prepareBackgroundImage: async (file: File) => file,
}));
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
  tour.stage.windowHeader = { ...DEFAULT_WINDOW_HEADER, kind: 'application' };
  const slide = createTourImageSlide('image');
  slide.camera.mode = 'off';
  slide.image = {
    assetId: 'image',
    galleryAssetId: null,
    editDocumentId: null,
    width: 1600,
    height: 900,
    alt: 'Image',
    source: { kind: 'import', filename: 'image.png' },
  };
  slide.imagePlacement = { center: { x: 0.5, y: 0.5 }, zoom: 2 };
  slide.masks = [
    {
      id: 'privacy',
      kind: 'redact',
      rect: { x: 0.2, y: 0.2, width: 0.1, height: 0.1 },
      color: '#000000',
      opacity: 1,
    },
  ];
  tour.slides = [slide];
  return {
    tour,
    slide,
    images: { image: 'data:image/png;base64,aA==' },
    disabled: false,
    onChange: vi.fn((_slide: TourImageSlide) => true),
    t: createTranslator('en'),
  };
}
function pointer(node: Element, type: string, x: number) {
  const event = new MouseEvent(type, { bubbles: true, button: 0, clientX: x, clientY: 100 });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  act(() => node.dispatchEvent(event));
}
it('uses the real window renderer without action hints and commits one completed pan', () => {
  const props = fixture();
  act(() => root.render(<TourImageFraming {...props} />));
  const shadow = host.querySelector('.tour-stage-host')!.shadowRoot!;
  expect(host.querySelector('[data-view="image"]')).not.toBeNull();
  expect(shadow.querySelector('.tour-window-header')).not.toBeNull();
  expect(shadow.querySelector('.tour-hotspot')).toBeNull();
  expect(shadow.querySelector('[data-tour-hint]')?.hasAttribute('hidden')).toBe(true);
  expect(shadow.querySelector('.tour-mask')).not.toBeNull();
  const viewport = shadow.querySelector('.tour-image-viewport')!;
  pointer(viewport, 'pointerdown', 100);
  pointer(viewport, 'pointermove', 150);
  expect(props.onChange).not.toHaveBeenCalled();
  pointer(viewport, 'pointerup', 150);
  expect(props.onChange).toHaveBeenCalledTimes(1);
  const next = props.onChange.mock.calls[0]![0];
  expect(next.imagePlacement!.center.x).toBeLessThan(0.5);
  expect(next.imagePlacement!.zoom).toBe(2);
  expect(next.masks).toEqual(props.slide.masks);
});
it('cancels an unfinished pan on Escape or pointer cancellation without publishing', () => {
  const props = fixture();
  act(() => root.render(<TourImageFraming {...props} />));
  const shadow = host.querySelector('.tour-stage-host')!.shadowRoot!;
  const viewport = shadow.querySelector('.tour-image-viewport')!;
  const plane = shadow.querySelector<HTMLElement>('.tour-image-plane')!;
  pointer(viewport, 'pointerdown', 100);
  pointer(viewport, 'pointermove', 150);
  expect(plane.style.transform).toContain('translate');
  act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  expect(plane.style.transform).toBe('');
  expect(props.onChange).not.toHaveBeenCalled();
  pointer(viewport, 'pointerdown', 100);
  pointer(viewport, 'pointermove', 150);
  pointer(viewport, 'pointercancel', 150);
  expect(plane.style.transform).toBe('');
  expect(props.onChange).not.toHaveBeenCalled();
});
it('cancels a pan when its window loses focus without publishing on release', () => {
  const props = fixture();
  act(() => root.render(<TourImageFraming {...props} />));
  const shadow = host.querySelector('.tour-stage-host')!.shadowRoot!;
  const viewport = shadow.querySelector('.tour-image-viewport')!;
  const plane = shadow.querySelector<HTMLElement>('.tour-image-plane')!;
  pointer(viewport, 'pointerdown', 100);
  pointer(viewport, 'pointermove', 150);
  act(() => window.dispatchEvent(new Event('blur')));
  expect(plane.style.transform).toBe('');
  pointer(viewport, 'pointerup', 150);
  expect(props.onChange).not.toHaveBeenCalled();
});
it('exposes a refused global header edit without replacing the accepted settings', async () => {
  const props = fixture();
  const before = structuredClone(props.tour);
  const refused = vi.fn(() => false);
  act(() =>
    root.render(
      <TourDocumentSettings
        section="appearance"
        tour={props.tour}
        disabled={false}
        onChange={refused}
        t={props.t}
      />
    )
  );
  const browser = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.textContent === translate('windowHeader.browser')
  )!;
  await act(async () => browser.click());
  expect(refused).toHaveBeenCalledTimes(1);
  expect(host.querySelector('[role="alert"]')?.textContent).toBe(
    translate('windowHeader.updateFailed')
  );
  expect(props.tour).toEqual(before);
});

it('removes a disabled global header property so portable JSON remains admissible', async () => {
  const props = fixture();
  const accepted = vi.fn((_tour: TourDocument) => true);
  act(() =>
    root.render(
      <TourDocumentSettings
        section="appearance"
        tour={props.tour}
        disabled={false}
        onChange={accepted}
        t={props.t}
      />
    )
  );
  const none = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.textContent === translate('windowHeader.none')
  )!;
  await act(async () => none.click());
  const next = accepted.mock.calls[0]![0];
  expect(Object.hasOwn(next.stage, 'windowHeader')).toBe(false);
});

it('keeps accepted stage content when the shared background picker import refuses', async () => {
  const props = fixture();
  const before = structuredClone(props.tour.stage);
  const upload = vi.fn(async () => false);
  act(() =>
    root.render(
      <TourDocumentSettings
        section="appearance"
        tour={props.tour}
        disabled={false}
        onChange={() => true}
        onUploadStage={upload}
        t={props.t}
      />
    )
  );
  const input = host.querySelector<HTMLInputElement>(
    '[data-ui="background.image.picker"] input[type="file"]'
  )!;
  Object.defineProperty(input, 'files', {
    value: [new File(['image'], 'stage.png', { type: 'image/png' })],
    configurable: true,
  });
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
  expect(upload).toHaveBeenCalledOnce();
  expect(host.querySelector('[data-ui="background.image.picker"] [role="alert"]')).not.toBeNull();
  expect(props.tour.stage).toEqual(before);
});
