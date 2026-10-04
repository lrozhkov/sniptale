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
import { TOUR_HINT_SURFACE } from '@sniptale/runtime-contracts/scenario/types/tour';
import { TourInspector } from './inspector';
import { getSystemSurfaceStylePresets } from '../../../features/highlighter/surface-style/system-presets';
vi.mock(
  '../../../composition/surface-style-preset-resources/use-surface-style-preset-catalog',
  () => ({
    useSurfaceStylePresetCatalog: () => ({
      actions: {},
      presets: getSystemSurfaceStylePresets().map((preset) => ({
        ...preset,
        name: preset.id,
        enabled: true,
        customized: false,
        favorite: false,
        isDefault: false,
        order: 0,
      })),
    }),
  })
);
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
  const coordinates = host.querySelector<HTMLDetailsElement>('.tour-coordinate-disclosure')!;
  expect(coordinates.open).toBe(false);
  expect(coordinates.querySelector<HTMLInputElement>('[aria-label="X"]')).not.toBeNull();
  await act(async () => coordinates.querySelector('summary')!.click());
  expect(coordinates.open).toBe(true);
  await fill('X', '30');
  await fill('Y', '40');
  await click('Target area');
  await click('Target area');
  await choose('Hotspot hint', 'At hotspot');
  await choose('Hotspot hint', 'Use tour default');
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
  expect(document.activeElement?.textContent).toBe('Open settings');
  await click('Open settings');
  await click('Delete');
  expect(current().hotspots).toHaveLength(0);
});
it('edits annotations and masks, keeping their geometry bounded and supports deletion', async () => {
  await click('Slide explanation');
  await fill('Text', 'A note');
  expect(host.querySelector('[aria-label="X"]')).toBeNull();
  await choose('Placement on slide', 'Bottom captions');
  expect(current().annotations[0]?.appearance?.presentation).toBe('caption-bottom');
  await click('Back to slide settings');
  await choose('Add', 'Highlight');
  await choose('Highlight', 'Spotlight');
  expect(host.querySelector('[aria-label="X"]')).toBeNull();
  await choose('Highlight', 'Blur');
  await fill('Blur radius', '24');
  expect(current().masks[0]?.blurRadius).toBe(24);
  expect(current().masks[0]?.opacity).toBe(0.3);
  await click('Delete');
  expect(current().masks).toHaveLength(0);
  await click('A note');
  await click('Delete');
  expect(current().annotations).toHaveLength(0);
});
it('lists mixed objects in stored order and moves them through one mutation', async () => {
  const slide = current();
  slide.hotspots = [
    {
      id: 'point',
      point: { x: 0.5, y: 0.5 },
      targetRect: null,
      label: 'Point',
      text: '',
      action: { kind: 'next' },
      appearance: null,
      pulse: false,
    },
  ];
  slide.annotations = [{ id: 'note', text: 'Note', anchor: null, appearance: null }];
  slide.masks = [
    {
      id: 'mask',
      rect: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
      kind: 'highlight',
      color: '#f97316',
      opacity: 0.3,
    },
  ];
  slide.objectOrder = ['mask', 'note', 'point'];
  draw();
  const rows = () => [...host.querySelectorAll('.tour-object-item')];
  const labels = () =>
    rows().map((row) => row.querySelector('.tour-object-row')!.textContent?.trim());
  const moves = (row: Element) =>
    row.querySelectorAll<HTMLButtonElement>('.tour-object-item-actions > button');
  expect(labels()).toEqual(['Highlight', 'Note', 'Point']);
  expect(moves(rows()[0]!)[0]!.disabled).toBe(true);
  expect(moves(rows()[0]!)[1]!.disabled).toBe(false);
  expect(moves(rows()[2]!)[0]!.disabled).toBe(false);
  expect(moves(rows()[2]!)[1]!.disabled).toBe(true);
  await act(async () => moves(rows()[1]!)[0]!.click());
  expect(current().objectOrder).toEqual(['note', 'mask', 'point']);
  expect(labels()).toEqual(['Note', 'Highlight', 'Point']);
  expect(selected?.kind === 'slide' && selected.objectId).toBeNull();
  await act(async () => moves(rows()[0]!)[1]!.click());
  expect(current().objectOrder).toEqual(['mask', 'note', 'point']);
  await act(async () => moves(rows()[1]!)[0]!.click());
  const before = current().objectOrder;
  await act(async () => moves(rows()[2]!)[1]!.click());
  expect(current().objectOrder).toBe(before);
});

