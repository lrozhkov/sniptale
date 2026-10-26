// @vitest-environment jsdom
import {
  getTourHotspots,
  getTourAnnotations,
  TOUR_HIGHLIGHT_ANIMATION_DEFAULTS,
} from '@sniptale/runtime-contracts/scenario/types/tour';
import { hideAllToasts } from '@sniptale/ui/product-feedback/toast-service';
import { act, useState, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { GuideProject } from '@sniptale/runtime-contracts/scenario/types/guide';
import {
  createGuideProject,
  createGuideStep,
  createTourDocument,
  createTourImageSlide,
} from '../../../features/scenario/project/public';
import { createTranslator } from '../../../platform/i18n';
import { useGuidePanels } from '../panel-layout';
import { TourWorkspace } from './workspace';
import { fixture } from './workspace.test-support';
import { stubTourPreviewDialog } from './preview.test-support';
import type { ScenarioNarrationAccess } from './use-narration-ai';
const prepare = vi.hoisted(() => vi.fn());
const narrationCatalog = vi.hoisted(() => vi.fn());
vi.mock('../../../workflows/ai-settings/query', () => ({
  requestAIModelSelectionBootstrap: narrationCatalog,
}));
vi.mock('../../../workflows/scenario-capture-edit/tour-materials', () => ({
  prepareTourFromGuide: prepare,
}));
let restoreDialog: () => void;
let host: HTMLDivElement;
let root: Root;
let current: GuideProject;
let panelState: ReturnType<typeof useGuidePanels>;
const imported = vi.fn();
const changed = vi.fn();
const edited = vi.fn();
function Probe({
  initial,
  locked = false,
  narrationAI,
}: {
  initial: GuideProject;
  locked?: boolean;
  narrationAI?: ScenarioNarrationAccess;
}) {
  const [project, setProject] = useState(initial);
  current = project;
  const panels = useGuidePanels();
  panelState = panels;
  return (
    <TourWorkspace
      project={project}
      images={{ image: 'data:image/png;base64,aA==' }}
      panels={panels}
      header={(controls: ReactNode) => <header>Project header {controls}</header>}
      disabled={locked}
      t={createTranslator('en')}
      onChange={(next) => {
        changed(next);
        setProject(next);
      }}
      onImport={imported}
      onImportNarration={imported}
      onEditImage={edited}
      {...(narrationAI ? { narrationAI } : {})}
    />
  );
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('innerWidth', 1280);
  restoreDialog = stubTourPreviewDialog();
  changed.mockReset();
  edited.mockReset();
  imported.mockReset();
  imported.mockResolvedValue(true);
  narrationCatalog.mockReset().mockRejectedValue(new Error('Catalog unavailable'));
  prepare.mockReset();
  prepare.mockResolvedValue({ tour: createTourDocument(), issues: [] });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => {
    root.unmount();
    hideAllToasts();
  });
  expect(document.querySelectorAll('[data-ui="shared.toast.host"]')).toHaveLength(0);
  host.remove();
  restoreDialog();
  vi.unstubAllGlobals();
});
async function render(project = fixture(), locked = false) {
  await act(async () => root.render(<Probe initial={project} locked={locked} />));
}
async function click(label: string, container: ParentNode = host) {
  const all = [...container.querySelectorAll<HTMLButtonElement>('button')];
  const node =
    all.find((n) => n.getAttribute('aria-label') === label) ??
    all.find((n) => n.title === label || n.textContent?.trim() === label);
  if (!node) throw new Error(`Missing ${label}: ${host.textContent}`);
  await act(async () => node.click());
}
async function key(node: Element, key: string) {
  await act(async () =>
    node.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
  );
}
it('creates image and navigation slides without changing guide content, and opens document/end scopes', async () => {
  const project = createGuideProject('Empty');
  project.items = [createGuideStep('Keep')];
  await render(project);
  expect(host.textContent).toContain('Create an interactive tour');
  await click('Image slide');
  expect(current.tour?.slides).toHaveLength(1);
  expect(host.textContent).toContain('Drop an image here');
  await click('Navigation slide');
  expect(current.tour?.slides[1]?.kind).toBe('navigation');
  act(() => panelState.openRight('document'));
  expect(host.querySelector('[aria-label="Stage aspect ratio"]')).not.toBeNull();
  await click('End of tour');
  expect(host.textContent).toContain('Show end screen');
  expect(current.items).toEqual(project.items);
});
it('duplicates, reorders by keyboard and repairs incoming links only after explicit removal', async () => {
  const project = fixture();
  project.tour!.slides.push({
    kind: 'navigation',
    id: 'contents',
    title: 'Contents',
    description: '',
    background: { color: '#111827', image: null },
    narration: null,
    timing: createTourImageSlide().timing,
    buttons: [{ id: 'start', label: 'Start', action: { kind: 'slide', slideId: 'first' } }],
  });
  await render(project);
  const before = current.items;
  const rows = () => host.querySelectorAll('.tour-slide-row');
  await click('Slide actions', rows()[0]!);
  await click('Duplicate slide', document.body);
  expect(current.tour!.slides).toHaveLength(4);
  const duplicated = current.tour!.slides[1]!.id;
  const handle = rows()[1]!.querySelector('button')!;
  await key(handle, 'End');
  expect(current.tour!.slides.at(-1)?.id).toBe(duplicated);
  await key(host.querySelectorAll('.tour-slide-row')[3]!.querySelector('button')!, 'Home');
  expect(current.tour!.slides[0]!.id).toBe(duplicated);
  await click('Slide actions', rows()[1]!);
  await click('Delete', document.body);
  expect(host.textContent).toContain('Other slides link here');
  await click('Cancel');
  expect(current.tour!.slides).toHaveLength(4);
  await click('Slide actions', rows()[1]!);
  await click('Delete', document.body);
  await click('Delete', host.querySelector('.tour-review-notice')!);
  expect(current.tour!.slides.some((s) => s.id === 'first')).toBe(false);
  const second = current.tour!.slides.find((s) => s.id === 'second');
  expect(second?.kind).toBe('image');
  expect(current.items).toEqual(before);
});
it('keeps slide actions inside the selectable card and selection on the card', async () => {
  await render();
  const row = () => host.querySelectorAll('.tour-slide-row')[0]!;
  const card = row().querySelector('.tour-slide-card')!;
  expect(card).not.toBeNull();
  expect(card.querySelector('.tour-slide-select')).not.toBeNull();
  expect(card.querySelectorAll('.tour-slide-actions button')).toHaveLength(1);
  expect(card.getAttribute('data-current')).toBe('true');
  await click('2Second', host);
  expect(row().querySelector('.tour-slide-card')?.getAttribute('data-current')).toBe('false');
  await click('Slide actions', row());
  await click('Duplicate slide', document.body);
  expect(
    host
      .querySelectorAll('.tour-slide-row')[1]!
      .querySelector('.tour-slide-card')
      ?.getAttribute('data-current')
  ).toBe('true');
  expect(
    host
      .querySelectorAll('.tour-slide-row')[0]!
      .querySelector('.tour-slide-card')
      ?.getAttribute('data-current')
  ).toBe('false');
  expect(host.querySelectorAll('.tour-slide-title')).toHaveLength(3);
});

