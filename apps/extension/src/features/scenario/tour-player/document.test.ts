// @vitest-environment jsdom
import { getTourHotspots } from '@sniptale/runtime-contracts/scenario/types/tour';
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
function fixture(binding: 'slides' | 'stage' = 'slides') {
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
  slide.actions = [
    ...slide.actions.filter((entry) => entry.type !== 'hotspot'),
    ...[
      {
        id: 'point',
        point: { x: 0.25, y: 0.5 },
        targetRect: null,
        label: 'Continue',
        text: 'Explanation',
        appearance: null,
        visual: { kind: 'point' as const, pulse: true },
      },
    ].map((object) => ({ type: 'hotspot' as const, object })),
  ];
  tour.slides = [
    slide,
    {
      ...createTourImageSlide('two'),
      title: 'Second',
      image: slide.image,
      actions: [
        {
          type: 'annotation',
          object: { id: 'second-action', text: 'Second', anchor: null, appearance: null },
        },
      ],
    },
  ];
  if (binding === 'stage') {
    tour.stage.image = slide.image;
    tour.slides = tour.slides.map((item) =>
      item.kind === 'image'
        ? {
            ...item,
            image: null,
            actions: [
              {
                type: 'annotation',
                object: { id: `${item.id}-text`, text: item.title, anchor: null, appearance: null },
              },
            ],
          }
        : item
    );
  }
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

it.each(['slides', 'stage'] as const)(
  'embeds %s media once with public metadata and fixed CSP',
  async (binding) => {
    const html = await buildTourPlayerHtml(fixture(binding));
    const payload = JSON.parse(
      new DOMParser().parseFromString(html, 'text/html').querySelector('#tour-data')!.textContent!
    );
    expect(payload.tour.stage.image ?? payload.tour.slides[0].image).toEqual({
      assetId: 'image',
      width: 640,
      height: 360,
      alt: 'Screenshot',
    });
    expect(html.split(png)).toHaveLength(2);
    expect(html).not.toContain('private-file.png');
    expect(html).not.toContain('private-library');
    expect(html).toContain('default-src &#39;none&#39;');
    expect(html).toContain('sha256-');
    expect(html).not.toContain('chrome-extension://');
  }
);
it('treats authored text as text through both JSON and visible title boundaries', async () => {
  const args = fixture();
  const attack = '</script><img src=x onerror="globalThis.pwned=1">';
  args.title = attack;
  args.tour.slides[0]!.title = attack;
  const first = args.tour.slides[0]!;
  if (first.kind === 'image') getTourHotspots(first)[0]!.label = attack;
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
it('projects the camera and legacy marker appearance through one source-image box', async () => {
  const args = fixture();
  const first = args.tour.slides[0]!;
  if (first.kind !== 'image') throw new Error('image expected');
  first.camera = { mode: 'manual', zoom: 2, center: { x: 0.25, y: 0.5 } };
  const dom = open(await buildTourPlayerHtml(args));
  const marker = dom.window.document.querySelector<HTMLElement>('.tour-hotspot')!;
  const image = dom.window.document.querySelector<HTMLElement>('.tour-image')!;
  expect(marker.style.left).toBe('310px');
  expect(marker.style.top).toBe('174.375px');
  expect(marker.style.getPropertyValue('--tour-marker-color')).toBe('transparent');
  expect(marker.style.getPropertyValue('--tour-marker-pulse-color')).toBe(args.tour.style.accent);
  expect(marker.style.getPropertyValue('--tour-marker-size')).toBe('');
  expect(marker.dataset['pulse']).toBe('true');
  expect(image.style.width).toBe('1240px');
  dom.close();
});
it.each(['slides', 'stage'] as const)(
  'rejects invalid %s media and unprepared redaction',
  async (binding) => {
    const args = fixture(binding);
    await expect(buildTourPlayerHtml({ ...args, assets: [] })).rejects.toThrow('Missing');
    await expect(
      buildTourPlayerHtml({ ...args, assets: [...args.assets, ...args.assets] })
    ).rejects.toThrow('Duplicate');
    for (const asset of [
      { id: 'image', mime: 'image/svg+xml', base64: png },
      { id: 'image', mime: 'audio/wav', base64: png },
      { id: 'image', mime: 'image/png', base64: 'not base64!!' },
    ]) {
      const exported = buildTourPlayerHtml({ ...args, assets: [asset] });
      await expect(exported).rejects.toThrow('Invalid embedded');
    }
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
    first.actions.unshift({
      type: 'annotation' as const,
      object: {
        id: first.id + '-voice',
        text: '',
        anchor: null,
        appearance: null,
        narration: {
          ...{
            assetId: 'image',
            duration: 1,
            trimStart: 0,
            trimEnd: 1,
            gain: 1,
            transcript: '',
          },
          trigger: 'enter' as const,
        },
      },
    });
    await expect(buildTourPlayerHtml(args)).rejects.toThrow('Invalid tour');
  }
);

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
  args.tour.slides.push(fixture().tour.slides[0]!);
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
  getTourHotspots(slide)[0]!.narration = {
    assetId: 'voice',
    duration: 2,
    trimStart: 0,
    trimEnd: 2,
    gain: 1,
    transcript: 'Voice',
    trigger: 'activation' as const,
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
  expect(doc.querySelector('[data-tour-hint-point-count]')?.textContent).toBe('1 / 2');
  expect(doc.querySelector('[data-tour-hint-action-title]')?.textContent).toBe('Continue');
  dom.close();
});

it('shows each action name in the callout header and omits an empty description', async () => {
  const args = fixture();
  const slide = args.tour.slides[0]!;
  if (slide.kind !== 'image') throw new Error('Expected image');
  slide.actions.push({
    type: 'hotspot' as const,
    object: {
      ...getTourHotspots(slide)[0]!,
      id: 'empty-description',
      label: 'Finish setup',
      text: '  ',
    },
  });
  const dom = open(await buildTourPlayerHtml(args));
  const doc = dom.window.document;
  expect(doc.querySelector('[data-tour-hint-point-count]')?.textContent).toBe('1 / 3');
  expect(doc.querySelector('[data-tour-hint-action-title]')?.textContent).toBe('Continue');
  expect(doc.querySelector<HTMLElement>('[data-tour-hint-text]')?.hidden).toBe(false);
  expect(doc.querySelector('[data-tour-hint-text]')?.textContent).toBe('Explanation');
  doc.querySelector<HTMLButtonElement>('[data-tour-hint-next]')!.click();
  expect(doc.querySelector('[data-tour-hint-point-count]')?.textContent).toBe('2 / 3');
  expect(doc.querySelector('[data-tour-hint-action-title]')?.textContent).toBe('Finish setup');
  expect(doc.querySelector<HTMLElement>('[data-tour-hint-text]')?.hidden).toBe(true);
  dom.close();
});

it('keeps hint surfaces decorative while Next advances one action regardless of text length', async () => {
  const args = fixture();
  const slide = args.tour.slides[0]!;
  if (slide.kind !== 'image') throw new Error('Expected image.');
  getTourHotspots(slide)[0]!.text = 'A'.repeat(170);
  slide.actions.push({
    type: 'hotspot',
    object: {
      ...getTourHotspots(slide)[0]!,
      id: 'next-point',
      label: 'Second',
      text: 'Second explanation',
    },
  });
  const dom = open(await buildTourPlayerHtml(args));
  try {
    const doc = dom.window.document;
    const hint = doc.querySelector<HTMLElement>('[data-tour-hint]')!;
    expect(hint.style.backgroundImage).not.toContain('url(');
    expect(doc.querySelector('[data-tour-hint-text]')!.textContent).toBe('A'.repeat(170));
    expect(doc.querySelector<HTMLElement>('[data-tour-hint-count]')!.hidden).toBe(true);
    doc.querySelector<HTMLButtonElement>('[data-tour-hint-next]')!.click();
    expect(doc.querySelector('[data-tour-hint-text]')!.textContent).toBe('Second explanation');
    expect(doc.querySelector('[data-tour-counter]')!.textContent).toBe('2 / 3');
    doc.querySelector<HTMLButtonElement>('[data-tour-hint-previous]')!.click();
    expect(doc.querySelector('[data-tour-hint-text]')!.textContent).toBe('A'.repeat(170));
  } finally {
    dom.close();
  }
});

it.each(['caption-top', 'caption-bottom'] as const)(
  'discloses %s without losing text position or mixing counters',
  async (presentation) => {
    const args = fixture();
    const slide = args.tour.slides[0]!;
    if (slide.kind !== 'image') throw new Error('Expected image');
    slide.actions = [
      ...slide.actions.filter((entry) => entry.type !== 'hotspot'),
      ...[].map((object) => ({ type: 'hotspot' as const, object })),
    ];
    slide.actions = [
      ...slide.actions.filter((entry) => entry.type !== 'annotation'),
      ...[
        { id: 'first-note', text: 'A'.repeat(170), anchor: null, appearance: null },
        { id: 'second-note', text: 'Second body', anchor: null, appearance: null },
      ].map((object) => ({ type: 'annotation' as const, object })),
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
    expect(doc.querySelector('[data-tour-hint-point-count]')!.textContent).toBe('1 / 3');
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
    expect(doc.querySelector('[data-tour-hint-point-count]')!.textContent).toBe('2 / 3');
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
    slide.actions = [
      ...slide.actions.filter((entry) => entry.type !== 'hotspot'),
      ...[].map((object) => ({ type: 'hotspot' as const, object })),
    ];
    slide.actions = [
      ...slide.actions.filter((entry) => entry.type !== 'annotation'),
      ...[{ id: 'note', text: 'Slide explanation', anchor: null, appearance: null }].map(
        (object) => ({ type: 'annotation' as const, object })
      ),
    ];
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
    expect(hint.style.width).toBe('588px');
    expect(hint.style.left).toBe('10px');
    expect(
      Number.parseFloat(presentation === 'caption-top' ? hint.style.top : hint.style.bottom)
    ).toBe(144.625);
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
  expect(effect.style.backdropFilter).toBe('blur(23.25px)');
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
  slide.actions = [
    ...slide.actions.filter((entry) => entry.type !== 'hotspot'),
    ...[].map((object) => ({ type: 'hotspot' as const, object })),
  ];
  slide.actions = [
    ...slide.actions.filter((entry) => entry.type !== 'annotation'),
    ...[{ id: 'note', text, anchor: null, appearance: null }].map((object) => ({
      type: 'annotation' as const,
      object,
    })),
  ];
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
  getTourHotspots(slide)[0]!.label = 'Continue';
  getTourHotspots(slide)[0]!.text = 'Explanation';
  slide.actions = [
    ...slide.actions.filter((entry) => entry.type !== 'annotation'),
    ...[
      {
        id: 'note',
        anchor: null,
        text: 'Slide note body',
        appearance: null,
      },
    ].map((object) => ({ type: 'annotation' as const, object })),
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
    presentation: 'callout' as const,
    alignment: 'start' as const,
    placement: 'auto' as const,
    surface: { ...TOUR_HINT_SURFACE, radius: 23 },
  };
  args.tour.style.textAppearance = {
    presentation: 'caption-top' as const,
    alignment: 'center' as const,
    placement: 'auto' as const,
    surface: { ...TOUR_HINT_SURFACE, radius: 8 },
  };
  args.tour.style.maskDefaults = { ...TOUR_MASK_DEFAULTS, blur: { radius: 30 } };
  const slide = args.tour.slides[0]!;
  if (slide.kind !== 'image') throw new Error('image fixture');
  slide.actions.push({
    type: 'hotspot' as const,
    object: {
      ...getTourHotspots(slide)[0]!,
      id: 'local',
      appearance: {
        ...args.tour.style.hotspotAppearance,
        surface: { ...TOUR_HINT_SURFACE, radius: 5 },
      },
    },
  });
  slide.actions = [
    ...slide.actions.filter((entry) => entry.type !== 'annotation'),
    ...[{ id: 'caption', text: 'Slide text', anchor: null, appearance: null }].map((object) => ({
      type: 'annotation' as const,
      object,
    })),
  ];
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
  expect(effects[0]!.style.backdropFilter).toBe('blur(29.0625px)');
  expect(effects[1]!.style.backdropFilter).toBe('blur(6.78125px)');
  dom.close();
});

it('traverses mixed explanations across slides in both directions with a controls-row position', async () => {
  const args = fixture();
  args.tour.endScreen.enabled = false;
  const first = args.tour.slides[0]!;
  const second = args.tour.slides[1]!;
  if (first.kind !== 'image' || second.kind !== 'image') throw new Error('Expected images');
  first.actions = [
    ...first.actions.filter((entry) => entry.type !== 'annotation'),
    ...[{ id: 'note', text: 'First note', anchor: null, appearance: null }].map((object) => ({
      type: 'annotation' as const,
      object,
    })),
  ];
  first.actions.sort(
    (left, right) =>
      ['note', 'point'].indexOf(left.object.id) - ['note', 'point'].indexOf(right.object.id)
  );
  second.actions = [
    ...second.actions.filter((entry) => entry.type !== 'annotation'),
    ...[{ id: 'last', text: 'Last note', anchor: null, appearance: null }].map((object) => ({
      type: 'annotation' as const,
      object,
    })),
  ];
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

it('keeps complete action text on Back and skips empty containers before the end screen', async () => {
  const args = fixture();
  const first = args.tour.slides[0]!;
  const second = args.tour.slides[1]!;
  if (first.kind !== 'image' || second.kind !== 'image') throw new Error('Expected images.');
  getTourHotspots(first)[0]!.text = 'A'.repeat(170);
  second.actions = [
    {
      type: 'annotation',
      object: { id: 'last', text: 'Last note', anchor: null, appearance: null },
    },
  ];
  const dom = open(await buildTourPlayerHtml(args));
  try {
    const doc = dom.window.document;
    doc.querySelector<HTMLButtonElement>('[data-tour-hint-next]')!.click();
    expect(doc.querySelector('[data-tour-hint-text]')!.textContent).toBe('Last note');
    doc.querySelector<HTMLButtonElement>('[data-tour-hint-previous]')!.click();
    expect(doc.querySelector('[data-tour-hint-text]')!.textContent).toBe('A'.repeat(170));
  } finally {
    dom.close();
  }
  second.actions = [];
  const empty = open(await buildTourPlayerHtml(args));
  try {
    const doc = empty.window.document;
    expect(doc.querySelector('[data-tour-counter]')!.textContent).toBe('1 / 1');
    expect(JSON.parse(doc.querySelector('#tour-data')!.textContent!).tour.slides).toHaveLength(1);
    doc.querySelector<HTMLButtonElement>('[data-tour-next]')!.click();
    expect(doc.getElementById('tour-player')!.dataset['slideId']).toBe('end');
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
  slide.actions.push({
    type: 'hotspot' as const,
    object: {
      ...getTourHotspots(slide)[0]!,
      id: 'local',
      point: { x: 0.75, y: 0.5 },
      markerAppearance: { color: '#123456', pulseColor: null, size: 16 },
      visual: { kind: 'point' as const, pulse: false },
    },
  });
  const saved = JSON.stringify(args.tour);
  const dom = open(await buildTourPlayerHtml(args));
  try {
    const markers = [...dom.window.document.querySelectorAll<HTMLElement>('.tour-hotspot')];
    expect(markers[0]!.style.getPropertyValue('--tour-marker-color')).toBe('#2367ab');
    expect(markers[0]!.style.getPropertyValue('--tour-marker-size')).toBe('48px');
    expect(markers).toHaveLength(1);
    dom.window.document.querySelector<HTMLButtonElement>('[data-tour-next]')!.click();
    const localMarker = dom.window.document.querySelector<HTMLElement>('.tour-hotspot')!;
    expect(localMarker.style.getPropertyValue('--tour-marker-color')).toBe('#123456');
    expect(localMarker.style.getPropertyValue('--tour-marker-pulse-color')).toBe(
      args.tour.style.accent
    );
    expect(localMarker.dataset['pulse']).toBe('false');
    const exported = JSON.parse(dom.window.document.querySelector('#tour-data')!.textContent!);
    expect(exported.tour.style.hotspotAppearance.calloutGap).toBe(80);
    expect(
      getTourHotspots(exported.tour.slides[0]).map((point: { point: unknown }) => point.point)
    ).toEqual(getTourHotspots(slide).map((point) => point.point));
    expect(JSON.stringify(args.tour)).toBe(saved);
  } finally {
    dom.close();
  }
});