it('derives the object list without a stored order and swaps the actions for one Add menu', async () => {
  expect(host.querySelectorAll('.tour-object-actions > button')).toHaveLength(3);
  expect(host.querySelector('[aria-label="Add"]')).toBeNull();
  await click('Slide explanation');
  await click('Back to slide settings');
  expect(host.querySelectorAll('.tour-object-actions > button')).toHaveLength(0);
  const objectsGroup = host.querySelector('section[aria-label="Slide objects"]')!;
  expect(
    objectsGroup.querySelector('.guide-inspector-group-heading [aria-label="Add"]')
  ).not.toBeNull();
  expect(objectsGroup.querySelector('.guide-inspector-group-body [aria-label="Add"]')).toBeNull();
  const add = host.querySelector<HTMLButtonElement>('[aria-label="Add"]')!;
  expect(add).not.toBeNull();
  expect(add.textContent).toBe('');
  await act(async () => add.click());
  const option = [...document.querySelectorAll<HTMLElement>('.guide-action-menu button')].find(
    (node) => node.textContent?.trim() === 'Highlight'
  )!;
  await act(async () =>
    option.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  );
  expect(document.querySelector('.guide-action-menu')).toBeNull();
  expect(document.activeElement).toBe(add);
  await act(async () => add.click());
  await act(async () =>
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
  );
  expect(document.querySelector('.guide-action-menu')).toBeNull();
  await choose('Add', 'Hotspot');
  expect(current().hotspots).toHaveLength(1);
  await click('Back to slide settings');
  expect(
    [...host.querySelectorAll('.tour-object-row')].map((row) => row.textContent?.trim())
  ).toEqual(['Hotspot', 'Slide explanation']);
});

it('restores empty-state direct actions after the last object is deleted', async () => {
  await click('Slide explanation');
  await click('Back to slide settings');
  await click('Slide explanation');
  await click('Delete');
  expect(current().annotations).toHaveLength(0);
  expect(current().objectOrder).toBeUndefined();
  expect(host.querySelectorAll('.tour-object-actions > button')).toHaveLength(3);
  expect(host.querySelector('[aria-label="Add"]')).toBeNull();
});

it('deletes directly from the object row and removes its ordering entry', async () => {
  await click('Slide explanation');
  await click('Back to slide settings');
  const slide = current();
  slide.objectOrder = [slide.annotations[0]!.id];
  draw();
  const remove = host.querySelector<HTMLButtonElement>('.tour-object-delete')!;
  expect(remove).not.toBeNull();
  await act(async () => remove.click());
  expect(current().annotations).toHaveLength(0);
  expect(current().objectOrder).toEqual([]);
  expect(host.querySelectorAll('.tour-object-actions > button')).toHaveLength(3);
});

it('moves the Add control into the objects heading seam in both presentations', async () => {
  await click('Slide explanation');
  await click('Back to slide settings');
  const group = host.querySelector('section[aria-label="Slide objects"]')!;
  expect(group.querySelector('.guide-inspector-group-heading [aria-label="Add"]')).not.toBeNull();
  expect(group.querySelector('.guide-inspector-group-body [aria-label="Add"]')).toBeNull();
  presentation = 'sections';
  draw();
  await click('Slide objects');
  const heading = () =>
    host.querySelector('[data-ui="shared.categorized-inspector.section-heading"]')!;
  expect(heading().textContent).toContain('Slide objects');
  expect(heading().querySelector('[aria-label="Add"]')).not.toBeNull();
  expect(host.querySelector('.guide-inspector-group-body [aria-label="Add"]')).toBeNull();
  await choose('Add', 'Hotspot');
  expect(current().hotspots).toHaveLength(1);
  await click('Back to slide settings');
  expect(heading().querySelector('[aria-label="Add"]')).not.toBeNull();
  await click('Hotspot');
  await click('Delete');
  expect(current().hotspots).toHaveLength(0);
  await click('Slide explanation');
  await click('Delete');
  expect(heading().querySelector('[aria-label="Add"]')).toBeNull();
  expect(host.querySelectorAll('.tour-object-actions > button')).toHaveLength(3);
});

