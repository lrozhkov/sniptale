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
  const entry = [...document.querySelectorAll<HTMLElement>('[role=option]')].find(
    (n) => n.textContent?.trim() === option
  );
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
it('edits an image slide and hotspots through canonical commands without changing source metadata', async () => {
  const source = current().image!.source;
  await fill('Step title', 'New title');
  await fill('Image description', 'Accessible image');
  await choose('Image fit', 'Fill');
  expect(current().title).toBe('New title');
  expect(current().fit).toBe('cover');
  await click('Hotspot');
  await fill('Action label', 'Open settings');
  await fill('Text', 'Click here');
  await click('Pulse hotspot');
  await fill('X', '30');
  await fill('Y', '40');
  await click('Target area');
  await click('Target area');
  await choose('Explanations', 'Top captions');
  await choose('Explanations', 'Use tour default');
  await choose('On click', 'Open link');
  await fill('Open link', 'javascript:alert(1)');
  expect(host.querySelector('[role=alert]')).not.toBeNull();
  await fill('Open link', 'https://example.com/');
  expect(current().hotspots[0]?.action).toEqual({ kind: 'url', url: 'https://example.com/' });
  await choose('On click', 'Go to slide');
  await choose('Go to slide', '2. Navigation');
  expect(current().hotspots[0]?.action).toEqual({ kind: 'slide', slideId: 'nav' });
  expect(current().hotspots[0]?.point).toEqual({ x: 0.3, y: 0.4 });
  expect(current().image!.source).toEqual(source);
  await click('Back to slide settings');
  await click('Open settings');
  await click('Delete');
  expect(current().hotspots).toHaveLength(0);
});
it('edits annotations and masks, keeping their geometry bounded and supports deletion', async () => {
  await click('Callout');
  await fill('Text', 'A note');
  await click('Anchor to a point');
  await click('Anchor to a point');
  await fill('X', '20');
  await choose('Explanations', 'Bottom captions');
  expect(current().annotations[0]?.appearance?.presentation).toBe('caption-bottom');
  await click('Back to slide settings');
  await click('Highlight');
  await choose('Highlight', 'Spotlight');
  await fill('X', '10');
  await fill('Y', '15');
  await choose('Highlight', 'Redact area');
  expect(current().masks[0]?.opacity).toBe(1);
  await click('Delete');
  expect(current().masks).toHaveLength(0);
  await click('A note');
  await click('Delete');
  expect(current().annotations).toHaveLength(0);
});
it('edits navigation and end screen in independent scopes', async () => {
  selected = { kind: 'slide', slideId: 'nav', objectId: null };
  draw();
  await fill('Step title', 'Contents');
  await fill('Text', 'Choose a route');
  await click('Add button');
  await fill('Text', 'Start');
  await choose('On click', 'Restart');
  const nav = project.tour!.slides[1]!;
  expect(nav.kind === 'navigation' && nav.buttons[0]?.action.kind).toBe('restart');
  await click('Back to slide settings');
  await click('1. Start');
  await click('Delete');
  selected = { kind: 'end' };
  draw();
  await click('Show end screen');
  await fill('Step title', 'Finished');
  await fill('Text', 'Thank you');
  await click('Restart');
  expect(project.tour!.endScreen.title).toBe('Finished');
  expect(project.tour!.endScreen.description).toBe('Thank you');
});
it('exposes document appearance separately and keeps mutations disabled while locked', async () => {
  scope = 'document';
  draw();
  await choose('Stage aspect ratio', '9:16');
  expect(project.tour!.stage.aspect).toBe('9:16');
  scope = 'selection';
  selected = { kind: 'slide', slideId: 'image', objectId: null };
  disabled = true;
  draw();
  expect(
    [...host.querySelectorAll('input,textarea')].every((n) => (n as HTMLInputElement).disabled)
  ).toBe(true);
  await click('Hotspot');
  expect(current().hotspots).toHaveLength(0);
  selected = null;
  draw();
  expect(host.querySelector('.guide-inspector-hint')).not.toBeNull();
});

