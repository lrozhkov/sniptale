// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  createGuideProject,
  createTourDocument,
  createTourImageSlide,
  applyTourCommands,
  getTourImages,
} from '../../../features/scenario/project/public';
import type { GuideProject } from '@sniptale/runtime-contracts/scenario/types/guide';
import { createTranslator } from '../../../platform/i18n';
import { TourInspector } from './inspector';
import type { TourSelection } from './selection';
let root: Root;
let host: HTMLDivElement;
let project: GuideProject;
let selected: TourSelection | null;
let scope: 'selection' | 'document';
let disabled: boolean;
let presentation: 'all' | 'sections';
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  project = createGuideProject('Project');
  project.tour = createTourDocument();
  const image = createTourImageSlide('image');
  image.image = {
    assetId: 'image',
    width: 100,
    height: 100,
    alt: 'Original',
    galleryAssetId: null,
    editDocumentId: null,
    source: { kind: 'import', filename: 'test.png' },
  };
  project.tour.slides = [
    image,
    {
      kind: 'navigation',
      id: 'nav',
      title: 'Navigation',
      description: 'Description',
      background: { color: '#111827', image: null },
      buttons: [],
      narration: null,
      timing: image.timing,
    },
  ];
  selected = { kind: 'slide', slideId: 'image', objectId: null };
  scope = 'selection';
  disabled = false;
  presentation = 'all';
  draw();
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
function draw() {
  const slideId = selected?.kind === 'slide' ? selected.slideId : null;
  act(() =>
    root.render(
      <TourInspector
        presentation={presentation}
        narration={<div data-testid="narration-slot" />}
        tour={project.tour!}
        slide={project.tour!.slides.find((s) => s.id === slideId) ?? null}
        selection={selected}
        scope={scope}
        disabled={disabled}
        t={createTranslator('en')}
        onChangeSlide={(slide) => accept({ kind: 'replace-slide', slideId: slide.id, slide })}
        onChangeTour={(tour) => accept({ kind: 'replace-tour', tour })}
        onSelectObject={(id) => {
          if (selected?.kind === 'slide') selected = { ...selected, objectId: id };
          draw();
        }}
      />
    )
  );
}
function accept(command: Parameters<typeof applyTourCommands>[1][number]) {
  try {
    project = applyTourCommands(project, [command], {
      images: getTourImages(project.tour!),
      audio: [],
    });
    draw();
    return true;
  } catch {
    return false;
  }
}
function current() {
  const slide = project.tour!.slides[0]!;
  if (slide.kind !== 'image') throw new Error('Expected image');
  return slide;
}
async function click(label: string) {
  const buttons = [...document.querySelectorAll<HTMLButtonElement>('button')];
  const button =
    buttons.find((n) => n.getAttribute('aria-label') === label) ??
    buttons.find((n) => n.title === label || n.textContent?.trim() === label);
  if (!button) throw new Error(`Missing button ${label}: ${host.textContent}`);
  await act(async () => button.click());
}
async function choose(label: string, option: string) {
  await click(label);
  const entry = [
    ...document.querySelectorAll<HTMLElement>('[role=option], .guide-action-menu button'),
  ].find((n) => n.textContent?.trim() === option);
  if (!entry) throw new Error(`Missing option ${option}`);
  await act(async () => entry.click());
}
async function fill(label: string, value: string) {
  const field = [
    ...host.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input,textarea'),
  ].find((n) => n.getAttribute('aria-label') === label);
  if (!field) throw new Error(`Missing field ${label}`);
  const prototype =
    field instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(field, value);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => field.dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
}
it('exposes global and local text alignment with placement only for callouts', async () => {
  scope = 'document';
  draw();
  presentation = 'sections';
  draw();
  await click('Hotspot');
  await choose('Text alignment', 'Center');
  await choose('Callout placement', 'Above');
  expect(project.tour!.style.hotspotAppearance).toMatchObject({
    alignment: 'center',
    placement: 'top',
  });
  await click('Slide explanation');
  await choose('Placement on slide', 'Bottom captions');
  expect(
    [...host.querySelectorAll('button')].some(
      (node) => node.getAttribute('aria-label') === 'Callout placement'
    )
  ).toBe(false);
});

it('separates document defaults from slide settings and exposes every category', async () => {
  presentation = 'sections';
  scope = 'document';
  draw();
  expect(host.querySelector('[aria-label="Auto Zoom to hotspot"]')).toBeNull();
  await click('Slide explanation');
  await fill('Explanation width', '300');
  expect(project.tour!.style.textAppearance.surface?.width).toBe(300);
  await click('Playback');
  expect(host.querySelector('[aria-label="Auto Zoom to hotspot"]')).not.toBeNull();
  await click('Transitions');
  expect(host.querySelector('section[aria-label="Transitions"]')).not.toBeNull();
  scope = 'selection';
  selected = { kind: 'slide', slideId: 'nav', objectId: null };
  draw();
  await click('Composition');
  expect(host.querySelector('input[aria-label="Content width"]')).not.toBeNull();
  selected = { kind: 'end' };
  draw();
  expect(host.querySelector('nav')).toBeNull();
});

