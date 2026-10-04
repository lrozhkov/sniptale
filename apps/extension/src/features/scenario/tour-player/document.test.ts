// @vitest-environment jsdom
import {
  TOUR_HINT_SURFACE,
  TOUR_MASK_DEFAULTS,
} from '@sniptale/runtime-contracts/scenario/types/tour';
import { expect, it } from 'vitest';
import { createTourDocument, createTourImageSlide } from '../project/factories';
import { buildTourPlayerBlob, buildTourPlayerHtml, type TourPlayerLabels } from './document';
const labels: TourPlayerLabels = {
  expand: 'Expand explanation',
  collapse: 'Collapse explanation',
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
  expect(doc.querySelector('[data-tour-hint-point-count]')?.textContent).toBe('1 / 3');
  expect(doc.querySelector('[data-tour-hint-action-title]')?.textContent).toBe('Continue');
  dom.close();
});

it('shows each action name in the callout header and omits an empty description', async () => {
  const args = fixture();
  const slide = args.tour.slides[0]!;
  if (slide.kind !== 'image') throw new Error('Expected image');
  slide.hotspots.push({
    ...slide.hotspots[0]!,
    id: 'empty-description',
    label: 'Finish setup',
    text: '  ',
  });
  const dom = open(await buildTourPlayerHtml(args));
  const doc = dom.window.document;
  expect(doc.querySelector('[data-tour-hint-point-count]')?.textContent).toBe('1 / 4');
  expect(doc.querySelector('[data-tour-hint-action-title]')?.textContent).toBe('Continue');
  expect(doc.querySelector<HTMLElement>('[data-tour-hint-text]')?.hidden).toBe(false);
  expect(doc.querySelector('[data-tour-hint-text]')?.textContent).toBe('Explanation');
  doc.querySelector<HTMLButtonElement>('[data-tour-hint-next]')!.click();
  expect(doc.querySelector('[data-tour-hint-point-count]')?.textContent).toBe('2 / 4');
  expect(doc.querySelector('[data-tour-hint-action-title]')?.textContent).toBe('Finish setup');
  expect(doc.querySelector<HTMLElement>('[data-tour-hint-text]')?.hidden).toBe(true);
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

it.each(['caption-top', 'caption-bottom'] as const)(
  'discloses %s without losing text position or mixing counters',
  async (presentation) => {
    const args = fixture();
    const slide = args.tour.slides[0]!;
    if (slide.kind !== 'image') throw new Error('Expected image');
    slide.hotspots = [];
    slide.annotations = [
      { id: 'first-note', text: 'A'.repeat(170), anchor: null, appearance: null },
      { id: 'second-note', text: 'Second body', anchor: null, appearance: null },
    ];
    args.tour.style.textAppearance.presentation = presentation;
    const dom = open(await buildTourPlayerHtml(args));
    const doc = dom.window.document;
    const toggle = doc.querySelector<HTMLButtonElement>('[data-tour-hint-toggle]')!;
    const body = doc.querySelector<HTMLElement>('[data-tour-hint-text]')!;
    const next = doc.querySelector<HTMLButtonElement>('[data-tour-hint-next]')!;
    Object.defineProperty(body, 'scrollHeight', {
      get: () => ((body.textContent?.length ?? 0) > 80 ? 80 : 20),
    });
    body.style.lineHeight = '20px';
    doc.getElementById('tour-player')!.style.fontSize = '15px';
    const resize = doc.createEvent('Event');
    resize.initEvent('resize', false, false);
    dom.window.dispatchEvent(resize);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.textContent).toContain('Details');
    expect(body.textContent).toBe('A'.repeat(170));
    expect(body.hidden).toBe(false);
    expect(doc.querySelector('[data-tour-hint-point-count]')!.textContent).toBe('1 / 4');
    body.click();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(body.textContent).toBe('A'.repeat(170));
    expect(Number.parseFloat(body.style.maxHeight)).toBeGreaterThan(20);
    toggle.click();
    expect(toggle.getAttribute('aria-label')).toBe('Expand explanation: Details');
    expect(body.hidden).toBe(false);
    expect(body.style.maxHeight).toBe('20px');
    next.click();
    expect(body.textContent).toBe('Second body');
    expect(toggle.hidden).toBe(true);
    expect(doc.querySelector('[data-tour-hint-point-count]')!.textContent).toBe('2 / 4');
    expect(doc.querySelector<HTMLElement>('[data-tour-hint-count]')!.hidden).toBe(true);
    dom.close();
  }
);

it.each(['caption-top', 'caption-bottom'] as const)(
  'anchors exported %s to letterboxed stage edges',
  async (presentation) => {
    const args = fixture();
    args.tour.style.textAppearance.presentation = presentation;
    const slide = args.tour.slides[0]!;
    if (slide.kind !== 'image') throw new Error('Expected image');
    slide.hotspots = [];
    slide.annotations = [{ id: 'note', text: 'Slide explanation', anchor: null, appearance: null }];
    const dom = open(await buildTourPlayerHtml(args));
    const viewport = dom.window.document.querySelector('[data-tour-viewport]')!;
    const hint = dom.window.document.querySelector<HTMLElement>('[data-tour-hint]')!;
    Object.defineProperties(viewport, {
      clientWidth: { value: 608 },
      clientHeight: { value: 620 },
    });
    Object.defineProperties(hint, { offsetWidth: { value: 608 }, offsetHeight: { value: 120 } });
    const resize = dom.window.document.createEvent('Event');
    resize.initEvent('resize', false, false);
    dom.window.dispatchEvent(resize);
    expect(hint.style.width).toBe('608px');
    expect(hint.style.left).toBe('0px');
    expect(
      Number.parseFloat(presentation === 'caption-top' ? hint.style.top : hint.style.bottom)
    ).toBe(139);
    dom.close();
  }
);

it('exports visual blur through the shared renderer without authoring handles', async () => {
  const args = fixture();
  const first = args.tour.slides[0]!;
  if (first.kind !== 'image') throw new Error('Expected image');
  first.camera.mode = 'off';
  first.masks = [
    {
      id: 'blur',
      kind: 'blur',
      color: '#f97316',
      opacity: 0.3,
      blurRadius: 24,
      rect: { x: 0.1, y: 0.1, width: 0.3, height: 0.2 },
    },
  ];
  const dom = open(await buildTourPlayerHtml(args));
  const effect = dom.window.document.querySelector<HTMLElement>('.tour-mask-effect')!;
  expect(effect.style.backdropFilter).toBe('blur(24px)');
  expect(effect.style.opacity).toBe('');
  expect(dom.window.document.querySelector('.tour-resize-handle')).toBeNull();
  dom.close();
});

it('lays out one content frame above one bottom toolbar that owns every control', async () => {
  const dom = open(await buildTourPlayerHtml(fixture()));
  const document = dom.window.document;
  const main = document.getElementById('tour-player')!;
  const viewport = document.querySelector('.tour-viewport')!;
  const toolbar = document.querySelector('.tour-toolbar')!;
  expect(document.querySelectorAll('.tour-viewport')).toHaveLength(1);
  expect(document.querySelectorAll('.tour-toolbar')).toHaveLength(1);
  expect(document.querySelector('header')).toBeNull();
  expect(document.querySelector('.tour-transport')).toBeNull();
  expect(main.firstElementChild).toBe(viewport);
  expect(viewport.compareDocumentPosition(toolbar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  const ordered = [
    '[data-tour-play]',
    '[data-tour-seek]',
    '[data-tour-previous]',
    '[data-tour-next]',
    '[data-tour-contents]',
  ];
  const nodes = ordered.map((selector) => document.querySelector(selector)!);
  for (const node of nodes) expect(toolbar.contains(node)).toBe(true);
  for (let index = 1; index < nodes.length; index += 1)
    expect(
      nodes[index - 1]!.compareDocumentPosition(nodes[index]!) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  for (const selector of ordered) expect(document.querySelectorAll(selector)).toHaveLength(1);
  expect(document.querySelectorAll('[data-tour-counter]')).toHaveLength(1);
  expect(document.querySelectorAll('[data-tour-status]')).toHaveLength(1);
  expect(toolbar.contains(document.querySelector('[data-tour-title]'))).toBe(true);
  expect(toolbar.contains(document.querySelector('[data-tour-status]'))).toBe(true);
  dom.close();
});

it('keeps short slide explanations readable without a disclosure', async () => {
  const text = 'Slide explanation body';
  const args = fixture();
  args.tour.style.textAppearance.presentation = 'caption-bottom';
  const slide = args.tour.slides[0]!;
  if (slide.kind !== 'image') throw new Error('Expected image');
  slide.hotspots = [];
  slide.annotations = [{ id: 'note', text, anchor: null, appearance: null }];
  const dom = open(await buildTourPlayerHtml(args));
  const doc = dom.window.document;
  const toggle = doc.querySelector<HTMLButtonElement>('[data-tour-hint-toggle]')!;
  const body = doc.querySelector<HTMLElement>('[data-tour-hint-text]')!;
  expect(toggle.textContent?.trim()).toBe('Details');
  expect(body.textContent).toBe(text);
  expect(toggle.hidden).toBe(true);
  expect(body.hidden).toBe(false);
  toggle.click();
  expect(body.hidden).toBe(false);
  expect(body.textContent).toBe(text);
  dom.close();
});

it('separates action callouts and slide captions despite a shared caption default', async () => {
  const args = fixture();
  args.tour.style.textAppearance.presentation = 'caption-bottom';
  const slide = args.tour.slides[0]!;
  if (slide.kind !== 'image') throw new Error('Expected image');
  slide.hotspots[0]!.label = 'Continue';
  slide.hotspots[0]!.text = 'Explanation';
  slide.annotations = [
    {
      id: 'note',
      anchor: null,
      text: 'Slide note body',
      appearance: null,
    },
  ];
  const dom = open(await buildTourPlayerHtml(args));
  const doc = dom.window.document;
  const toggle = doc.querySelector<HTMLButtonElement>('[data-tour-hint-toggle]')!;
  expect(toggle.hidden).toBe(true);
  expect(doc.querySelector<HTMLElement>('[data-tour-hint]')!.dataset['presentation']).toBe(
    'callout'
  );
  doc.querySelector<HTMLButtonElement>('[data-tour-hint-next]')!.click();
  expect(doc.querySelector('[data-tour-hint-text]')!.textContent).toBe('Slide note body');
  expect(toggle.textContent?.trim()).toBe('Details');
  expect(doc.querySelector<HTMLElement>('[data-tour-hint]')!.dataset['presentation']).toBe(
    'caption-bottom'
  );
  dom.close();
});

it('rejects invalid embedded media before export', async () => {
  const broken = fixture();
  broken.assets = [{ id: 'image', mime: 'image/png', base64: 'not base64!!' }];
  await expect(buildTourPlayerHtml(broken)).rejects.toThrow('Invalid embedded tour media.');
});

it('streams the same shell through an abortable blob with embedded assets', async () => {
  const args = fixture();
  const blob = await buildTourPlayerBlob({
    ...args,
    assets: [
      {
        id: 'image',
        mime: 'image/png',
        blob: await (await fetch('data:image/png;base64,' + png)).blob(),
      },
    ],
    signal: new AbortController().signal,
  });
  expect(blob.type).toBe('text/html;charset=utf-8');
  const text = await blob.text();
  expect(text.split(png)).toHaveLength(2);
  expect(text).toContain('aria-haspopup="dialog"');
  const aborted = fixture();
  const controller = new AbortController();
  controller.abort();
  await expect(
    buildTourPlayerBlob({
      ...aborted,
      assets: [{ id: 'image', mime: 'image/png', blob: new Blob() }],
      signal: controller.signal,
    })
  ).rejects.toThrow();
  await expect(
    buildTourPlayerBlob({
      ...args,
      assets: [{ id: 'image', mime: 'image/png', blob: new Blob() }],
      signal: new AbortController().signal,
    })
  ).rejects.toThrow('Empty tour media.');
});

it('renders independent inherited and local element styles in the standalone artifact', async () => {
  const args = fixture();
  args.tour.style.hotspotAppearance = {
    presentation: 'callout',
    alignment: 'start',
    placement: 'auto',
    surface: { ...TOUR_HINT_SURFACE, radius: 23 },
  };
  args.tour.style.textAppearance = {
    presentation: 'caption-top',
    alignment: 'center',
    placement: 'auto',
    surface: { ...TOUR_HINT_SURFACE, radius: 8 },
  };
  args.tour.style.maskDefaults = { ...TOUR_MASK_DEFAULTS, blur: { radius: 30 } };
  const slide = args.tour.slides[0]!;
  if (slide.kind !== 'image') throw new Error('image fixture');
  slide.hotspots.push({
    ...slide.hotspots[0]!,
    id: 'local',
    appearance: {
      ...args.tour.style.hotspotAppearance,
      surface: { ...TOUR_HINT_SURFACE, radius: 5 },
    },
  });
  slide.annotations = [{ id: 'caption', text: 'Slide text', anchor: null, appearance: null }];
  slide.masks = [
    {
      id: 'linked',
      kind: 'blur',
      rect: { x: 0, y: 0, width: 0.1, height: 0.1 },
      color: '#111827',
      opacity: 0.3,
      inheritStyle: true,
    },
    {
      id: 'local-mask',
      kind: 'blur',
      rect: { x: 0.2, y: 0, width: 0.1, height: 0.1 },
      color: '#111827',
      opacity: 0.3,
      blurRadius: 7,
    },
  ];
  const dom = open(await buildTourPlayerHtml(args));
  const doc = dom.window.document;
  const hint = doc.querySelector<HTMLElement>('[data-tour-hint]')!;
  expect(hint.style.borderRadius).toBe('23px');
  doc.querySelector<HTMLButtonElement>('[data-tour-hint-next]')!.click();
  expect(hint.style.borderRadius).toBe('5px');
  doc.querySelector<HTMLButtonElement>('[data-tour-hint-next]')!.click();
  expect(hint.dataset['presentation']).toBe('caption-top');
  expect(hint.style.borderRadius).toBe('0 0 8px 8px');
  const effects = doc.querySelectorAll<HTMLElement>('.tour-mask-effect');
  expect(effects[0]!.style.backdropFilter).toBe('blur(30px)');
  expect(effects[1]!.style.backdropFilter).toBe('blur(7px)');
  dom.close();
});

it('traverses mixed explanations across slides in both directions with a controls-row position', async () => {
  const args = fixture();
  args.tour.endScreen.enabled = false;
  const first = args.tour.slides[0]!;
  const second = args.tour.slides[1]!;
  if (first.kind !== 'image' || second.kind !== 'image') throw new Error('Expected images');
  first.annotations = [{ id: 'note', text: 'First note', anchor: null, appearance: null }];
  first.objectOrder = ['note', 'point'];
  second.annotations = [{ id: 'last', text: 'Last note', anchor: null, appearance: null }];
  const dom = open(await buildTourPlayerHtml(args));
  try {
    const doc = dom.window.document;
    const next = doc.querySelector<HTMLButtonElement>('[data-tour-hint-next]')!;
    const previous = doc.querySelector<HTMLButtonElement>('[data-tour-hint-previous]')!;
    const body = doc.querySelector('[data-tour-hint-text]')!;
    const counter = doc.querySelector('[data-tour-hint-point-count]')!;
    expect(counter.parentElement?.className).toBe('tour-hint-controls');
    expect(body.textContent).toBe('First note');
    expect(counter.textContent).toBe('1 / 3');
    expect(previous.disabled).toBe(true);
    next.click();
    expect(body.textContent).toBe('Explanation');
    expect(counter.textContent).toBe('2 / 3');
    expect(next.disabled).toBe(false);
    next.click();
    expect(doc.getElementById('tour-player')?.dataset['slideId']).toBe('two');
    expect(body.textContent).toBe('Last note');
    expect(counter.textContent).toBe('3 / 3');
    expect(next.disabled).toBe(true);
    previous.click();
    expect(body.textContent).toBe('Explanation');
    expect(counter.textContent).toBe('2 / 3');
    previous.click();
    expect(body.textContent).toBe('First note');
    expect(previous.disabled).toBe(true);
  } finally {
    dom.close();
  }
});

it('returns to the last callout text page and keeps empty slides and ending reachable', async () => {
  const args = fixture();
  const first = args.tour.slides[0]!;
  const second = args.tour.slides[1]!;
  if (first.kind !== 'image' || second.kind !== 'image') throw new Error('Expected images');
  first.hotspots[0]!.text = 'A'.repeat(170);
  second.annotations = [{ id: 'last', text: 'Last note', anchor: null, appearance: null }];
  const dom = open(await buildTourPlayerHtml(args));
  try {
    const doc = dom.window.document;
    const next = doc.querySelector<HTMLButtonElement>('[data-tour-hint-next]')!;
    const previous = doc.querySelector<HTMLButtonElement>('[data-tour-hint-previous]')!;
    const body = doc.querySelector('[data-tour-hint-text]')!;
    next.click();
    expect(body.textContent).toBe('A'.repeat(10));
    next.click();
    expect(body.textContent).toBe('Last note');
    previous.click();
    expect(body.textContent).toBe('A'.repeat(10));
    previous.click();
    expect(body.textContent).toBe('A'.repeat(160));
    next.click();
    next.click();
    next.click();
    expect(doc.getElementById('tour-player')?.dataset['slideId']).toBe('end');
    doc.querySelector<HTMLButtonElement>('[data-tour-previous]')!.click();
    expect(doc.getElementById('tour-player')?.dataset['slideId']).toBe('two');
  } finally {
    dom.close();
  }
  second.annotations = [];
  const empty = open(await buildTourPlayerHtml(args));
  try {
    const doc = empty.window.document;
    const next = doc.querySelector<HTMLButtonElement>('[data-tour-hint-next]')!;
    next.click();
    next.click();
    expect(doc.getElementById('tour-player')?.dataset['slideId']).toBe('two');
    expect(doc.querySelector<HTMLElement>('[data-tour-hint]')!.hidden).toBe(true);
    doc.querySelector<HTMLButtonElement>('[data-tour-next]')!.click();
    expect(doc.getElementById('tour-player')?.dataset['slideId']).toBe('end');
  } finally {
    empty.close();
  }
});

it('exports marker overrides without rewriting source points', async () => {
  const args = fixture();
  const slide = args.tour.slides[0]!;
  if (slide.kind !== 'image') throw new Error('Expected image slide');
  args.tour.style.markerAppearance = { color: '#2367ab', pulseColor: '#ab3267', size: 48 };
  args.tour.style.hotspotAppearance = {
    ...args.tour.style.textAppearance,
    calloutGap: 80,
  };
  slide.hotspots.push({
    ...slide.hotspots[0]!,
    id: 'local',
    point: { x: 0.75, y: 0.5 },
    pulse: false,
    markerAppearance: { color: '#123456', pulseColor: null, size: 16 },
  });
  const saved = JSON.stringify(args.tour);
  const dom = open(await buildTourPlayerHtml(args));
  try {
    const markers = [...dom.window.document.querySelectorAll<HTMLElement>('.tour-hotspot')];
    expect(markers[0]!.style.getPropertyValue('--tour-marker-color')).toBe('#2367ab');
    expect(markers[0]!.style.getPropertyValue('--tour-marker-size')).toBe('48px');
    expect(markers[1]!.style.getPropertyValue('--tour-marker-color')).toBe('#123456');
    expect(markers[1]!.style.getPropertyValue('--tour-marker-pulse-color')).toBe(
      args.tour.style.accent
    );
    expect(markers[1]!.dataset['pulse']).toBe('false');
    const exported = JSON.parse(dom.window.document.querySelector('#tour-data')!.textContent!);
    expect(exported.tour.style.hotspotAppearance.calloutGap).toBe(80);
    expect(
      exported.tour.slides[0].hotspots.map((point: { point: unknown }) => point.point)
    ).toEqual(slide.hotspots.map((point) => point.point));
    expect(JSON.stringify(args.tour)).toBe(saved);
  } finally {
    dom.close();
  }
});

it('keeps legacy marker rendering transparent with its existing responsive size and accent pulse', async () => {
  const args = fixture();
  const dom = open(await buildTourPlayerHtml(args));
  try {
    const marker = dom.window.document.querySelector<HTMLElement>('.tour-hotspot')!;
    expect(marker.style.getPropertyValue('--tour-marker-color')).toBe('transparent');
    expect(marker.style.getPropertyValue('--tour-marker-pulse-color')).toBe(args.tour.style.accent);
    expect(marker.style.getPropertyValue('--tour-marker-size')).toBe('');
    expect(marker.dataset['pulse']).toBe('true');
  } finally {
    dom.close();
  }
});