it('shows unique resources, previews them and cycles through their usages without editing', async () => {
  await render();
  await click('Resources');
  expect(host.querySelectorAll('.tour-resource-row')).toHaveLength(1);
  const previewTrigger = host.querySelector<HTMLButtonElement>('[title="View image"]')!;
  await act(async () => previewTrigger.focus());
  await click('View image');
  expect(document.querySelector('[role=dialog] img')).not.toBeNull();
  expect(host.querySelector('#tour-resource-preview')).toBeNull();
  expect(host.querySelector('.guide-image-resources')?.getAttribute('aria-label')).toBe('Images');
  expect(host.querySelector('.guide-image-upload-compact [aria-expanded]')).not.toBeNull();
  await click('Close', document.querySelector('[role=dialog]')!);
  expect(document.activeElement).toBe(previewTrigger);
  await click('Used in slides: 2');
  expect(host.querySelector('.tour-slide-select[aria-current]')).toBeNull();
  await click('Slides');
  expect(host.querySelector('.tour-slide-select[aria-current]')?.textContent).toContain('Second');
  expect(changed).not.toHaveBeenCalled();
});
it('keeps generation review cancellable and prevents locked edits', async () => {
  await render();
  await click('From guide');
  expect(host.textContent).toContain('Review generated slides');
  await click('Cancel');
  expect(host.querySelector('.tour-generation')).toBeNull();
  act(() => root.render(null));
  await render(fixture(), true);
  await click('Image slide');
  expect(current.tour!.slides).toHaveLength(2);
  expect(changed).not.toHaveBeenCalled();
});

