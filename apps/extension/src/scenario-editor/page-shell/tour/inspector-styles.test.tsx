// @vitest-environment jsdom
import {
  getTourHotspots,
  getTourAnnotations,
} from '@sniptale/runtime-contracts/scenario/types/tour';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { hideAllToasts } from '@sniptale/ui/product-feedback/toast-service';
import {
  createGuideProject,
  createTourDocument,
  createTourImageSlide,
  applyTourCommands,
  getTourImages,
} from '../../../features/scenario/project/public';
import type { GuideProject } from '@sniptale/runtime-contracts/scenario/types/guide';
import { createTranslator, translate } from '../../../platform/i18n';
import { TOUR_HINT_SURFACE } from '@sniptale/runtime-contracts/scenario/types/tour';
import { TourMusicSettings } from './music-settings';
import { TourInspector } from './inspector';
import type { TourSelection } from './selection';
const uploadStage = vi.fn<(file: File, signal: AbortSignal) => Promise<boolean>>();
let importDisabled = false;
let root: Root;
let host: HTMLDivElement;
let project: GuideProject;
let selected: TourSelection | null;
let scope: 'selection' | 'document';
let disabled: boolean;
let presentation: 'all' | 'sections';
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  uploadStage.mockReset().mockResolvedValue(true);
  importDisabled = false;
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
  act(() => {
    root.unmount();
    hideAllToasts();
  });
  expect(document.querySelectorAll('[data-ui="shared.toast.host"]')).toHaveLength(0);
  host.remove();
  vi.unstubAllGlobals();
});
function draw() {
  const slideId = selected?.kind === 'slide' ? selected.slideId : null;
  act(() =>
    root.render(
      <TourInspector
        onUploadStage={uploadStage}
        importDisabled={importDisabled}
        presentation={presentation}
        narration={<div data-testid="narration-slot" />}
        music={
          <TourMusicSettings
            tour={project.tour!}
            disabled={disabled}
            importDisabled={importDisabled}
            onChange={(tour) => accept({ kind: 'replace-tour', tour })}
            onImport={vi.fn()}
            t={createTranslator('en')}
          />
        }
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
      audio: project.tour!.audioResources ?? [],
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
  await click('Text action');
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
  await click('Text action');
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
  for (const label of ['Appearance', 'Text action', 'Playback', 'Music', 'Transitions']) {
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
  expect(groups).toHaveLength(6);
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
  expect(subgroupHeadings).toEqual([]);
  expect(host.textContent).toContain('Playback');
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
  expect(disclosure('Text action').getAttribute('aria-expanded')).toBe('true');
  await act(async () => disclosure('Text action').click());
  await act(async () => disclosure('Appearance').click());
  scope = 'selection';
  draw();
  scope = 'document';
  draw();
  expect(disclosure('Appearance').getAttribute('aria-expanded')).toBe('true');
  expect(disclosure('Text action').getAttribute('aria-expanded')).toBe('false');
});

it('detaches and restores text styles independently from central categories', async () => {
  await click('Hotspot');
  expect(getTourHotspots(current())[0]!.appearance).toBeNull();
  await click('Use tour style');
  const local = structuredClone(getTourHotspots(current())[0]!.appearance);
  scope = 'document';
  presentation = 'sections';
  draw();
  await click('Hotspot');
  await fill('Explanation width', '420');
  expect(project.tour!.style.hotspotAppearance?.surface?.width).toBe(420);
  expect(project.tour!.style.textAppearance.surface).toBeUndefined();
  expect(getTourHotspots(current())[0]!.appearance).toEqual(local);
  await click('Text action');
  await fill('Explanation width', '280');
  expect(project.tour!.style.textAppearance.surface?.width).toBe(280);
  expect(project.tour!.style.hotspotAppearance?.surface?.width).toBe(420);
  scope = 'selection';
  presentation = 'all';
  draw();
  await click('Use tour style');
  expect(getTourHotspots(current())[0]!.appearance).toBeNull();
  expect(host.querySelector<HTMLInputElement>('input[aria-label="Explanation width"]')?.value).toBe(
    '420'
  );
});

it('keeps image processing out of document settings and action settings', async () => {
  expect(host.textContent).not.toContain('Image treatment');
  scope = 'document';
  presentation = 'sections';
  draw();
  expect(host.textContent).not.toContain('Image treatment');
  expect(host.querySelector('[aria-label="Blur radius"]')).toBeNull();
});

for (const objectId of [null, 'voice-point']) {
  it(`gives ${objectId ? 'object' : 'slide'} narration its own selectable section`, async () => {
    if (objectId)
      current().actions = [
        ...current().actions.filter((entry) => entry.type !== 'hotspot'),
        ...[
          {
            id: objectId,
            point: { x: 0.5, y: 0.5 },
            targetRect: null,
            label: 'Voice point',
            text: '',
            appearance: null,
            visual: { kind: 'point' as const, pulse: false },
          },
        ].map((object) => ({ type: 'hotspot' as const, object })),
      ];
    selected = { kind: 'slide', slideId: 'image', objectId };
    presentation = 'sections';
    draw();
    const narration = host.querySelector<HTMLButtonElement>('button[aria-label="Narration"]');
    expect(narration).not.toBeNull();
    expect(host.querySelector('[data-testid="narration-slot"]')).toBeNull();
    await act(async () => narration!.click());
    expect(host.querySelector('[data-testid="narration-slot"]')).not.toBeNull();
  });
}

for (const kind of ['Text action', 'Hotspot', 'Add button'] as const) {
  it(`keeps ${kind} narration isolated and preserves it through presentation switches`, async () => {
    if (kind === 'Add button') {
      selected = { kind: 'slide', slideId: 'nav', objectId: null };
      draw();
    }
    await click(kind);
    presentation = 'sections';
    draw();
    const before = JSON.stringify(project);
    expect(host.querySelector('[data-testid="narration-slot"]')).toBeNull();
    await click('Narration');
    expect(host.querySelectorAll('[data-testid="narration-slot"]')).toHaveLength(1);
    presentation = 'all';
    draw();
    expect(host.querySelectorAll('[data-testid="narration-slot"]')).toHaveLength(1);
    presentation = 'sections';
    draw();
    expect(host.querySelector('button[aria-label="Narration"]')?.getAttribute('aria-pressed')).toBe(
      'true'
    );
    expect(JSON.stringify(project)).toBe(before);
  });
}

it('shows only selection guidance when no slide is selected', () => {
  selected = null;
  presentation = 'sections';
  draw();
  expect(host.textContent).toContain(
    createTranslator('en')('scenario.editor.guideSelectForSettings')
  );
  expect(host.querySelector('nav, input, textarea, [data-testid="narration-slot"]')).toBeNull();
});

it('preserves saved privacy data without exposing processing controls', () => {
  current().masks = [
    {
      id: 'private',
      kind: 'redact',
      rect: { x: 0, y: 0, width: 0.2, height: 0.2 },
      color: '#111827',
      opacity: 1,
    },
  ];
  const before = structuredClone(current().masks);
  presentation = 'sections';
  draw();
  expect(host.textContent).not.toContain('Image treatment');
  expect(host.querySelector('[data-inspector-object="private"]')).toBeNull();
  expect(current().masks).toEqual(before);
  selected = { kind: 'slide', slideId: 'image', objectId: 'private' };
  draw();
  expect(host.querySelector('input, textarea, [aria-label="Delete"]')).toBeNull();
  expect(current().masks).toEqual(before);
});

it('hides obsolete hint radius while retaining authored radius through global and inherited local edits', async () => {
  project.tour!.style.textAppearance.surface = { ...TOUR_HINT_SURFACE, radius: 20 };
  scope = 'document';
  presentation = 'sections';
  draw();
  await click('Text action');
  expect(host.querySelector('input[aria-label="Corner radius"]')).toBeNull();
  await fill('Explanation width', '420');
  await fill('Inner padding', '18');
  expect(project.tour!.style.textAppearance.surface).toEqual({
    ...TOUR_HINT_SURFACE,
    radius: 20,
    width: 420,
    padding: 18,
  });
  scope = 'selection';
  presentation = 'all';
  draw();
  await click('Text action');
  await click('Use tour style');
  expect(getTourAnnotations(current())[0]!.appearance?.surface?.radius).toBe(20);
  await fill('Explanation width', '300');
  expect(getTourAnnotations(current())[0]!.appearance?.surface).toMatchObject({
    radius: 20,
    width: 300,
    padding: 18,
  });
  expect(project.tour!.style.textAppearance.surface?.width).toBe(420);
});

it('exposes hotspot coordinates in Text and annotation categories without mutating selection content', async () => {
  await click('Hotspot');
  presentation = 'sections';
  draw();
  expect(host.querySelector('input[aria-label="X"]')).not.toBeNull();
  expect(host.querySelector('details')).toBeNull();
  await click('Back to slide settings');
  presentation = 'all';
  draw();
  await click('Add');
  await click('Text action');
  presentation = 'sections';
  draw();
  const before = structuredClone(project);
  expect(host.querySelector('textarea[aria-label="Text"]')).not.toBeNull();
  await click('Appearance');
  expect(host.querySelector('[aria-label="Placement on slide"]')).not.toBeNull();
  await click('Text');
  expect(host.querySelector('textarea[aria-label="Text"]')).not.toBeNull();
  expect(project).toEqual(before);
  presentation = 'all';
  draw();
  expect(host.querySelectorAll('[data-testid="narration-slot"]')).toHaveLength(1);
});

it('resets pulse color to interaction accent without discarding marker color or size', async () => {
  project.tour!.style.markerAppearance = { color: '#123456', pulseColor: '#abcdef', size: 44 };
  scope = 'document';
  presentation = 'sections';
  draw();
  await click('Hotspot');
  await click('Use interaction accent');
  expect(project.tour!.style.markerAppearance).toEqual({
    color: '#123456',
    pulseColor: null,
    size: 44,
  });
  await fill('Marker size', '99');
  expect(project.tour!.style.markerAppearance?.size).toBe(64);
  disabled = true;
  draw();
  expect(host.querySelector<HTMLInputElement>('input[aria-label="Marker size"]')?.disabled).toBe(
    true
  );
});

it('inherits callout distance, allows local override, and never offers it for slide captions', async () => {
  project.tour!.style.hotspotAppearance = {
    ...project.tour!.style.textAppearance,
    presentation: 'callout',
    calloutGap: 45,
  };
  await click('Hotspot');
  await click('Use tour style');
  expect(host.querySelector<HTMLInputElement>('input[aria-label="Callout distance"]')?.value).toBe(
    '45'
  );
  await fill('Callout distance', '120');
  expect(getTourHotspots(current())[0]!.appearance?.calloutGap).toBe(120);
  expect(project.tour!.style.hotspotAppearance.calloutGap).toBe(45);
  await click('Use tour style');
  expect(getTourHotspots(current())[0]!.appearance).toBeNull();
  scope = 'document';
  presentation = 'sections';
  draw();
  await click('Text action');
  expect(host.querySelector('[aria-label="Callout distance"]')).toBeNull();
});

async function color(label: string, value: string) {
  await click(label);
  await fill(label, value);
}

it('commits global and local marker colors while preserving independent snapshots', async () => {
  scope = 'document';
  presentation = 'sections';
  draw();
  await click('Hotspot');
  await color('Marker color', '#123456');
  await color('Pulse color', '#abcdef');
  await fill('Callout distance', '60');
  expect(project.tour!.style.markerAppearance).toEqual({
    color: '#123456',
    pulseColor: '#abcdef',
    size: 30,
  });
  expect(project.tour!.style.hotspotAppearance?.calloutGap).toBe(60);
  scope = 'selection';
  presentation = 'all';
  draw();
  await click('Hotspot');
  await click('Use tour marker style');
  await color('Marker color', '#2563eb');
  await color('Pulse color', '#f97316');
  expect(getTourHotspots(current())[0]!.markerAppearance).toEqual({
    color: '#2563eb',
    pulseColor: '#f97316',
    size: 30,
  });
  await color('Marker color', 'transparent');
  await click('Use interaction accent');
  expect(getTourHotspots(current())[0]!.markerAppearance).toEqual({
    color: null,
    pulseColor: null,
    size: 30,
  });
  expect(project.tour!.style.markerAppearance).toEqual({
    color: '#123456',
    pulseColor: '#abcdef',
    size: 30,
  });
  expect(getTourHotspots(current())[0]!.appearance).toBeNull();
});

it('edits interaction accent without replacing authored marker colors or tour geometry', async () => {
  project.tour!.style.markerAppearance = { color: '#123456', pulseColor: '#abcdef', size: 44 };
  const slides = structuredClone(project.tour!.slides);
  scope = 'document';
  presentation = 'sections';
  draw();
  await click('Appearance');
  await color('Interaction accent', '#2563eb');
  expect(project.tour!.style.accent).toBe('#2563eb');
  expect(project.tour!.style.markerAppearance).toEqual({
    color: '#123456',
    pulseColor: '#abcdef',
    size: 44,
  });
  expect(project.tour!.slides).toEqual(slides);
});

it('edits stage image fit and removal without changing slide resources or authored paint', async () => {
  project.tour!.stage.image = structuredClone(current().image);
  const before = structuredClone(current());
  scope = 'document';
  presentation = 'sections';
  draw();
  await click('Appearance');
  await choose('Image fit', 'Fit');
  expect(project.tour!.stage.imageFit).toBe('contain');
  await choose('Image fit', 'Fill');
  expect(project.tour!.stage.imageFit).toBe('cover');
  await click('Remove stage image');
  expect(project.tour!.stage.image).toBeNull();
  expect(project.tour!.stage.background).toBe('#111827');
  expect(current()).toEqual(before);
  expect(host.querySelector('[aria-label="Image fit"]')).toBeNull();
});

it('uses the shared stage uploader with cancellation and separate import admission', async () => {
  scope = 'document';
  presentation = 'sections';
  draw();
  await click('Appearance');
  const input = host.querySelector<HTMLInputElement>('input[type="file"]')!;
  expect(input).not.toBeNull();
  const file = new File(['image'], 'stage.png', { type: 'image/png' });
  let finish: ((value: boolean) => void) | undefined;
  uploadStage.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
  expect(uploadStage).toHaveBeenCalledWith(file, expect.any(AbortSignal));
  expect(input.disabled).toBe(true);
  await click('Cancel preparation');
  expect(uploadStage.mock.calls[0]?.[1].aborted).toBe(true);
  await act(async () => finish?.(false));
  expect(host.querySelector('[role="alert"]')).toBeNull();
  importDisabled = true;
  draw();
  expect(host.querySelector<HTMLInputElement>('input[type="file"]')?.disabled).toBe(true);
  expect(host.querySelector<HTMLButtonElement>('[aria-label="Stage background"]')?.disabled).toBe(
    false
  );
  scope = 'selection';
  draw();
  expect(host.querySelector('input[type="file"]')).toBeNull();
});

it('applies stage gradient and solid paint while clearing only the stage image binding', async () => {
  project.tour!.stage.image = structuredClone(current().image);
  const before = structuredClone(current());
  scope = 'document';
  presentation = 'sections';
  draw();
  await click('Appearance');
  await click('Stage background');
  await click(translate('highlighter.paintPicker.linear'));
  await click(translate('shared.ui.colorSelectorApply'));
  expect(project.tour!.stage.paint?.kind).toBe('gradient');
  expect(project.tour!.stage.image).toBeNull();
  expect(project.tour!.stage.background).toMatch(/^#[a-f0-9]{6}$/i);
  await click('Stage background');
  await click(translate('highlighter.paintPicker.solid'));
  await click(translate('shared.ui.colorSelectorApply'));
  expect(project.tour!.stage.paint?.kind).toBe('solid');
  expect(current()).toEqual(before);
});

it('edits hotspot highlight animation independently from color and opacity', async () => {
  await click('Hotspot');
  await choose('Focus style', 'Highlight');
  await fill('Entry duration', '0.6');
  await fill('Exit duration', '0.4');
  const visual = getTourHotspots(current())[0]!.visual;
  if (visual.kind === 'point') throw new Error('Expected region.');
  const animation = structuredClone(visual.animation);
  await fill('Opacity', '45');
  expect(getTourHotspots(current())[0]!.visual).toMatchObject({ animation, opacity: 0.45 });
  await choose('Entry', 'None');
  expect(getTourHotspots(current())[0]!.visual).toMatchObject({
    animation: { enter: { kind: 'none' } },
  });
  disabled = true;
  draw();
  expect(host.querySelector<HTMLButtonElement>('[aria-label="Entry"]')?.disabled).toBe(true);
});

it('keeps optional timing and playback explanations inside the shared information disclosure', () => {
  const note = (key: Parameters<typeof translate>[0]) =>
    [...host.querySelectorAll('p')].find(
      (element) => element.textContent === translate(key, 'en')
    )!;
  expect(note('scenario.editor.tourTimingHint')).toBeDefined();
  expect(
    note('scenario.editor.tourTimingHint').closest('[data-ui="shared.information-disclosure"]')
  ).not.toBeNull();
  scope = 'document';
  draw();
  expect(note('scenario.editor.tourAutoplayHint')).toBeDefined();
  expect(
    note('scenario.editor.tourAutoplayHint').closest('[data-ui="shared.information-disclosure"]')
  ).not.toBeNull();
  expect(
    note('scenario.editor.tourTransitionHint').closest('[data-ui="shared.information-disclosure"]')
  ).not.toBeNull();
});

it('keeps manual camera values editable independently of collapsed camera guidance', async () => {
  await choose('Camera mode', 'Manual');
  await fill('Zoom', '150');
  await fill('Zoom delay', '0.5');
  await fill('Duration', '1.2');
  expect(current().camera).toMatchObject({
    mode: 'manual',
    zoom: 1.5,
    delayMs: 500,
    durationMs: 1200,
  });
  const note = [...host.querySelectorAll('p')].find(
    (node) => node.textContent === translate('scenario.editor.tourCameraFrameHint', 'en')
  )!;
  expect(note.closest('details')?.open).toBe(false);
  await choose('Camera mode', 'Full view');
  expect(host.textContent).not.toContain(translate('scenario.editor.tourCameraFrameHint', 'en'));
  expect(current().camera.zoom).toBe(1.5);
});

it('preserves playback and transition edits while their optional explanations stay collapsed', async () => {
  scope = 'document';
  draw();
  const before = structuredClone(project.tour!.playback);
  await click('Start automatically');
  await click('Loop tour');
  await click('Auto Zoom to hotspot');
  await fill('Minimum, s', '5');
  expect(project.tour!.playback).toEqual({
    autoplay: !before.autoplay,
    loop: !before.loop,
    autoZoom: !before.autoZoom,
    minimumHoldSeconds: 5,
  });
  await choose('Image transition', 'Slide');
  await fill('Switch, ms', '450');
  await fill('Hotspot, ms', '600');
  expect(project.tour!.transition).toMatchObject({
    kind: 'slide',
    durationMs: 450,
    hotspotTravelMs: 600,
  });
  await choose('Image transition', 'No image animation');
  expect(host.querySelector('[aria-label="Switch, ms"]')).toBeNull();
  expect(project.tour!.transition.durationMs).toBe(450);
  expect(
    [...host.querySelectorAll('details[data-ui="shared.information-disclosure"]')].every(
      (node) => !(node as HTMLDetailsElement).open
    )
  ).toBe(true);
});

it('edits an action hold without exposing a branch destination', async () => {
  await click('Hotspot');
  await choose('Duration', 'Set duration');
  await fill('Hold, s', '6');
  expect(getTourHotspots(current())[0]!.timing).toMatchObject({ mode: 'manual', holdSeconds: 6 });
  expect(host.querySelector('[aria-label="Automatic transition"]')).toBeNull();
  await choose('Duration', 'From text and narration');
  expect(host.querySelector('[aria-label="Hold, s"]')).toBeNull();
});