it('renders exactly one heading per section in both presentations and keeps nested subgroups', async () => {
  scope = 'document';
  presentation = 'sections';
  draw();
  for (const label of ['Appearance', 'Slide explanation', 'Playback', 'Transitions']) {
    await click(label);
    const heading = host.querySelector('[data-ui="shared.categorized-inspector.section-heading"]')!;
    expect(heading.textContent).toContain(label);
    expect(
      host.querySelectorAll('.guide-inspector-group-heading'),
      `${label} must not repeat the section heading inside its content`
    ).toHaveLength(0);
  }
  presentation = 'all';
  draw();
  const groups = [...host.querySelectorAll('.guide-inspector-group')];
  expect(groups).toHaveLength(8);
  for (const group of groups)
    expect(group.querySelectorAll('.guide-inspector-group-heading')).toHaveLength(1);
  scope = 'selection';
  selected = { kind: 'slide', slideId: 'nav', objectId: null };
  presentation = 'sections';
  draw();
  for (const label of ['Navigation slide', 'Composition', 'Contents links']) {
    await click(label);
    const heading = host.querySelector('[data-ui="shared.categorized-inspector.section-heading"]')!;
    expect(heading.textContent).toContain(label);
    expect(host.querySelectorAll('.guide-inspector-group-heading')).toHaveLength(0);
  }
  const linksHeading = host.querySelector(
    '[data-ui="shared.categorized-inspector.section-heading"]'
  )!;
  expect(linksHeading.querySelector('button[title="Add button"]')).not.toBeNull();
  selected = { kind: 'slide', slideId: 'image', objectId: null };
  draw();
  await click('Playback');
  const subgroupHeadings = [...host.querySelectorAll('.guide-inspector-group-heading')].map(
    (node) => node.textContent?.trim()
  );
  expect(subgroupHeadings).toEqual([expect.stringContaining('Timing and autoplay')]);
});

it('remembers document disclosure groups independently after leaving document settings', async () => {
  scope = 'document';
  draw();
  const disclosure = (label: string) =>
    host.querySelector<HTMLButtonElement>(
      `section[aria-label="${label}"] .guide-inspector-disclosure`
    )!;
  await act(async () => disclosure('Appearance').click());
  expect(disclosure('Appearance').getAttribute('aria-expanded')).toBe('false');
  expect(disclosure('Slide explanation').getAttribute('aria-expanded')).toBe('true');
  await act(async () => disclosure('Slide explanation').click());
  await act(async () => disclosure('Appearance').click());
  scope = 'selection';
  draw();
  scope = 'document';
  draw();
  expect(disclosure('Appearance').getAttribute('aria-expanded')).toBe('true');
  expect(disclosure('Slide explanation').getAttribute('aria-expanded')).toBe('false');
});

it('detaches and restores text styles independently from central categories', async () => {
  await click('Hotspot');
  expect(current().hotspots[0]!.appearance).toBeNull();
  await click('Use tour style');
  const local = structuredClone(current().hotspots[0]!.appearance);
  scope = 'document';
  presentation = 'sections';
  draw();
  await click('Hotspot');
  await fill('Explanation width', '420');
  expect(project.tour!.style.hotspotAppearance?.surface?.width).toBe(420);
  expect(project.tour!.style.textAppearance.surface).toBeUndefined();
  expect(current().hotspots[0]!.appearance).toEqual(local);
  await click('Slide explanation');
  await fill('Explanation width', '280');
  expect(project.tour!.style.textAppearance.surface?.width).toBe(280);
  expect(project.tour!.style.hotspotAppearance?.surface?.width).toBe(420);
  scope = 'selection';
  presentation = 'all';
  draw();
  await click('Use tour style');
  expect(current().hotspots[0]!.appearance).toBeNull();
  expect(host.querySelector<HTMLInputElement>('input[aria-label="Explanation width"]')?.value).toBe(
    '420'
  );
});

it('keeps effect defaults independent and restores inherited mask appearance', async () => {
  await click('Highlight');
  expect(current().masks[0]!.inheritStyle).toBe(true);
  await click('Use tour style');
  const local = structuredClone(current().masks[0]);
  scope = 'document';
  presentation = 'sections';
  draw();
  await click('Highlight');
  await fill('Blur radius', '32');
  expect(project.tour!.style.maskDefaults?.blur.radius).toBe(32);
  expect(project.tour!.style.maskDefaults?.highlight.opacity).toBe(0.3);
  expect(current().masks[0]).toEqual(local);
  scope = 'selection';
  presentation = 'all';
  draw();
  await choose('Highlight', 'Blur');
  expect(host.querySelector<HTMLInputElement>('input[aria-label="Blur radius"]')?.value).toBe('12');
  await click('Use tour style');
  expect(host.querySelector<HTMLInputElement>('input[aria-label="Blur radius"]')?.value).toBe('32');
  await fill('Blur radius', '20');
  expect(current().masks[0]!.inheritStyle).toBe(false);
  expect(project.tour!.style.maskDefaults?.blur.radius).toBe(32);
});
