// @vitest-environment jsdom
import {
  getTourHotspots,
  getTourAnnotations,
} from '@sniptale/runtime-contracts/scenario/types/tour';
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
  if (label === 'Back to slide settings') {
    if (selected?.kind === 'slide') selected = { ...selected, objectId: null };
    draw();
    return;
  }
  const buttons = [...document.querySelectorAll<HTMLButtonElement>('button')];
  const button =
    buttons.find((n) => n.getAttribute('aria-label') === label) ??
    buttons.find((n) => n.title === label || n.textContent?.trim() === label);
  if (!button) throw new Error(`Missing button ${label}: ${host.textContent}`);
  await act(async () => button.click());
}
async function choose(label: string, option: string) {
  const segments = [...host.querySelectorAll<HTMLElement>('[role="group"]')].find(
    (node) => node.getAttribute('aria-label') === label
  );
  if (segments) {
    const button = [...segments.querySelectorAll('button')].find(
      (node) => node.textContent?.trim() === option
    );
    if (!button) throw new Error(`Missing segment ${option}`);
    await act(async () => button.click());
    return;
  }
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
it('edits hotspot visuals and copy through canonical history without click commands', async () => {
  const source = structuredClone(current().image!.source);
  await fill('Step title', 'New title');
  await fill('Image description', 'Accessible image');
  await choose('Image fit', 'Fill');
  await click('Hotspot');
  expect(host.querySelector('[aria-label="Action label"]')).toBeNull();
  const savedLabel = getTourHotspots(current())[0]!.label;
  await fill('Text', 'Click here');
  await fill('X', '30');
  await fill('Y', '40');
  expect(host.querySelector('[aria-label="On click"]')).toBeNull();
  const id = getTourHotspots(current())[0]!.id;
  await choose('Focus style', 'Highlight');
  expect(getTourHotspots(current())[0]).toMatchObject({
    id,
    label: savedLabel,
    text: 'Click here',
    visual: { kind: 'highlight' },
  });
  await choose('Focus style', 'Animated frame');
  expect(getTourHotspots(current())[0]!.visual.kind).toBe('frame');
  await choose('Focus style', 'Pulsating point');
  expect(getTourHotspots(current())[0]!.point.x).toBeCloseTo(0.3);
  expect(getTourHotspots(current())[0]!.point.y).toBeCloseTo(0.4);
  expect(current().image!.source).toEqual(source);
  await click('Back to slide settings');
  expect(document.activeElement?.textContent).toContain('Click here');
  await click('Click here');
  await click('Delete');
  expect(current().actions).toHaveLength(0);
});
it('offers text and hotspot actions without a second image editor', async () => {
  expect(host.textContent).not.toContain('Image treatment');
  await click('Text action');
  await fill('Text', 'A note');
  await choose('Placement on slide', 'Bottom captions');
  expect(getTourAnnotations(current())[0]?.appearance?.presentation).toBe('caption-bottom');
  await click('Back to slide settings');
  await click('Add');
  expect(document.querySelector('.guide-action-menu')?.textContent).not.toContain(
    'Image treatment'
  );
  await act(async () =>
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
  );
  scope = 'document';
  draw();
  expect(host.textContent).not.toContain('Image treatment');
});
it('shows global action numbers and reorders actions without moving image treatments', async () => {
  const slide = current();
  slide.actions = [
    { type: 'annotation', object: { id: 'note', text: 'Note', anchor: null, appearance: null } },
    {
      type: 'hotspot',
      object: {
        id: 'point',
        label: 'Point',
        text: '',
        point: { x: 0.5, y: 0.5 },
        targetRect: null,
        appearance: null,
        visual: { kind: 'point', pulse: true },
      },
    },
  ];
  slide.masks = [
    {
      id: 'private',
      kind: 'redact',
      rect: { x: 0, y: 0, width: 0.1, height: 0.1 },
      color: '#111827',
      opacity: 1,
    },
  ];
  draw();
  const rows = () => [...host.querySelectorAll('.tour-object-item')];
  const labels = () =>
    rows().map((row) => row.querySelector('.tour-object-row')!.textContent?.trim());
  expect(labels()).toEqual(['1. Note', '2. Point']);
  await act(async () => rows()[1]!.querySelector<HTMLButtonElement>('[title="Move up"]')!.click());
  expect(current().actions.map((entry) => entry.object.id)).toEqual(['point', 'note']);
  expect(labels()).toEqual(['1. Point', '2. Note']);
  await act(async () =>
    rows()[0]!.querySelector<HTMLButtonElement>('[title="Move down"]')!.click()
  );
  expect(current().actions.map((entry) => entry.object.id)).toEqual(['note', 'point']);
  expect(current().masks[0]?.id).toBe('private');
});

it('derives the object list without a stored order and swaps the actions for one Add menu', async () => {
  expect(host.querySelectorAll('.tour-object-actions > button')).toHaveLength(2);
  expect(host.querySelector('[aria-label="Add"]')).toBeNull();
  await click('Text action');
  await click('Back to slide settings');
  expect(host.querySelectorAll('.tour-object-actions > button')).toHaveLength(0);
  const objectsGroup = host.querySelector('section[aria-label="Actions"]')!;
  expect(
    objectsGroup.querySelector('.guide-inspector-group-heading [aria-label="Add"]')
  ).not.toBeNull();
  expect(objectsGroup.querySelector('.guide-inspector-group-body [aria-label="Add"]')).toBeNull();
  const add = host.querySelector<HTMLButtonElement>('[aria-label="Add"]')!;
  expect(add).not.toBeNull();
  expect(add.textContent).toBe('');
  await act(async () => add.click());
  const option = [...document.querySelectorAll<HTMLElement>('.guide-action-menu button')].find(
    (node) => node.textContent?.trim() === 'Text action'
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
  expect(getTourHotspots(current())).toHaveLength(1);
  await click('Back to slide settings');
  expect(
    [...host.querySelectorAll('.tour-object-row')].map((row) => row.textContent?.trim())
  ).toEqual(['1. Text action', '2. Hotspot']);
});

it('restores empty-state direct actions after the last object is deleted', async () => {
  await click('Text action');
  await click('Back to slide settings');
  await click('Text action');
  await click('Delete');
  expect(getTourAnnotations(current())).toHaveLength(0);
  expect(current().actions).toEqual([]);
  expect(host.querySelectorAll('.tour-object-actions > button')).toHaveLength(2);
  expect(host.querySelector('[aria-label="Add"]')).toBeNull();
});

it('deletes directly from the object row and removes its ordering entry', async () => {
  await click('Text action');
  await click('Back to slide settings');
  const slide = current();
  slide.actions.sort(
    (left, right) =>
      [getTourAnnotations(slide)[0]!.id].indexOf(left.object.id) -
      [getTourAnnotations(slide)[0]!.id].indexOf(right.object.id)
  );
  draw();
  const remove = host.querySelector<HTMLButtonElement>('.tour-object-delete')!;
  expect(remove).not.toBeNull();
  await act(async () => remove.click());
  expect(getTourAnnotations(current())).toHaveLength(0);
  expect(current().actions.map((entry) => entry.object.id)).toEqual([]);
  expect(host.querySelectorAll('.tour-object-actions > button')).toHaveLength(2);
});

it('moves the Add control into the objects heading seam in both presentations', async () => {
  await click('Text action');
  await click('Back to slide settings');
  const group = host.querySelector('section[aria-label="Actions"]')!;
  expect(group.querySelector('.guide-inspector-group-heading [aria-label="Add"]')).not.toBeNull();
  expect(group.querySelector('.guide-inspector-group-body [aria-label="Add"]')).toBeNull();
  presentation = 'sections';
  draw();
  await click('Actions');
  const heading = () =>
    host.querySelector('[data-ui="shared.categorized-inspector.section-heading"]')!;
  expect(heading().textContent).toContain('Actions');
  expect(heading().querySelector('[aria-label="Add"]')).not.toBeNull();
  expect(host.querySelector('.guide-inspector-group-body [aria-label="Add"]')).toBeNull();
  await choose('Add', 'Hotspot');
  expect(getTourHotspots(current())).toHaveLength(1);
  await click('Back to slide settings');
  expect(heading().querySelector('[aria-label="Add"]')).not.toBeNull();
  await click('Hotspot');
  await click('Delete');
  expect(getTourHotspots(current())).toHaveLength(0);
  await click('Text action');
  await click('Delete');
  expect(heading().querySelector('[aria-label="Add"]')).toBeNull();
  expect(host.querySelectorAll('.tour-object-actions > button')).toHaveLength(2);
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
  expect(getTourHotspots(current())).toHaveLength(0);
  selected = null;
  draw();
  expect(host.querySelector('.guide-inspector-hint')).not.toBeNull();
});

it.each(['image', 'navigation'] as const)(
  'keeps action drafts local to the selected %s object',
  async (kind) => {
    const slide = kind === 'image' ? current() : project.tour!.slides[1]!;
    if (slide.kind === 'image')
      slide.actions = [
        ...slide.actions.filter((entry) => entry.type !== 'hotspot'),
        ...['a', 'b']
          .map((id) => ({
            id,
            point: { x: 0.5, y: 0.5 },
            targetRect: null,
            label: id,
            text: '',
            appearance: null,
            visual: { kind: 'point' as const, pulse: false },
          }))
          .map((object) => ({ type: 'hotspot' as const, object })),
      ];
    else slide.buttons = ['a', 'b'].map((id) => ({ id, label: id, action: { kind: 'next' } }));
    selected = { kind: 'slide', slideId: slide.id, objectId: 'a' };
    draw();
    if (kind === 'image') {
      expect(host.querySelector('[aria-label="On click"]')).toBeNull();
      return;
    }
    await choose('On click', 'Open link');
    await fill('Open link', 'invalid destination');
    expect(host.querySelector('[role=alert]')).not.toBeNull();
    selected = { kind: 'slide', slideId: slide.id, objectId: 'b' };
    draw();
    expect(host.querySelector('input[aria-label="Open link"]')).toBeNull();
    expect(host.querySelector('[role=alert]')).toBeNull();
    expect(host.querySelector('[aria-label="On click"]')?.textContent).toContain('Next action');
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
  current().actions = [
    {
      type: 'annotation',
      object: { id: 'contents-action', text: 'Read', anchor: null, appearance: null },
    },
  ];
  selected = { kind: 'slide', slideId: 'nav', objectId: null };
  draw();
  await click('Add action links (1)');
  const navigation = () => {
    const slide = project.tour!.slides[1]!;
    if (slide.kind !== 'navigation') throw new Error('Missing navigation');
    return slide;
  };
  expect(navigation().buttons).toHaveLength(1);
  expect(navigation().buttons[0]?.action).toEqual({ kind: 'action', actionId: 'contents-action' });
  expect(
    [...host.querySelectorAll('button')].some((button) =>
      button.textContent?.includes('Add action links')
    )
  ).toBe(false);
  expect(navigation().buttons).toHaveLength(1);
  await click('Add button');
  await click('Back to slide settings');
  await click('Move button down');
  expect(navigation().buttons[0]?.action.kind).toBe('next');
  expect(navigation().buttons[1]?.action.kind).toBe('action');
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

it('edits action timing independently from document playback defaults', async () => {
  await click('Hotspot');
  await choose('Duration', 'Set duration');
  await fill('Hold', '6');
  expect(getTourHotspots(current())[0]!.timing).toMatchObject({ mode: 'manual', holdSeconds: 6 });
  expect(project.tour!.playback.minimumHoldSeconds).toBe(4);
  expect(host.querySelector('[aria-label="Automatic transition"]')).toBeNull();
  await choose('Duration', 'From text and narration');
  expect(host.querySelector('[aria-label="Hold"]')).toBeNull();
});

it('keeps transition settings at document scope and edits their bounded durations', async () => {
  expect(host.textContent).not.toContain('Image transition');
  scope = 'document';
  draw();
  await choose('Image transition', 'Slide');
  await fill('Switch', '0.5');
  await fill('Hotspot travel', '0.75');
  expect(project.tour!.transition).toEqual({
    kind: 'slide',
    durationMs: 500,
    hotspotTravelMs: 750,
  });
  await choose('Image transition', 'No image animation');
  expect(host.querySelector('[aria-label="Switch"]')).toBeNull();
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

for (const kind of ['Hotspot', 'Text action']) {
  it(`selects a visual ${kind} style directly while preserving numeric settings`, async () => {
    await click(kind);
    const object =
      kind === 'Hotspot' ? getTourHotspots(current())[0]! : getTourAnnotations(current())[0]!;
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
      kind === 'Hotspot'
        ? getTourHotspots(current())[0]!.appearance
        : getTourAnnotations(current())[0]!.appearance;
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
  await click('Actions');
  const objectsHeading = host.querySelector(
    '[data-ui="shared.categorized-inspector.section-heading"]'
  )!;
  expect(objectsHeading.textContent).toContain('Actions');
  expect(host.querySelectorAll('.tour-object-actions > button')).toHaveLength(2);
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
  await click('Actions');
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
  await click('Actions');
  await click('Hotspot');
  expect(host.querySelector('nav')).not.toBeNull();
  expect(host.querySelector('[data-testid="narration-slot"]')).toBeNull();
  await click('Narration');
  expect(host.querySelector('[data-testid="narration-slot"]')).not.toBeNull();
  await click('Back to slide settings');
  expect(host.querySelector('button[aria-label="Actions"]')?.getAttribute('aria-pressed')).toBe(
    'true'
  );
});

it('offers slide placement only for independently edited slide explanations', async () => {
  await click('Hotspot');
  await fill('Text', 'Action details');
  expect(document.body.textContent).not.toContain('Top captions');
  expect(document.body.textContent).not.toContain('Bottom captions');
  const hotspot = structuredClone(getTourHotspots(current())[0]);
  await click('Back to slide settings');
  await choose('Add', 'Text action');
  await fill('Text', 'Slide context');
  expect(host.querySelector('[aria-label="X"]')).toBeNull();
  expect(host.querySelector('[aria-label="On click"]')).toBeNull();
  await choose('Placement on slide', 'Top captions');
  expect(getTourAnnotations(current())[0]?.appearance?.presentation).toBe('caption-top');
  await choose('Placement on slide', 'Bottom captions');
  expect(getTourAnnotations(current())[0]?.appearance?.presentation).toBe('caption-bottom');
  expect(getTourHotspots(current())[0]).toEqual(hotspot);
  expect(document.body.textContent).not.toContain('At hotspot');
});

it('groups selected action points and highlights when sections are enabled', async () => {
  await click('Hotspot');
  presentation = 'sections';
  draw();
  expect(host.querySelector('[data-ui="scenario-editor.inspector-categories"]')).not.toBeNull();
  await click('Back to slide settings');
  presentation = 'all';
  draw();
  await click('Hotspot');
  await choose('Focus style', 'Highlight');
  presentation = 'sections';
  draw();
  expect(host.querySelector('[data-ui="scenario-editor.inspector-categories"]')).not.toBeNull();
});

it('keeps marker and auto-zoom rectangle independent and bounds the rectangle', async () => {
  await click('Hotspot');
  await click('Auto-zoom area');
  const rectangle = structuredClone(getTourHotspots(current())[0]!.targetRect);
  await fill('X', '30');
  await fill('Y', '40');
  expect(getTourHotspots(current())[0]!.targetRect).toEqual(rectangle);
  const point = structuredClone(getTourHotspots(current())[0]!.point);
  const area = host.querySelector('section[aria-label="Auto-zoom area"]')!;
  expect(area.querySelector<HTMLElement>('[title]')?.title).toContain('one hotspot');
  expect(area.querySelector('input[aria-label="X range"]')?.getAttribute('max')).toBe('80');
  const x = area.querySelector<HTMLInputElement>('input[aria-label="X"]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(x, '95');
    x.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => x.dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
  expect(getTourHotspots(current())[0]!.targetRect?.x).toBe(0.8);
  expect(getTourHotspots(current())[0]!.point).toEqual(point);
  const width = host.querySelector(
    'section[aria-label="Auto-zoom area"] input[aria-label="Width range"]'
  );
  expect(Number(width?.getAttribute('max'))).toBeCloseTo(20);
  await click('Auto-zoom area');
  expect(getTourHotspots(current())[0]!.targetRect).toBeNull();
  expect(getTourHotspots(current())[0]!.point).toEqual(point);
});

it('edits marker defaults and independent local size without changing pulse or source geometry', async () => {
  scope = 'document';
  presentation = 'sections';
  draw();
  await click('Hotspot');
  await fill('Marker size', '40');
  expect(project.tour!.style.markerAppearance).toEqual({ color: null, pulseColor: null, size: 40 });
  scope = 'selection';
  presentation = 'all';
  draw();
  await click('Hotspot');
  const point = structuredClone(getTourHotspots(current())[0]!.point);
  const pulse = getTourHotspots(current())[0]!.visual;
  await click('Use tour marker style');
  await fill('Marker size', '50');
  expect(getTourHotspots(current())[0]!.markerAppearance?.size).toBe(50);
  expect(project.tour!.style.markerAppearance?.size).toBe(40);
  expect(getTourHotspots(current())[0]!.point).toEqual(point);
  expect(getTourHotspots(current())[0]!.visual).toEqual(pulse);
  await click('Use tour marker style');
  expect(getTourHotspots(current())[0]!.markerAppearance).toBeNull();
});

it('offers complete focus-style choices and keeps region data', async () => {
  await click('Hotspot');
  const group = () => host.querySelector<HTMLElement>('[role="group"][aria-label="Focus style"]')!;
  expect(group()).not.toBeNull();
  expect([...group().querySelectorAll('button')].map((button) => button.textContent)).toEqual([
    'Pulsating point',
    'Animated frame',
    'Highlight',
    'Spotlight',
  ]);
  await choose('Focus style', 'Spotlight');
  const region = getTourHotspots(current())[0]!.visual;
  expect(region.kind).toBe('spotlight');
  await choose('Focus style', 'Highlight');
  const highlight = getTourHotspots(current())[0]!.visual;
  if (highlight.kind === 'point' || region.kind === 'point') throw new Error('Expected region');
  expect(highlight.rect).toEqual(region.rect);
  expect(
    [...group().querySelectorAll('button')]
      .find((button) => button.textContent?.trim() === 'Highlight')
      ?.getAttribute('aria-pressed')
  ).toBe('true');
  disabled = true;
  draw();
  expect(
    [...group().querySelectorAll<HTMLButtonElement>('button')].every((button) => button.disabled)
  ).toBe(true);
});
