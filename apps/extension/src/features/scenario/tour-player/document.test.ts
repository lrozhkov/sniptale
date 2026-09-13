// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { createTourDocument, createTourImageSlide } from '../project/factories';
import { buildTourPlayerHtml, type TourPlayerLabels } from './document';
const labels: TourPlayerLabels = {
  previous: 'Back',
  next: 'Next',
  contents: 'Contents',
  close: 'Close',
  restart: 'Restart',
  finished: 'Finished',
  empty: 'Empty',
  point: 'Point',
  details: 'Details',
  play: 'Play',
  pause: 'Pause',
  seek: 'Playback position',
  retry: 'Retry',
  loading: 'Loading',
  mediaError: 'Image failed',
  choose: 'Choose a destination',
};
const png =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR1sAAAAASUVORK5CYII=';
function fixture() {
  const tour = createTourDocument('tour');
  const slide = createTourImageSlide('one');
  slide.title = 'First';
  slide.image = {
    assetId: 'image',
    editDocumentId: null,
    galleryAssetId: 'private-library',
    width: 640,
    height: 360,
    alt: 'Screenshot',
    source: { kind: 'import', filename: 'private-file.png' },
  };
  slide.hotspots = [
    {
      id: 'point',
      point: { x: 0.25, y: 0.5 },
      targetRect: null,
      label: 'Continue',
      text: 'Explanation',
      appearance: null,
      action: { kind: 'next' },
      pulse: true,
    },
  ];
  tour.slides = [slide, { ...createTourImageSlide('two'), title: 'Second', image: slide.image }];
  tour.endScreen.title = 'Done';
  return {
    tour,
    assets: [{ id: 'image', mime: 'image/png', base64: png }],
    title: 'Tour',
    labels: { ...labels },
  };
}
function open(html: string) {
  const frame = document.createElement('iframe');
  document.body.append(frame);
  const window = frame.contentWindow;
  if (!window) throw new Error('Missing test frame');
  const dialog = window.document.createElement('dialog');
  const prototype = Object.getPrototypeOf(dialog);
  prototype.showModal = function () {
    this.open = true;
  };
  prototype.close = function () {
    this.open = false;
  };
  window.document.open();
  window.document.write(html);
  window.document.close();
  return { window, close: () => frame.remove() };
}

it('embeds one media copy, fixed script CSP, and no source provenance', async () => {
  const html = await buildTourPlayerHtml(fixture());
  expect(html.split(png)).toHaveLength(2);
  expect(html).not.toContain('private-file.png');
  expect(html).not.toContain('private-library');
  expect(html).toContain('default-src &#39;none&#39;');
  expect(html).toContain('sha256-');
  expect(html).not.toContain('chrome-extension://');
});
it('treats authored text as text through both JSON and visible title boundaries', async () => {
  const args = fixture();
  const attack = '</script><img src=x onerror="globalThis.pwned=1">';
  args.title = attack;
  args.tour.slides[0]!.title = attack;
  args.labels.next = attack;
  const dom = open(await buildTourPlayerHtml(args));
  expect(dom.window.document.title).toBe(attack);
  expect(dom.window.document.querySelector('[data-tour-title]')?.textContent).toBe(attack);
  expect(dom.window.document.querySelector('[onerror]')).toBeNull();
  expect(Reflect.get(dom.window, 'pwned')).toBeUndefined();
  dom.close();
});
it('uses the same standalone runtime for hotspots, back history, ending and restart', async () => {
  const dom = open(await buildTourPlayerHtml(fixture()));
  const document = dom.window.document;
  const current = () => document.getElementById('tour-player')?.dataset['slideId'];
  expect(current()).toBe('one');
  document.querySelector<HTMLButtonElement>('.tour-hotspot')!.click();
  expect(current()).toBe('two');
  document.querySelector<HTMLButtonElement>('[data-tour-previous]')!.click();
  expect(current()).toBe('one');
  document.querySelector<HTMLButtonElement>('[data-tour-next]')!.click();
  document.querySelector<HTMLButtonElement>('[data-tour-next]')!.click();
  expect(current()).toBe('end');
  [...document.querySelectorAll<HTMLButtonElement>('.tour-navigation-scene button')]
    .find((button) => button.textContent === 'Restart')!
    .click();
  expect(current()).toBe('one');
  dom.close();
});
it('projects manual camera and markers through one source-image box', async () => {
  const args = fixture();
  const first = args.tour.slides[0]!;
  if (first.kind !== 'image') throw new Error('image expected');
  first.camera = { mode: 'manual', zoom: 2, center: { x: 0.25, y: 0.5 } };
  const dom = open(await buildTourPlayerHtml(args));
  const marker = dom.window.document.querySelector<HTMLElement>('.tour-hotspot')!;
  const image = dom.window.document.querySelector<HTMLElement>('.tour-image')!;
  expect(marker.style.left).toBe('320px');
  expect(marker.style.top).toBe('180px');
  expect(image.style.width).toBe('1280px');
  dom.close();
});
it('rejects missing, duplicate, conflicting media and unprepared redaction', async () => {
  const args = fixture();
  await expect(buildTourPlayerHtml({ ...args, assets: [] })).rejects.toThrow('Missing');
  await expect(
    buildTourPlayerHtml({ ...args, assets: [...args.assets, ...args.assets] })
  ).rejects.toThrow('Duplicate');
  await expect(
    buildTourPlayerHtml({ ...args, assets: [{ id: 'image', mime: 'image/svg+xml', base64: png }] })
  ).rejects.toThrow('Invalid embedded');
  const first = args.tour.slides[0]!;
  if (first.kind !== 'image') throw new Error('image expected');
  first.masks = [
    {
      id: 'mask',
      kind: 'redact',
      rect: { x: 0, y: 0, width: 0.5, height: 0.5 },
      color: '#000000',
      opacity: 1,
    },
  ];
  await expect(buildTourPlayerHtml(args)).rejects.toThrow('rasterized');
  first.masks = [];
  first.narration = {
    assetId: 'image',
    duration: 1,
    trimStart: 0,
    trimEnd: 1,
    gain: 1,
    transcript: '',
  };
  await expect(buildTourPlayerHtml(args)).rejects.toThrow('Invalid tour');
});

