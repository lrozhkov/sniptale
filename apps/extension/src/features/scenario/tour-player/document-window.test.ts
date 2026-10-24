// @vitest-environment jsdom
import { DEFAULT_WINDOW_HEADER } from '@sniptale/runtime-contracts/window-header';
import { expect, it } from 'vitest';
import { buildTourPlayerHtml } from './document';
import { fixture, open } from './document.test-support';

it('exports a passive shared window header while preserving authored source placement', async () => {
  const args = fixture();
  args.tour.stage.windowHeader = {
    ...DEFAULT_WINDOW_HEADER,
    kind: 'application',
    title: 'Image window',
  };
  const slide = args.tour.slides[0]!;
  if (slide.kind !== 'image') throw new Error('Expected image');
  slide.imagePlacement = { center: { x: 0.3, y: 0.5 }, zoom: 2 };
  const saved = structuredClone(args.tour);
  const dom = open(await buildTourPlayerHtml(args));
  try {
    const header = dom.window.document.querySelector<HTMLImageElement>('.tour-window-header')!;
    expect(header.src).toMatch(/^data:image\/svg\+xml/);
    expect(decodeURIComponent(header.src)).toContain('Image window');
    const image = dom.window.document.querySelector<HTMLElement>('.tour-image')!;
    expect(header.parentElement).toBe(image.parentElement);
    expect(parseFloat(header.style.width)).toBeCloseTo(parseFloat(image.style.width));
    expect(parseFloat(header.style.top) + parseFloat(header.style.height)).toBeCloseTo(
      parseFloat(image.style.top)
    );
    const payload = JSON.parse(dom.window.document.querySelector('#tour-data')!.textContent!);
    expect(payload.tour.stage.windowHeader).toEqual(args.tour.stage.windowHeader);
    expect(payload.tour.slides[0].imagePlacement).toEqual(slide.imagePlacement);
    expect(args.tour).toEqual(saved);
  } finally {
    dom.close();
  }
});
