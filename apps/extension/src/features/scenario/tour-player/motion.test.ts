// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { createTourDocument, createTourImageSlide } from '../project/factories';
import { createTourMotion } from './motion';
const releases: (() => void)[] = [];
afterEach(() => releases.splice(0).forEach((release) => release()));
function fixture() {
  const root = document.createElement('main');
  root.dataset['slideId'] = 'old';
  root.innerHTML =
    '<div data-tour-stage><div data-tour-scene><div class="tour-image-plane"></div><a class="tour-hotspot" style="left:100px;top:100px" href="https://example.com/">1</a></div></div><aside data-tour-hint>Hint</aside>';
  document.body.append(root);
  const lifetime = new AbortController();
  const motion = createTourMotion(root, lifetime.signal);
  releases.push(() => {
    lifetime.abort();
    root.remove();
  });
  const previous = motion.capture();
  const scene = root.querySelector<HTMLElement>('[data-tour-scene]')!;
  scene.innerHTML = `<div class="tour-image-plane"><div class="tour-mask"></div></div>
    <button class="tour-hotspot" style="left:428px;top:180px">1</button>`;
  const tour = createTourDocument('tour');
  tour.playback.autoZoom = false;
  tour.transition = { kind: 'fade', durationMs: 200, hotspotTravelMs: 300 };
  const slide = createTourImageSlide('new');
  slide.image = {
    assetId: 'image',
    width: 100,
    height: 100,
    alt: '',
    galleryAssetId: null,
    editDocumentId: null,
    source: { kind: 'import', filename: '' },
  };
  slide.hotspots = [
    {
      id: 'point',
      point: { x: 0.8, y: 0.5 },
      targetRect: null,
      label: 'Next',
      text: '',
      action: { kind: 'next' },
      appearance: null,
      pulse: true,
    },
  ];
  const prepare = (reduced = false) =>
    motion.prepare(previous, slide, tour, { stageWidth: 640, stageHeight: 360 }, reduced);
  return { root, scene, motion, previous, prepare, tour, slide, lifetime };
}
it('holds the old point through image switch, then travels while real targets stay inert', () => {
  const f = fixture();
  f.prepare();
  expect(f.scene.inert).toBe(true);
  expect(f.root.querySelector('.tour-motion-previous')).not.toBeNull();
  expect(f.previous!.pixels.inert).toBe(true);
  expect(f.previous!.pixels.querySelector('a')).toBeNull();
  f.motion.frame(100);
  expect(f.scene.style.opacity).toBe('0');
  f.motion.ready();
  f.motion.frame(100);
  const marker = f.root.querySelector<HTMLElement>('.tour-motion-hotspot')!;
  expect(marker.style.left).toBe('100px');
  expect(marker.style.top).toBe('100px');
  expect(f.scene.style.opacity).toBe('1');
  expect(f.previous!.pixels.style.opacity).toBe('0.5');
  f.motion.frame(200);
  expect(marker.style.left).toBe('100px');
  f.motion.frame(350);
  expect(parseFloat(marker.style.left)).toBeCloseTo(264);
  expect(f.scene.inert).toBe(true);
  f.motion.frame(500);
  expect(f.scene.inert).toBe(false);
  expect(f.root.querySelector('.tour-motion-hotspot')).toBeNull();
  expect(f.root.querySelector<HTMLElement>('[data-tour-hint]')!.style.visibility).toBe('');
  f.motion.frame(250);
  expect(f.scene.inert).toBe(true);
  expect(f.root.querySelector('.tour-motion-previous')).not.toBeNull();
  f.motion.cancel();
  expect(f.scene.inert).toBe(false);
});
it('retains the authored point appearance while it travels between slides', () => {
  const f = fixture();
  const target = f.scene.querySelector<HTMLElement>('.tour-hotspot')!;
  target.style.borderRadius = '4px';
  target.style.background = 'rgb(20, 40, 60)';
  target.dataset['pulse'] = 'true';
  f.prepare();
  f.motion.ready();
  f.motion.frame(350);
  const marker = f.root.querySelector<HTMLElement>('.tour-motion-hotspot')!;
  expect(marker.style.borderRadius).toBe('4px');
  expect(marker.style.background).toBe('rgb(20, 40, 60)');
  expect(marker.dataset['pulse']).toBe('true');
  expect(marker.style.left).toBe('264px');
  expect(marker.getAttribute('aria-hidden')).toBe('true');
  expect(marker.tabIndex).toBe(-1);
});
it('projects camera motion on the image and masks plane and settles exactly', () => {
  const f = fixture();
  f.tour.playback.autoZoom = true;
  f.slide.hotspots[0]!.point = { x: 0.5, y: 0.5 };
  f.prepare();
  f.motion.ready();
  f.motion.frame(0);
  const plane = f.scene.querySelector<HTMLElement>('.tour-image-plane')!;
  expect(plane.style.transform).toContain('scale(0.25)');
  f.motion.frame(499);
  expect(plane.style.transform).toContain('scale(0.25)');
  f.motion.frame(850);
  expect(plane.style.transform).toContain('scale(0.625)');
  expect(plane.querySelector('.tour-mask')).not.toBeNull();
  f.motion.frame(1200);
  expect(plane.style.transform).toBe('');
});
it('settles reduced motion and cancellation without retaining executable old links or blocked controls', () => {
  const f = fixture();
  f.slide.hotspots = [];
  f.scene.innerHTML = '<a href="https://example.com/">Open</a>';
  f.prepare(true);
  f.motion.ready();
  f.motion.frame(0);
  expect(f.scene.inert).toBe(false);
  const snapshot = f.motion.capture();
  expect(snapshot!.pixels.querySelector('a')!.hasAttribute('href')).toBe(false);
  f.motion.prepare(snapshot, null, f.tour, { stageWidth: 640, stageHeight: 360 }, false);
  f.motion.ready();
  f.motion.frame(50);
  expect(f.scene.inert).toBe(true);
  f.lifetime.abort();
  f.motion.frame(100);
  expect(f.scene.inert).toBe(false);
  expect(f.root.querySelector('.tour-motion-previous')).toBeNull();
});