it.each(['point', 'highlight'] as const)(
  'commits source-coordinate %s drags and resize without changing saved privacy regions',
  async (kind) => {
    const project = fixture();
    const slide = project.tour!.slides[0]!;
    if (slide.kind !== 'image') throw new Error('Expected image');
    slide.actions = [
      {
        type: 'hotspot',
        object: {
          id: 'point',
          point: { x: 0.5, y: 0.5 },
          targetRect: null,
          label: 'Point',
          text: '',
          appearance: null,
          visual:
            kind === 'point'
              ? { kind, pulse: false }
              : {
                  kind,
                  rect: { x: 0.4, y: 0.4, width: 0.2, height: 0.2 },
                  color: '#F97316',
                  opacity: 0.3,
                  animation: TOUR_HIGHLIGHT_ANIMATION_DEFAULTS,
                },
        },
      },
      {
        type: 'annotation',
        object: { id: 'note', text: 'Note', anchor: { x: 0.2, y: 0.2 }, appearance: null },
      },
    ];
    slide.masks = [
      {
        id: 'mask',
        rect: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
        kind: 'blur',
        color: '#F97316',
        opacity: 0.3,
      },
    ];
    await render(project);
    expect(
      host.querySelector('#guide-inspector-panel input[type=file][accept^="image/"]')
    ).toBeNull();
    const shadow = () => host.querySelector('.tour-stage-host')!.shadowRoot!;
    const marker = shadow().querySelector<HTMLElement>('[data-tour-object-id="point"]')!;
    const pointer = (name: string, x: number) => {
      const event = new MouseEvent(name, { bubbles: true, button: 0, clientX: x, clientY: 0 });
      Object.defineProperty(event, 'pointerId', { value: 1 });
      marker.dispatchEvent(event);
    };
    await act(async () => {
      pointer('pointerdown', 0);
      pointer('pointermove', 10);
      pointer('pointerup', 10);
    });
    if (kind === 'highlight')
      await key(
        shadow().querySelector('[data-tour-object-id="point"] [data-edge=e]')!,
        'ArrowRight'
      );
    const result = current.tour!.slides[0]!;
    if (result.kind !== 'image') throw new Error('Expected image');
    const hotspot = getTourHotspots(result)[0]!;
    expect(hotspot.point.x).toBeGreaterThan(0.5);
    if (hotspot.visual.kind !== 'point') expect(hotspot.visual.rect.width).toBeGreaterThan(0.2);
    expect(result.masks).toEqual(slide.masks);
    expect(result.actions[1]).toEqual(slide.actions[1]);
    const header = host.querySelector('#guide-inspector-panel > .guide-panel-heading')!;
    expect(header.querySelector('[title="Back to slide settings"]')).not.toBeNull();
  }
);
it('keeps explanations slide-level: no canvas point marker and a preserved legacy anchor', async () => {
  const project = fixture();
  const slide = project.tour!.slides[0]!;
  if (slide.kind !== 'image') throw new Error('Expected image');
  slide.actions = [
    ...slide.actions.filter((entry) => entry.type !== 'annotation'),
    ...[
      {
        id: 'note',
        text: 'Note',
        anchor: { x: 0.2, y: 0.2 },
        appearance: {
          presentation: 'callout' as const,
          alignment: 'start' as const,
          placement: 'auto' as const,
        },
      },
    ].map((object) => ({ type: 'annotation' as const, object })),
  ];
  await render(project);
  const shadow = host.querySelector('.tour-stage-host')!.shadowRoot!;
  expect(shadow.querySelector('[data-tour-object-id="note"]')).toBeNull();
  const result = current.tour!.slides[0]!;
  if (result.kind !== 'image') throw new Error('Expected image');
  expect(getTourAnnotations(result)[0]!.anchor).toEqual({ x: 0.2, y: 0.2 });
  expect(getTourAnnotations(result)[0]!.appearance?.presentation).toBe('callout');
  const hint = shadow.querySelector<HTMLElement>('[data-tour-hint]')!;
  expect(hint.dataset['presentation']).toBe('caption-bottom');
  expect(hint.querySelector('[data-tour-hint-title]')).toBeNull();
  expect(hint.querySelector('[data-tour-hint-text]')!.textContent).toBe('Note');
});
it('keeps resource payloads identity-only', async () => {
  await render();
  const transfer = { effectAllowed: '', setData: vi.fn() };
  const event = async (node: Element, name: string) => {
    const event = new Event(name, { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'dataTransfer', { value: transfer });
    await act(async () => node.dispatchEvent(event));
  };
  await click('Resources');
  await event(host.querySelector('.tour-resource-row')!, 'dragstart');
  const payload = JSON.parse(transfer.setData.mock.calls.at(-1)?.[1] as string);
  expect(Object.keys(payload).sort()).toEqual(['projectId', 'slideId']);
  expect(payload.projectId).toBe(current.id);
});

it('lists navigation backgrounds and keeps missing image previews disabled', async () => {
  const project = fixture();
  const first = project.tour!.slides[0]!;
  if (first.kind !== 'image' || !first.image) throw new Error('Expected image');
  project.tour!.slides = [
    { ...first, image: { ...first.image, assetId: 'missing' } },
    createTourImageSlide('empty'),
    {
      kind: 'navigation',
      id: 'background',
      title: '',
      description: '',
      background: { color: '#111827', image: first.image },
      buttons: [],
      narration: null,
      timing: first.timing,
    },
  ];
  await render(project);
  await click('Resources');
  const rows = host.querySelectorAll('.tour-resource-row');
  expect(rows).toHaveLength(2);
  const unavailable = rows[0]!.querySelector<HTMLButtonElement>('[title="View image"]')!;
  expect(unavailable.disabled).toBe(true);
  await click('View image', rows[1]!);
  expect(document.querySelector('[role=dialog] img')).not.toBeNull();
  await click('Close', document.querySelector('[role=dialog]')!);
  await click('Used in slides: 1', rows[1]!);
  await click('Slides');
  expect(host.querySelector('.tour-slide-select[aria-current]')?.textContent).toContain('Untitled');
  expect(changed).not.toHaveBeenCalled();
});

it('lists each affected navigation source before clearing links to a removed slide', async () => {
  const project = fixture();
  const first = project.tour!.slides[0]!;
  if (first.kind !== 'image') throw new Error('Expected image');
  first.actions = [
    {
      type: 'annotation',
      object: { id: 'first-action', text: 'Start', anchor: null, appearance: null },
    },
  ];
  const navigation = {
    kind: 'navigation' as const,
    id: 'contents',
    title: 'Contents',
    description: '',
    background: { color: '#111827', image: null },
    narration: null,
    timing: createTourImageSlide().timing,
    buttons: [
      {
        id: 'contents-first',
        label: 'Start here',
        action: { kind: 'action' as const, actionId: 'first-action' },
      },
    ],
  };
  project.tour!.slides.push(navigation);
  await render(project);
  await click('Slide actions', host.querySelector('.tour-slide-row')!);
  await click('Delete', document.body);
  const notice = host.querySelector('.tour-review-notice')!;
  expect(notice.textContent).not.toContain('Second');
  expect(notice.textContent).toContain('Contents — Start here');
  expect(current.tour!.slides).toHaveLength(3);
  await click('Delete', notice);
  expect(current.tour!.slides).toHaveLength(2);
  const repaired = current.tour!.slides[1]!;
  expect(repaired.kind === 'navigation' && repaired.buttons[0]?.action.kind).toBe('none');
});

it('shows object narration without slide narration in the selected-object drill-down', async () => {
  const project = fixture();
  const first = project.tour!.slides[0]!;
  if (first.kind !== 'image') throw new Error('Expected image');
  first.actions = [
    { type: 'annotation', object: { id: 'start', text: 'Start', anchor: null, appearance: null } },
  ];
  await render(project);
  const sourceInspector = host.querySelector('#guide-inspector-panel')!;
  expect(sourceInspector.querySelector('button[aria-label="Narration"]')).toBeNull();
  await click('Show all settings', sourceInspector);
  expect(sourceInspector.querySelector('.tour-audio-acquisition')).toBeNull();
  await click('Show settings sections', sourceInspector);
  await click('2Second');
  await click('Actions', host.querySelector('#guide-inspector-panel')!);
  await click('Go first');
  const inspector = host.querySelector('#guide-inspector-panel')!;
  expect(inspector.textContent).not.toContain('Object narration');
  await click('Narration', inspector);
  expect(inspector.querySelector('[aria-label="Narration"]')?.getAttribute('aria-pressed')).toBe(
    'true'
  );
  await click('Show all settings', inspector);
  expect(inspector.querySelectorAll('.tour-audio-acquisition')).toHaveLength(1);
  expect(inspector.textContent).not.toContain('Slide narration');
  expect([...inspector.querySelectorAll('button')].some((b) => b.textContent === 'Record')).toBe(
    true
  );
});

it('uses the header presentation switch and keeps grouped objects switchable with their own narration', async () => {
  await render();
  const panel = () => host.querySelector('#guide-inspector-panel')!;
  await click('Show all settings', panel());
  expect(panel().querySelector('nav')).toBeNull();
  expect(panel().textContent).not.toContain('Slide narration');
  await click('Show settings sections', panel());
  expect(panel().textContent).not.toContain('Slide narration');
  await click('Playback', panel());
  expect(panel().textContent).not.toContain('Slide narration');
  await click('Actions', panel());
  await click('Hotspot', panel());
  expect(panel().querySelector('nav')).not.toBeNull();
  expect(panel().querySelector('[title="Show all settings"]')).not.toBeNull();
  await click('Show all settings', panel());
  expect(panel().querySelector('nav')).toBeNull();
  expect(panel().querySelectorAll('.tour-audio-acquisition')).toHaveLength(1);
  expect(panel().textContent).not.toContain('Slide narration');
  await click('Show settings sections', panel());
  expect(panel().querySelector('nav')).not.toBeNull();
  await click('Narration', panel());
  expect(panel().querySelector('[aria-label="Narration"]')?.getAttribute('aria-pressed')).toBe(
    'true'
  );
  expect(
    [...panel().querySelectorAll('button')].some((button) => button.textContent === 'Record')
  ).toBe(true);
  expect(panel().textContent).not.toContain('Slide narration');
  await click('Back to slide settings', panel());
  expect(panel().querySelector('[aria-label="Actions"]')?.getAttribute('aria-pressed')).toBe(
    'true'
  );
});

it('cancels native image drags from the stage before they can become image imports', async () => {
  await render();
  const image = host.querySelector('.tour-stage-host')!.shadowRoot!.querySelector('.tour-image')!;
  const drag = new Event('dragstart', { bubbles: true, cancelable: true, composed: true });
  await act(async () => image.dispatchEvent(drag));
  expect(drag.defaultPrevented).toBe(true);
  expect(imported).not.toHaveBeenCalled();
  expect(changed).not.toHaveBeenCalled();
  expect(current.tour!.slides).toHaveLength(2);
});

it('places contextual tour controls inside the page header', async () => {
  await render();
  const header = host.querySelector('header')!;
  const controls = header.querySelector('.tour-header-controls');
  expect(controls).not.toBeNull();
  const labels = [...controls!.querySelectorAll('button')].map((button) => button.title);
  expect(labels).toContain('Preview from here');
  expect(labels).toContain('Edit image');
  expect(labels).not.toContain('Editing');
});

it('keeps Edit image stable for image and navigation slides and degrades cleanly', async () => {
  const project = fixture();
  project.tour!.slides.push({
    kind: 'navigation',
    id: 'nav',
    title: 'Nav',
    description: '',
    background: { color: '#111827', image: null },
    narration: null,
    timing: createTourImageSlide().timing,
    buttons: [],
  });
  await render(project);
  const editImage = () => host.querySelector<HTMLButtonElement>('[data-tour-edit-image]');
  expect(editImage()?.dataset['tourEditImage']).toBe('first');
  await act(async () => editImage()!.click());
  expect(edited).toHaveBeenCalledWith('first');
  await click('3Nav');
  expect(editImage()).toBeNull();
  await click('End of tour');
  expect(editImage()).toBeNull();
  expect(
    [...host.querySelectorAll<HTMLButtonElement>('.tour-header-controls button')].find(
      (button) => button.title === 'Preview from here'
    )?.disabled
  ).toBe(true);
  await click('1First');
  act(() => root.render(null));
  const missing = fixture();
  const slide = missing.tour!.slides[0]!;
  if (slide.kind !== 'image' || !slide.image) throw new Error('Expected image');
  slide.image = { ...slide.image, assetId: 'missing' };
  await render(missing);
  expect(editImage()?.disabled).toBe(true);
  act(() => root.render(null));
  await render(fixture(), true);
  expect(editImage()?.disabled).toBe(true);
});

it('moves preview, replay and camera framing through one disposable header mode', async () => {
  instantImages();
  const tick = playbackFrames();
  const project = fixture();
  const slide = project.tour!.slides[0]!;
  if (slide.kind !== 'image') throw new Error('Expected image');
  slide.camera = { mode: 'manual', center: { x: 0.5, y: 0.5 }, zoom: 2 };
  await render(project);
  const stage = () => host.querySelector<HTMLElement>('.tour-stage-host')!;
  const motion = () =>
    stage().shadowRoot!.querySelector<HTMLElement>('[data-tour-stage]')!.dataset['motion'];
  const width = () => stage().shadowRoot!.querySelector<HTMLElement>('.tour-image')!.style.width;
  const base = width();
  await click('Camera area');
  expect(stage().dataset['view']).toBe('frame');
  expect(stage().shadowRoot!.querySelector('.tour-camera-frame')).not.toBeNull();
  const frame = stage().shadowRoot!.querySelector('.tour-camera-frame')!;
  await key(frame.querySelector('[data-edge=e]')!, 'ArrowLeft');
  const committed = current.tour!.slides[0]!;
  if (committed.kind !== 'image') throw new Error('Expected image');
  expect(committed.camera.zoom).toBeGreaterThan(2);
  expect(committed).toEqual({ ...slide, camera: committed.camera });
  expect(current.tour!.slides[1]).toEqual(project.tour!.slides[1]);
  await click('Preview from here');
  expect(stage().dataset['view']).toBe('preview');
  expect(stage().hasAttribute('inert')).toBe(false);
  await act(async () => {
    await tick(1400);
  });
  expect(motion()).toBe('settled');
  await click('Replay');
  expect(stage().dataset['view']).toBe('preview');
  expect(motion()).not.toBe('settled');
  await act(async () => {
    await tick(1400);
  });
  expect(motion()).toBe('settled');
  await click('Return to editing');
  expect(stage().dataset['view']).toBe('edit');
  expect(width()).toBe(base);
  expect(changed).toHaveBeenCalledTimes(1);
});

it('returns to editing when another slide is selected and disposes the preview player', async () => {
  instantImages();
  const tick = playbackFrames();
  await render();
  await click('Preview from here');
  const stage = () => host.querySelector<HTMLElement>('.tour-stage-host')!;
  expect(stage().dataset['view']).toBe('preview');
  const scene = () => stage().shadowRoot!.querySelector('[data-tour-scene]')!;
  await act(async () => {
    await tick(1400);
  });
  expect(scene().children.length).toBeGreaterThan(0);
  await click('2Second');
  expect(stage().dataset['view']).toBe('edit');
  expect(changed).not.toHaveBeenCalled();
});

function instantImages() {
  vi.stubGlobal(
    'Image',
    class {
      onload: (() => void) | null = null;
      onerror: ((error?: unknown) => void) | null = null;
      decode = () => Promise.resolve();
      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
  );
}

function playbackFrames() {
  let time = 0;
  let id = 0;
  const callbacks = new Map<number, FrameRequestCallback>();
  vi.spyOn(performance, 'now').mockImplementation(() => time);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callbacks.set(++id, callback);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (token: number) => callbacks.delete(token));
  return async (delta: number) => {
    time += delta;
    const queued = [...callbacks.values()];
    callbacks.clear();
    queued.forEach((callback) => callback(time));
    await Promise.resolve();
    await Promise.resolve();
  };
}

it('returns from end selection to the exact audio usage and retains grouped resource controls', async () => {
  const project = fixture();
  project.tour!.audioResources = [{ assetId: 'voice', duration: 2, name: 'Voice.wav' }];
  const first = project.tour!.slides[0]!;
  if (first.kind !== 'image') throw new Error('Expected image');
  first.actions = [
    {
      type: 'annotation',
      object: {
        id: 'spoken-action',
        text: 'Listen',
        anchor: null,
        appearance: null,
        narration: {
          assetId: 'voice',
          duration: 2,
          trimStart: 0,
          trimEnd: 2,
          gain: 1,
          transcript: '',
          trigger: 'enter',
        },
      },
    },
  ];
  await render(project);
  await click('End of tour');
  await click('Resources');
  const library = host.querySelector('#guide-library-panel')!;
  expect(library.querySelector('.guide-resource-footer')).toBeNull();
  expect(library.querySelector<HTMLButtonElement>('[title="Attach to selection"]')?.disabled).toBe(
    true
  );
  await click('Bindings: 1', library);
  expect(panelState.rightScope).toBe('selection');
  expect(panelState.rightOpen).toBe(true);
  expect(host.querySelector('#guide-inspector-panel')?.textContent).toContain('Listen');
  expect(library.querySelector<HTMLButtonElement>('[title="Attach to selection"]')?.disabled).toBe(
    false
  );
  expect(
    library.querySelector('.guide-image-resources .guide-image-upload-compact')
  ).not.toBeNull();
  expect(library.querySelector('.tour-audio-resources .tour-audio-acquisition')).not.toBeNull();
  expect(changed).not.toHaveBeenCalled();
});

it.each([
  ['off', 'annotation'],
  ['manual', 'annotation'],
  ['off', 'hotspot'],
  ['manual', 'hotspot'],
] as const)(
  'frames the selected action camera over %s defaults for %s and commits only that action',
  async (mode, actionType) => {
    const project = fixture();
    const slide = project.tour!.slides[0]!;
    if (slide.kind !== 'image') throw new Error('Expected image');
    slide.image!.width = 640;
    slide.image!.height = 360;
    slide.camera = { mode, center: { x: 0.5, y: 0.5 }, zoom: mode === 'off' ? 1 : 2 };
    slide.actions = ['framed', 'neighbor'].map((id, index) => ({
      type: 'annotation' as const,
      object: {
        id,
        text: index === 0 ? 'Framed action' : 'Neighbor action',
        anchor: null,
        appearance: null,
        camera: { mode: 'manual' as const, center: { x: 0.5, y: 0.5 }, zoom: index === 0 ? 4 : 3 },
      },
    }));
    if (actionType === 'hotspot') {
      slide.actions[0] = {
        type: 'hotspot',
        object: {
          id: 'framed',
          label: 'Framed action',
          text: 'Framed copy',
          point: { x: 0.5, y: 0.5 },
          targetRect: null,
          appearance: null,
          visual: { kind: 'point', pulse: false },
          camera: { mode: 'manual', center: { x: 0.5, y: 0.5 }, zoom: 4 },
        },
      };
    }
    const original = structuredClone(slide);
    await render(project);
    await click('Actions', host.querySelector('#guide-inspector-panel')!);
    await click(actionType === 'hotspot' ? 'Framed copy' : 'Framed action');
    await click('Camera area');
    const shadow = host.querySelector('.tour-stage-host')!.shadowRoot!;
    const frame = shadow.querySelector<HTMLElement>('.tour-camera-frame')!;
    expect(frame.style.width).toBe('160px');
    await key(frame.querySelector('[data-edge=e]')!, 'ArrowLeft');
    const updated = current.tour!.slides[0]!;
    if (updated.kind !== 'image') throw new Error('Expected image');
    expect(updated.camera).toEqual(original.camera);
    expect(updated.actions[0]!.object.camera!.zoom).toBeGreaterThan(4);
    expect(updated.actions[0]!.object).toEqual({
      ...original.actions[0]!.object,
      camera: updated.actions[0]!.object.camera,
    });
    expect(updated.actions[1]).toEqual(original.actions[1]);
    expect(updated.timing).toEqual(original.timing);
  }
);

it('preserves the chosen preview origin on Replay and restores author selection and scroll', async () => {
  instantImages();
  const project = fixture();
  const first = project.tour!.slides[0]!;
  if (first.kind !== 'image') throw new Error('Expected image');
  first.actions = [
    { type: 'annotation', object: { id: 'start', text: 'Start', anchor: null, appearance: null } },
  ];
  await render(project);
  await click('2Second');
  await click('Actions', host.querySelector('#guide-inspector-panel')!);
  await click('Go first');
  const inspector = host.querySelector<HTMLElement>('#guide-inspector-panel .guide-panel-scroll')!;
  const library = host.querySelector<HTMLElement>('#guide-library-panel .guide-panel-scroll');
  inspector.scrollTop = 123;
  if (library) library.scrollTop = 77;
  const stage = () => host.querySelector('.tour-stage-host')!.shadowRoot!;
  const player = () => stage().querySelector<HTMLElement>('#tour-player')!;
  const caption = stage().querySelector<HTMLElement>('[data-tour-hint-text]')!;
  caption.scrollTop = 91;
  await click('Preview from beginning');
  expect(player().dataset['slideId']).toBe('first');
  expect(player().dataset['actionId']).toBe('start');
  await act(async () => stage().querySelector<HTMLButtonElement>('[data-tour-next]')!.click());
  expect(player().dataset['actionId']).toBe('link');
  await click('Replay');
  expect(player().dataset['actionId']).toBe('start');
  await click('Return to editing');
  expect(stage().querySelector('[data-tour-object-id="link"]')?.getAttribute('data-selected')).toBe(
    'true'
  );
  expect(inspector.scrollTop).toBe(123);
  if (library) expect(library.scrollTop).toBe(77);
  expect(stage().querySelector<HTMLElement>('[data-tour-hint-text]')!.scrollTop).toBe(91);
  await click('Preview from here');
  expect(player().dataset['actionId']).toBe('link');
  await act(async () => stage().querySelector<HTMLButtonElement>('[data-tour-previous]')!.click());
  expect(player().dataset['actionId']).toBe('start');
  await click('Replay');
  expect(player().dataset['actionId']).toBe('link');
  await click('Return to editing');
  await click('End of tour');
  await click('Preview from beginning');
  expect(player().dataset['actionId']).toBe('start');
  await click('Return to editing');
  expect(host.querySelector('.tour-stage-host')!.getAttribute('data-view')).toBe('edit');
  expect(host.querySelector('.tour-end-row')?.getAttribute('aria-current')).toBe('step');
  expect(changed).not.toHaveBeenCalled();
});

it('uses authored text in the action row and selected inspector header without changing saved labels', async () => {
  const project = fixture();
  const slide = project.tour!.slides[1]!;
  if (slide.kind !== 'image') throw new Error('Expected image');
  getTourHotspots(slide)[0]!.text = ' \n Authored instruction \nMore detail';
  await render(project);
  await click('2Second');
  await click('Actions', host.querySelector('#guide-inspector-panel')!);
  const row = host.querySelector<HTMLButtonElement>('.tour-object-row')!;
  expect(row.title).toBe('Authored instruction');
  await act(async () => row.click());
  expect(host.querySelector('#guide-inspector-panel')!.getAttribute('aria-label')).toBe(
    'Authored instruction'
  );
  expect(getTourHotspots(slide)[0]!.label).toBe('Go first');
  expect(changed).not.toHaveBeenCalled();
});

it('returns batch AI to the document category and original trigger focus', async () => {
  const frames: FrameRequestCallback[] = [];
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => frames.push(callback));
  const access: ScenarioNarrationAccess = {
    prepareNarration: vi.fn(async () => {
      throw new Error('Unexpected generation');
    }),
    applyNarration: vi.fn(async () => false),
  };
  const project = fixture();
  const slide = project.tour!.slides[1]!;
  if (slide.kind !== 'image') throw new Error('Expected image');
  getTourHotspots(slide)[0]!.text = 'Narrate this authored instruction';
  const original = structuredClone(project);
  await act(async () => root.render(<Probe initial={project} narrationAI={access} />));
  await act(async () => panelState.openRight('document'));
  await click('Playback', host.querySelector('#guide-inspector-panel')!);
  const category = [
    ...host.querySelectorAll<HTMLButtonElement>('#guide-inspector-panel button'),
  ].find((node) => node.title === 'Playback' || node.textContent?.trim() === 'Playback')!;
  expect(category.getAttribute('aria-pressed')).toBe('true');
  const trigger = host.querySelector<HTMLButtonElement>('[data-ai-batch]')!;
  expect(trigger.disabled).toBe(false);
  await act(async () => trigger.focus());
  await act(async () => trigger.click());
  const form = host.querySelector<HTMLElement>('[data-tour-narration-ai]')!;
  expect(form).not.toBeNull();
  expect(document.activeElement).toBe(form);
  expect(host.querySelector('#guide-inspector-panel')!.getAttribute('aria-label')).toBe(
    'AI narration'
  );
  expect(panelState.rightScope).toBe('document');
  expect(host.querySelector<HTMLButtonElement>('[data-ai-generate]')!.disabled).toBe(true);
  await click('Back to slide settings', host.querySelector('#guide-inspector-panel')!);
  await act(async () => frames.splice(0).forEach((callback) => callback(0)));
  expect(host.querySelector('[data-tour-narration-ai]')).toBeNull();
  expect(host.querySelector('#guide-inspector-panel')!.getAttribute('aria-label')).toBe(
    'Tour appearance'
  );
  expect(panelState.rightScope).toBe('document');
  expect(host.querySelector('input[aria-label="Minimum"]')).not.toBeNull();
  expect(category.getAttribute('aria-pressed')).toBe('true');
  expect(document.activeElement).toBe(trigger);
  expect(current).toEqual(original);
  expect(changed).not.toHaveBeenCalled();
  expect(access.prepareNarration).not.toHaveBeenCalled();
  expect(access.applyNarration).not.toHaveBeenCalled();
});