it('edits navigation and end screen in independent scopes', async () => {
  selected = { kind: 'slide', slideId: 'nav', objectId: null };
  draw();
  await fill('Title', 'Contents');
  await fill('Main text', 'Choose a route');
  await click('Add button');
  await fill('Text', 'Start');
  await choose('On click', 'Restart');
  const nav = project.tour!.slides[1]!;
  expect(nav.kind === 'navigation' && nav.buttons[0]?.action.kind).toBe('restart');
  await click('Back to slide settings');
  await click('Start');
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
it('builds contents without duplicate destinations and reorders buttons atomically', async () => {
  selected = { kind: 'slide', slideId: 'nav', objectId: null };
  draw();
  await click('Add slide links (1)');
  const navigation = () => {
    const slide = project.tour!.slides[1]!;
    if (slide.kind !== 'navigation') throw new Error('Missing navigation');
    return slide;
  };
  expect(navigation().buttons).toHaveLength(1);
  expect(navigation().buttons[0]?.action).toEqual({ kind: 'slide', slideId: 'image' });
  expect(
    [...host.querySelectorAll('button')].some((button) =>
      button.textContent?.includes('Add slide links')
    )
  ).toBe(false);
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

it('edits camera entrance percentage and timing without cropping image source', async () => {
  const source = current().image!.source;
  expect(host.textContent).toContain('exactly one hotspot');
  await choose('Camera mode', 'Manual');
  await fill('Zoom', '200');
  expect(host.querySelector('[aria-label="X"]')).toBeNull();
  await fill('Zoom delay', '0.5');
  await fill('Duration', '1.2');
  expect(current().camera).toMatchObject({
    mode: 'manual',
    zoom: 2,
    delayMs: 500,
    durationMs: 1200,
  });
  expect(current().image!.source).toEqual(source);
  await choose('Camera mode', 'Full view');
  expect(current().camera.mode).toBe('off');
  scope = 'document';
  draw();
  await click('Auto Zoom to hotspot');
  expect(project.tour!.playback.autoZoom).toBe(false);
});

it('edits slide timing and a default branch separately from document playback defaults', async () => {
  const source = current().image!.source;
  await choose('Slide duration', 'Set duration');
  await fill('Hold, s', '7');
  await choose('Automatic transition', '2. Navigation');
  expect(current().timing).toMatchObject({ mode: 'manual', holdSeconds: 7, autoplayTarget: 'nav' });
  expect(current().image!.source).toEqual(source);
  await choose('Automatic transition', 'Follow slide actions');
  expect(current().timing.autoplayTarget).toBeNull();
  scope = 'document';
  draw();
  await click('Start automatically');
  await click('Loop tour');
  await fill('Minimum, s', '6');
  expect(project.tour!.playback).toMatchObject({
    autoplay: true,
    loop: true,
    minimumHoldSeconds: 6,
  });
  disabled = true;
  draw();
  await click('Start automatically');
  expect(project.tour!.playback.autoplay).toBe(true);
  scope = 'selection';
  selected = { kind: 'slide', slideId: 'nav', objectId: null };
  disabled = false;
  draw();
  await choose('Slide duration', 'From text and narration');
  expect(project.tour!.slides[1]!.timing.mode).toBe('auto');
});

it('keeps transition settings at document scope and edits their bounded durations', async () => {
  expect(host.textContent).not.toContain('Image transition');
  scope = 'document';
  draw();
  await choose('Image transition', 'Slide');
  await fill('Switch, ms', '500');
  await fill('Hotspot, ms', '750');
  expect(project.tour!.transition).toEqual({
    kind: 'slide',
    durationMs: 500,
    hotspotTravelMs: 750,
  });
  await choose('Image transition', 'No image animation');
  expect(host.querySelector('[aria-label="Switch, ms"]')).toBeNull();
  expect(project.tour!.transition.kind).toBe('none');
});

it('edits navigation composition independently from its text and links', async () => {
  selected = { kind: 'slide', slideId: 'nav', objectId: null };
  draw();
  await click('Right');
  await click('Top');
  await click('Button columns: 2');
  await fill('Content width', '75');
  await fill('Edge padding', '8');
  await fill('Spacing', '20');
  const slide = project.tour!.slides[1]!;
  expect(slide.kind === 'navigation' && slide.layout).toEqual({
    width: 75,
    align: 'end',
    vertical: 'start',
    padding: 8,
    gap: 20,
    columns: 2,
  });
  expect(host.querySelector('[aria-label="Main text"]')).not.toBeNull();
});

for (const kind of ['Hotspot', 'Slide explanation']) {
  it(`selects a visual ${kind} style directly while preserving numeric settings`, async () => {
    await click(kind);
    const object = kind === 'Hotspot' ? current().hotspots[0]! : current().annotations[0]!;
    object.appearance = {
      ...project.tour!.style.textAppearance,
      surface: { ...TOUR_HINT_SURFACE, radius: 20 },
    };
    draw();
    await fill('Explanation width', '280');
    await fill('Inner padding', '16');
    expect(host.querySelector('input[aria-label="Corner radius"]')).toBeNull();
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>('[data-ui="shared.ui.surface-style-selector"] button')!
        .click()
    );
    const selector = host.querySelector('[data-ui="shared.ui.surface-style-selector"]')!;
    const mode = [...selector.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
      /^(Surface|Поверхность)$/.test(button.textContent?.trim() ?? '')
    );
    if (mode) await act(async () => mode.click());
    expect(selector.querySelector('textarea')).toBeNull();
    expect(
      [...selector.querySelectorAll('button')].some((button) =>
        /^(Apply|Применить|Duplicate|Дублировать|Copy|Копировать)$/.test(
          button.getAttribute('aria-label') ?? button.textContent?.trim() ?? ''
        )
      )
    ).toBe(false);
    await click('system-surface-soft-elevated');
    const expected = getSystemSurfaceStylePresets().find(
      (preset) => preset.id === 'system-surface-soft-elevated'
    )!.style;
    const appearance =
      kind === 'Hotspot' ? current().hotspots[0]!.appearance : current().annotations[0]!.appearance;
    expect(appearance?.surface).toMatchObject({ ...expected, width: 280, padding: 16, radius: 20 });
    expect(project.tour!.style.textAppearance.surface).toBeUndefined();
  });
}

it('shows one section heading in sections mode and moves object actions into it', async () => {
  presentation = 'sections';
  draw();
  const heading = host.querySelector('[data-ui="shared.categorized-inspector.section-heading"]')!;
  expect(heading).not.toBeNull();
  expect(heading.textContent).toContain('Slide');
  expect(host.querySelector('.guide-inspector-group-heading')).toBeNull();
  await click('Slide objects');
  const objectsHeading = host.querySelector(
    '[data-ui="shared.categorized-inspector.section-heading"]'
  )!;
  expect(objectsHeading.textContent).toContain('Slide objects');
  expect(host.querySelectorAll('.tour-object-actions > button')).toHaveLength(3);
  await click('Hotspot');
  expect(
    host.querySelector('[data-ui="shared.categorized-inspector.section-heading"]')
  ).not.toBeNull();
  expect(host.querySelector('.guide-inspector-group-heading')).toBeNull();
  await click('Back to slide settings');
  await click('Playback');
  expect(host.querySelector('.guide-inspector-group-heading')).toBeNull();
  presentation = 'all';
  draw();
  expect(host.querySelector('.guide-inspector-group-heading')).not.toBeNull();
  expect(host.querySelectorAll('.guide-inspector-group')).toHaveLength(4);
});

it('renders tour numeric rows as plain accent-focus rows with scrub', async () => {
  presentation = 'sections';
  draw();
  await click('Slide objects');
  await click('Hotspot');
  await click('Back to slide settings');
  await click('Camera');
  const rows = [...host.querySelectorAll('[data-ui="shared.ui.compact-inspector.numeric-row"]')];
  expect(rows.length).toBeGreaterThan(0);
  for (const row of rows) {
    expect(row.getAttribute('data-appearance')).toBe('plain');
    const field = row.querySelector('[data-ui="shared.ui.compact-inspector.numeric-value-field"]')!;
    expect(field.getAttribute('data-focus-appearance')).toBe('accent-box');
    expect(row.querySelector('input[type=range]')).not.toBeNull();
  }
  const zoom = host.querySelector<HTMLInputElement>('input[aria-label="Zoom"]')!;
  expect(zoom.value).toBeTruthy();
  const range = host.querySelector<HTMLInputElement>('input[type=range]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(range, '250');
    range.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(host.querySelector<HTMLInputElement>('input[aria-label="Zoom"]')!.value).toBeTruthy();
});

it('preserves image categories through All and object drill-down without editing the tour', async () => {
  presentation = 'sections';
  draw();
  const before = JSON.stringify(project);
  expect(host.querySelector('nav')).not.toBeNull();
  expect(host.querySelector('[data-testid="narration-slot"]')).toBeNull();
  await click('Playback');
  expect(host.querySelector('[data-testid="narration-slot"]')).toBeNull();
  await click('Narration');
  expect(host.querySelector('[data-testid="narration-slot"]')).not.toBeNull();
  presentation = 'all';
  draw();
  expect(host.querySelector('nav')).toBeNull();
  expect(host.querySelector('input[aria-label="Step title"]')).not.toBeNull();
  presentation = 'sections';
  draw();
  expect(host.querySelector('button[aria-label="Narration"]')?.getAttribute('aria-pressed')).toBe(
    'true'
  );
  expect(JSON.stringify(project)).toBe(before);
  await click('Slide objects');
  await click('Hotspot');
  expect(host.querySelector('nav')).not.toBeNull();
  expect(host.querySelector('[data-testid="narration-slot"]')).toBeNull();
  await click('Narration');
  expect(host.querySelector('[data-testid="narration-slot"]')).not.toBeNull();
  await click('Back to slide settings');
  expect(
    host.querySelector('button[aria-label="Slide objects"]')?.getAttribute('aria-pressed')
  ).toBe('true');
});

it('offers slide placement only for independently edited slide explanations', async () => {
  await click('Hotspot');
  await fill('Text', 'Action details');
  await click('Hotspot hint');
  expect(document.body.textContent).not.toContain('Top captions');
  expect(document.body.textContent).not.toContain('Bottom captions');
  await click('At hotspot');
  const hotspot = structuredClone(current().hotspots[0]);
  await click('Back to slide settings');
  await choose('Add', 'Slide explanation');
  await fill('Text', 'Slide context');
  expect(host.querySelector('[aria-label="X"]')).toBeNull();
  expect(host.querySelector('[aria-label="On click"]')).toBeNull();
  await choose('Placement on slide', 'Top captions');
  expect(current().annotations[0]?.appearance?.presentation).toBe('caption-top');
  await choose('Placement on slide', 'Bottom captions');
  expect(current().annotations[0]?.appearance?.presentation).toBe('caption-bottom');
  expect(current().hotspots[0]).toEqual(hotspot);
  await click('Placement on slide');
  expect(document.body.textContent).not.toContain('At hotspot');
  await click('Bottom captions');
});

it('groups selected action points and highlights when sections are enabled', async () => {
  await click('Hotspot');
  presentation = 'sections';
  draw();
  expect(host.querySelector('[data-ui="scenario-editor.inspector-categories"]')).not.toBeNull();
  await click('Back to slide settings');
  presentation = 'all';
  draw();
  await choose('Add', 'Highlight');
  presentation = 'sections';
  draw();
  expect(host.querySelector('[data-ui="scenario-editor.inspector-categories"]')).not.toBeNull();
});