it('supports document keyboard navigation while leaving input arrows alone', async () => {
  const dom = open(await buildTourPlayerHtml(fixture()));
  const document = dom.window.document;
  const current = () => document.getElementById('tour-player')?.dataset['slideId'];
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  expect(current()).toBe('two');
  const input = document.createElement('input');
  document.body.append(input);
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
  expect(current()).toBe('two');
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
  expect(current()).toBe('one');
  dom.close();
});
it('paginates navigation and uses native safe links for authored URLs', async () => {
  const args = fixture();
  args.tour.slides = [
    {
      kind: 'navigation',
      id: 'navigation',
      title: 'Menu',
      description: 'Details text',
      background: { color: '#111827', image: null },
      narration: null,
      timing: args.tour.slides[0]!.timing,
      buttons: Array.from({ length: 13 }, (_, index) => ({
        id: `link-${index}`,
        label: `Link ${index}`,
        action: { kind: 'url', url: 'https://example.com/' },
      })),
    },
  ];
  const dom = open(await buildTourPlayerHtml(args));
  const document = dom.window.document;
  const link = document.querySelector<HTMLAnchorElement>('.tour-navigation-buttons a')!;
  expect(link.rel).toBe('noopener noreferrer');
  expect(link.target).toBe('_blank');
  const visited = new Set<string>();
  for (let page = 0; page < 20; page += 1) {
    document
      .querySelectorAll('.tour-navigation-buttons a')
      .forEach((node) => visited.add(node.textContent ?? ''));
    expect(document.querySelector('.tour-navigation-text')?.textContent).toBe('Details text');
    const next = document.querySelectorAll<HTMLButtonElement>('.tour-navigation-pager button')[1]!;
    if (next.disabled) break;
    next.click();
  }
  expect(visited.size).toBe(13);
  expect(document.querySelector('.tour-details')).toBeNull();
  dom.close();
});

it('keeps a dismissed explanation closed on resize and reopens it through its hotspot', async () => {
  const dom = open(await buildTourPlayerHtml(fixture()));
  const document = dom.window.document;
  const hint = document.querySelector<HTMLElement>('[data-tour-hint]')!;
  document.querySelector<HTMLButtonElement>('[data-tour-hint-close]')!.click();
  dom.window.dispatchEvent(new Event('resize'));
  expect(hint.hidden).toBe(true);
  const hotspot = document.querySelector<HTMLButtonElement>('.tour-hotspot')!;
  expect(document.activeElement).toBe(hotspot);
  hotspot.blur();
  hotspot.focus();
  expect(hint.hidden).toBe(false);
  dom.close();
});