it('animates manual camera only after its delay, through the same entrance clock', () => {
  const f = fixture();
  f.slide.camera = {
    mode: 'manual',
    center: { x: 0.5, y: 0.5 },
    zoom: 2,
    delayMs: 400,
    durationMs: 600,
  };
  f.prepare();
  f.motion.ready();
  const plane = f.scene.querySelector<HTMLElement>('.tour-image-plane')!;
  f.motion.frame(599);
  expect(plane.style.transform).toContain('scale(0.5)');
  f.motion.frame(900);
  expect(plane.style.transform).toContain('scale(0.75)');
  f.motion.frame(1200);
  expect(plane.style.transform).toBe('');
});

it('reprojects outgoing pixels and travelling points without resetting elapsed motion', () => {
  const f = fixture();
  f.prepare();
  f.motion.ready();
  f.motion.frame(100);
  f.scene.innerHTML =
    '<div class="tour-image-plane"></div><button class="tour-hotspot" style="left:214px;top:90px">1</button>';
  f.motion.reflow({ stageWidth: 320, stageHeight: 180 });
  expect(f.previous!.pixels.style.opacity).toBe('0.5');
  expect(f.previous!.pixels.style.transform).toBe('scale(0.5)');
  expect(f.previous!.pixels.style.width).toBe('640px');
  expect(f.previous!.pixels.inert).toBe(true);
  f.motion.frame(350);
  expect(f.root.querySelector<HTMLElement>('.tour-motion-hotspot')!.style.left).toBe('132px');
  f.motion.frame(500);
  expect(f.root.querySelector('.tour-motion-previous')).toBeNull();
  expect(f.scene.inert).toBe(false);
});

it('projects highlight phases with exact base alpha through reflow, cancellation and outgoing capture', () => {
  const f = fixture();
  const masks = () => [...f.scene.querySelectorAll<HTMLElement>('[data-tour-highlight]')];
  const markup =
    '<div data-tour-highlight data-base-opacity="0.6" data-enter-ms="400" data-exit-ms="200"></div>' +
    '<div data-tour-highlight data-base-opacity="0" data-enter-ms="400" data-exit-ms="200"></div>';
  f.scene.insertAdjacentHTML('beforeend', markup);
  f.prepare();
  f.motion.ready();
  f.motion.frame(200);
  expect(masks().map((node) => Number(node.style.opacity))).toEqual([0.3, 0]);
  f.motion.exit(100);
  expect(masks().map((node) => Number(node.style.opacity))).toEqual([0.3, 0]);
  masks().forEach((node) => node.remove());
  f.scene.insertAdjacentHTML('beforeend', markup);
  f.motion.reflow({ stageWidth: 320, stageHeight: 180 });
  expect(masks().map((node) => Number(node.style.opacity))).toEqual([0.3, 0]);
  f.motion.cancelExit();
  expect(masks().map((node) => Number(node.style.opacity))).toEqual([0.6, 0]);
  f.motion.exit(200);
  const snapshot = f.motion.capture()!;
  expect(
    [...snapshot.pixels.querySelectorAll<HTMLElement>('[data-tour-highlight]')].map((node) =>
      Number(node.style.opacity)
    )
  ).toEqual([0, 0]);
  f.motion.cancel();
  expect(masks().map((node) => Number(node.style.opacity))).toEqual([0.6, 0]);
});

it('keeps independent highlight durations and no-effect masks stable in reduced motion', () => {
  const f = fixture();
  f.scene.insertAdjacentHTML(
    'beforeend',
    '<div data-tour-highlight data-base-opacity="0.8" data-enter-ms="200" data-exit-ms="400"></div>' +
      '<div data-tour-highlight data-base-opacity="0.4" data-enter-ms="0" data-exit-ms="0"></div>' +
      '<div class="tour-mask-redact"><div class="tour-mask-effect" style="opacity:1"></div></div>'
  );
  const effects = () =>
    [...f.scene.querySelectorAll<HTMLElement>('[data-tour-highlight]')].map((node) =>
      Number(node.style.opacity)
    );
  f.prepare();
  f.motion.ready();
  f.motion.frame(100);
  expect(effects()).toEqual([0.4, 0.4]);
  f.motion.exit(200);
  expect(effects()).toEqual([0.4, 0.4]);
  expect(
    f.scene.querySelector<HTMLElement>('.tour-mask-redact .tour-mask-effect')!.style.opacity
  ).toBe('1');
  f.prepare(true);
  f.motion.ready();
  f.motion.frame(0);
  f.motion.exit(100);
  expect(effects()).toEqual([0.8, 0.4]);
  f.motion.cancel();
  f.scene.querySelector<HTMLElement>('[data-tour-highlight]')!.style.opacity = '0.8';
  f.motion.reflow({ stageWidth: 320, stageHeight: 180 });
  expect(effects()).toEqual([0.8, 0.4]);
});