it.each(['image', 'navigation'] as const)(
  'keeps action drafts local to the selected %s object',
  async (kind) => {
    const slide = kind === 'image' ? current() : project.tour!.slides[1]!;
    if (slide.kind === 'image')
      slide.hotspots = ['a', 'b'].map((id) => ({
        id,
        point: { x: 0.5, y: 0.5 },
        targetRect: null,
        label: id,
        text: '',
        action: { kind: 'next' },
        appearance: null,
        pulse: false,
      }));
    else slide.buttons = ['a', 'b'].map((id) => ({ id, label: id, action: { kind: 'next' } }));
    selected = { kind: 'slide', slideId: slide.id, objectId: 'a' };
    draw();
    await choose('On click', 'Open link');
    await fill('Open link', 'invalid destination');
    expect(host.querySelector('[role=alert]')).not.toBeNull();
    selected = { kind: 'slide', slideId: slide.id, objectId: 'b' };
    draw();
    expect(host.querySelector('input[aria-label="Open link"]')).toBeNull();
    expect(host.querySelector('[role=alert]')).toBeNull();
    expect(host.querySelector('[aria-label="On click"]')?.textContent).toContain('Next slide');
  }
);

it('adds only a valid end CTA and removes terminal actions with explicit confirmation', async () => {
  selected = { kind: 'end' };
  draw();
  await click('Link button');
  await fill('Button label', 'Read more');
  await fill('Open link', 'javascript:alert(1)');
  expect(project.tour!.endScreen.button).toBeNull();
  expect(host.querySelector('[role="alert"]')).not.toBeNull();
  await fill('Open link', 'https://example.com/help');
  expect(project.tour!.endScreen.button).toEqual({
    label: 'Read more',
    url: 'https://example.com/help',
  });
  project.tour!.endScreen.enabled = true;
  const nav = project.tour!.slides[1]!;
  if (nav.kind !== 'navigation') throw new Error('Missing nav');
  nav.buttons = [{ id: 'end-link', label: 'Finish', action: { kind: 'end' } }];
  draw();
  await click('Show end screen');
  expect(project.tour!.endScreen.enabled).toBe(true);
  await click('Remove actions and disable');
  expect(project.tour!.endScreen.enabled).toBe(false);
  const repaired = project.tour!.slides[1]!;
  expect(repaired.kind === 'navigation' && repaired.buttons[0]?.action.kind).toBe('none');
});
it('exposes global and local text alignment with placement only for callouts', async () => {
  scope = 'document';
  draw();
  await choose('Text alignment', 'Center');
  await choose('Callout placement', 'Above');
  expect(project.tour!.style.textAppearance).toMatchObject({
    alignment: 'center',
    placement: 'top',
  });
  await choose('Explanations', 'Bottom captions');
  expect(
    [...host.querySelectorAll('button')].some(
      (node) => node.getAttribute('aria-label') === 'Callout placement'
    )
  ).toBe(false);
});

it('builds contents without duplicate destinations and reorders buttons atomically', async () => {
  selected = { kind: 'slide', slideId: 'nav', objectId: null };
  draw();
  await click('Add contents');
  const navigation = () => {
    const slide = project.tour!.slides[1]!;
    if (slide.kind !== 'navigation') throw new Error('Missing navigation');
    return slide;
  };
  expect(navigation().buttons).toHaveLength(1);
  expect(navigation().buttons[0]?.action).toEqual({ kind: 'slide', slideId: 'image' });
  await click('Add contents');
  expect(navigation().buttons).toHaveLength(1);
  await click('Add button');
  await click('Back to slide settings');
  await click('Move button down');
  expect(navigation().buttons[0]?.action.kind).toBe('next');
  expect(navigation().buttons[1]?.action.kind).toBe('slide');
});

it('removes a navigation background without changing its buttons or source slide', async () => {
  const nav = project.tour!.slides[1]!;
  if (nav.kind !== 'navigation') throw new Error('Missing navigation');
  nav.background.image = current().image;
  nav.buttons = [{ id: 'next', label: 'Next', action: { kind: 'next' } }];
  selected = { kind: 'slide', slideId: nav.id, objectId: null };
  draw();
  await click('Remove background image');
  const next = project.tour!.slides[1]!;
  expect(next.kind === 'navigation' && next.background.image).toBeNull();
  expect(next.kind === 'navigation' && next.buttons).toEqual(nav.buttons);
  expect(current().image).not.toBeNull();
});