it('dismisses hints with Escape or Close and restores focus without reopening them', async () => {
  const dom = open(await buildTourPlayerHtml(fixture()));
  const document = dom.window.document;
  const hotspot = document.querySelector<HTMLButtonElement>('.tour-hotspot')!;
  const hint = document.querySelector<HTMLElement>('[data-tour-hint]')!;
  const close = document.querySelector<HTMLButtonElement>('[data-tour-hint-close]')!;
  hotspot.focus();
  close.focus();
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
  expect(hint.hidden).toBe(true);
  expect(document.activeElement).toBe(hotspot);
  hotspot.blur();
  hotspot.focus();
  expect(hint.hidden).toBe(false);
  close.focus();
  close.click();
  expect(hint.hidden).toBe(true);
  expect(document.activeElement).toBe(hotspot);
  hotspot.blur();
  hotspot.focus();
  document.querySelector<HTMLButtonElement>('[data-tour-contents]')!.click();
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
  expect(hint.hidden).toBe(false);
  dom.close();
});

it('refuses to publish unreviewed image positions after geometry changes', async () => {
  const args = fixture();
  const slide = args.tour.slides[0]!;
  if (slide.kind !== 'image') throw new Error('Missing test image');
  slide.requiresTargetReview = true;
  await expect(buildTourPlayerHtml(args)).rejects.toThrow('targets require review');
  slide.requiresTargetReview = false;
  await expect(buildTourPlayerHtml(args)).resolves.toContain('tour-player');
});

it('requires object narration bytes and omits unused audio material metadata from the viewer', async () => {
  const args = fixture();
  const slide = args.tour.slides[0]!;
  if (slide.kind !== 'image') throw Error('image');
  slide.hotspots[0]!.narration = {
    assetId: 'voice',
    duration: 2,
    trimStart: 0,
    trimEnd: 2,
    gain: 1,
    transcript: 'Voice',
    trigger: 'activation',
  };
  args.tour.audioResources = [{ assetId: 'unused', duration: 2, name: 'Private unused take.wav' }];
  await expect(buildTourPlayerHtml(args)).rejects.toThrow('Missing tour media');
  const html = await buildTourPlayerHtml({
    ...args,
    assets: [...args.assets, { id: 'voice', mime: 'audio/wav', base64: 'YQ==' }],
  });
  expect(html).not.toContain('Private unused take.wav');
  expect(html).not.toContain('"audioResources"');
  expect(html).toContain('"trigger":"activation"');
});

it('uses a numberless hotspot and readable explanation controls without a compound counter', async () => {
  const dom = open(await buildTourPlayerHtml(fixture()));
  const doc = dom.window.document;
  expect(doc.querySelector('.tour-hotspot')?.textContent).toBe('');
  expect(doc.querySelector('[data-tour-hint-previous]')?.textContent?.trim()).toBe('Back');
  expect(doc.querySelector('[data-tour-hint-next]')?.textContent?.trim()).toBe('Next');
  expect(doc.querySelector('[data-tour-hint-count]')?.textContent).not.toContain('·');
  expect(doc.querySelector<HTMLElement>('[data-tour-hint-point-count]')?.hidden).toBe(true);
  dom.close();
});

it('keeps hint surfaces decorative and restores the previous point last text page', async () => {
  const args = fixture();
  const slide = args.tour.slides[0]!;
  if (slide.kind !== 'image') throw new Error('image fixture');
  slide.hotspots[0]!.text = 'A'.repeat(170);
  slide.hotspots[0]!.appearance = {
    ...args.tour.style.textAppearance,
    surface: {
      fillPaint: { kind: 'solid', color: '#ffffff' },
      textColor: '#111827',
      width: 300,
      padding: 12,
      radius: 16,
      surfaceCss: 'background-image: url(https://example.com/tracker);',
    },
  };
  slide.hotspots.push({
    ...slide.hotspots[0]!,
    id: 'second-point',
    text: 'Second explanation',
    appearance: null,
  });
  const dom = open(await buildTourPlayerHtml(args));
  const doc = dom.window.document;
  const hint = doc.querySelector<HTMLElement>('[data-tour-hint]')!;
  expect(hint.style.backgroundImage).not.toContain('url(');
  expect(hint.style.borderRadius).toBe('16px');
  expect(doc.querySelector<HTMLElement>('[data-tour-hint-point-count]')!.hidden).toBe(false);
  doc.querySelector<HTMLButtonElement>('[data-tour-hint-next]')!.click();
  expect(doc.querySelector('[data-tour-hint-count]')?.textContent).toBe('2 / 2');
  doc.querySelector<HTMLButtonElement>('[data-tour-hint-next]')!.click();
  expect(doc.querySelector('[data-tour-hint-text]')?.textContent).toBe('Second explanation');
  doc.querySelector<HTMLButtonElement>('[data-tour-hint-previous]')!.click();
  expect(doc.querySelector('[data-tour-hint-text]')?.textContent).toBe('A'.repeat(10));
  dom.close();
});