it('restores the single-action AI trigger after closing its form', async () => {
  const frames: FrameRequestCallback[] = [];
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => frames.push(callback));
  const access: ScenarioNarrationAccess = {
    prepareNarration: vi.fn(async () => {
      throw new Error('Unexpected generation');
    }),
    applyNarration: vi.fn(async () => false),
  };
  const project = fixture();
  const slide = project.tour!.slides[1]!;
  if (slide.kind !== 'image') throw new Error('Expected image');
  getTourHotspots(slide)[0]!.text = 'Single authored instruction';
  await act(async () => root.render(<Probe initial={project} narrationAI={access} />));
  await click('2Second');
  await click('Actions', host.querySelector('#guide-inspector-panel')!);
  await click('Single authored instruction');
  await click('Narration', host.querySelector('#guide-inspector-panel')!);
  const original = structuredClone(current);
  const trigger = host.querySelector<HTMLButtonElement>('[data-ai-single]')!;
  expect(trigger.disabled).toBe(false);
  await act(async () => trigger.focus());
  await act(async () => trigger.click());
  expect(trigger.isConnected).toBe(false);
  expect(host.querySelector('[data-tour-narration-ai]')!.getAttribute('aria-label')).toBe(
    'AI narration'
  );
  expect(host.querySelector<HTMLButtonElement>('[data-ai-generate]')!.disabled).toBe(true);
  expect(panelState.rightScope).toBe('selection');
  await click('Back to slide settings', host.querySelector('#guide-inspector-panel')!);
  await act(async () => frames.splice(0).forEach((callback) => callback(0)));
  const restored = host.querySelector<HTMLButtonElement>('[data-ai-single]')!;
  expect(restored).not.toBe(trigger);
  expect(document.activeElement).toBe(restored);
  expect(host.querySelector('#guide-inspector-panel')!.getAttribute('aria-label')).toBe(
    'Single authored instruction'
  );
  expect(current).toEqual(original);
  expect(getTourHotspots(slide)[0]!.label).toBe('Go first');
  expect(changed).not.toHaveBeenCalled();
});

it.each([
  [' \n Authored annotation \nMore detail', 'Authored annotation'],
  [' \n ', 'Text action'],
])('projects annotation title %s without changing source data', async (text, title) => {
  const project = fixture();
  const slide = project.tour!.slides[1]!;
  if (slide.kind !== 'image') throw new Error('Expected image');
  slide.actions.push({
    type: 'annotation',
    object: { id: 'note', text, anchor: null, appearance: null },
  });
  const original = structuredClone(project);
  await render(project);
  await click('2Second');
  await click('Actions', host.querySelector('#guide-inspector-panel')!);
  const row = [...host.querySelectorAll<HTMLButtonElement>('.tour-object-row')].find(
    (node) => node.title === title
  )!;
  expect(row).not.toBeUndefined();
  await act(async () => row.click());
  expect(host.querySelector('#guide-inspector-panel')!.getAttribute('aria-label')).toBe(title);
  expect(getTourHotspots(slide)[0]!.label).toBe('Go first');
  expect(current).toEqual(original);
  expect(changed).not.toHaveBeenCalled();
});
