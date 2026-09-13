// @vitest-environment jsdom
import { act, useState } from 'react';
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
const prepare = vi.hoisted(() => vi.fn());
vi.mock('../../../workflows/scenario-capture-edit/tour-materials', () => ({
  prepareTourFromGuide: prepare,
}));
let host: HTMLDivElement;
let root: Root;
let current: GuideProject;
let panelState: ReturnType<typeof useGuidePanels>;
const imported = vi.fn();
const changed = vi.fn();
function Probe({ initial, locked = false }: { initial: GuideProject; locked?: boolean }) {
  const [project, setProject] = useState(initial);
  current = project;
  const panels = useGuidePanels();
  panelState = panels;
  return (
    <TourWorkspace
      project={project}
      images={{ image: 'data:image/png;base64,aA==' }}
      panels={panels}
      header={<header>Project header</header>}
      disabled={locked}
      t={createTranslator('en')}
      onChange={(next) => {
        changed(next);
        setProject(next);
      }}
      onImport={imported}
      onImportNarration={imported}
    />
  );
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('innerWidth', 1280);
  changed.mockReset();
  imported.mockReset();
  imported.mockResolvedValue(true);
  prepare.mockReset();
  prepare.mockResolvedValue({ tour: createTourDocument(), issues: [] });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
function fixture() {
  const project = createGuideProject('Project');
  project.items = [createGuideStep('Keep guide')];
  project.tour = createTourDocument();
  const first = createTourImageSlide('first');
  first.title = 'First';
  first.image = {
    assetId: 'image',
    width: 100,
    height: 100,
    alt: 'Image',
    galleryAssetId: null,
    editDocumentId: null,
    source: { kind: 'import', filename: 'test.png' },
  };
  const second = { ...createTourImageSlide('second'), title: 'Second', image: first.image };
  second.hotspots = [
    {
      id: 'link',
      label: 'Go first',
      text: '',
      point: { x: 0.5, y: 0.5 },
      targetRect: null,
      appearance: null,
      pulse: false,
      action: { kind: 'slide', slideId: 'first' },
    },
  ];
  project.tour.slides = [first, second];
  return project;
}
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
  await render();
  const before = current.items;
  const rows = () => host.querySelectorAll('.tour-slide-row');
  await click('Duplicate slide', rows()[0]!);
  expect(current.tour!.slides).toHaveLength(3);
  const duplicated = current.tour!.slides[1]!.id;
  const handle = rows()[1]!.querySelector('button')!;
  await key(handle, 'End');
  expect(current.tour!.slides.at(-1)?.id).toBe(duplicated);
  await key(host.querySelectorAll('.tour-slide-row')[2]!.querySelector('button')!, 'Home');
  expect(current.tour!.slides[0]!.id).toBe(duplicated);
  await click('Delete', rows()[1]!);
  expect(host.textContent).toContain('Other slides link here');
  await click('Cancel');
  expect(current.tour!.slides).toHaveLength(3);
  await click('Delete', rows()[1]!);
  await click('Delete', host.querySelector('.tour-review-notice')!);
  expect(current.tour!.slides.some((s) => s.id === 'first')).toBe(false);
  const second = current.tour!.slides.find((s) => s.id === 'second');
  expect(second?.kind === 'image' && second.hotspots[0]?.action.kind).toBe('none');
  expect(current.items).toEqual(before);
});
it('shows unique resources, previews them and cycles through their usages without editing', async () => {
  await render();
  await click('Resources');
  expect(host.querySelectorAll('.tour-resource-row')).toHaveLength(1);
  await click('View image');
  expect(document.querySelector('[role=dialog] img')).not.toBeNull();
  await click('Close', document.querySelector('[role=dialog]')!);
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

it('imports files into the selected destination and commits source-coordinate object drags', async () => {
  const project = fixture();
  const slide = project.tour!.slides[0]!;
  if (slide.kind !== 'image') throw new Error('Expected image');
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
  slide.annotations = [{ id: 'note', text: 'Note', anchor: { x: 0.2, y: 0.2 }, appearance: null }];
  slide.masks = [
    {
      id: 'mask',
      rect: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
      kind: 'highlight',
      color: '#F97316',
      opacity: 0.3,
    },
  ];
  await render(project);
  expect(
    host.querySelector('#guide-inspector-panel input[type=file][accept^="image/"]')
  ).toBeNull();
  const shadow = () => host.querySelector('.tour-stage-host')!.shadowRoot!;
  for (const id of ['point', 'note', 'mask']) {
    const marker = shadow().querySelector<HTMLElement>(`[data-tour-object-id="${id}"]`)!;
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
  }
  const result = current.tour!.slides[0]!;
  if (result.kind !== 'image') throw new Error('Expected image');
  expect(result.hotspots[0]!.point.x).toBeGreaterThan(0.5);
  expect(result.annotations[0]!.anchor!.x).toBeGreaterThan(0.2);
  expect(result.masks[0]!.rect.x).toBeGreaterThan(0.1);
  expect(host.textContent).toContain('Back to slide settings');
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
  project.tour!.slides[1]!.timing.autoplayTarget = 'first';
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
        action: { kind: 'slide' as const, slideId: 'first' },
      },
    ],
  };
  project.tour!.slides.push(navigation);
  await render(project);
  await click('Delete', host.querySelector('.tour-slide-row')!);
  const notice = host.querySelector('.tour-review-notice')!;
  expect(notice.textContent).toContain('Second — Automatic transition');
  expect(notice.textContent).toContain('Second — Go first');
  expect(notice.textContent).toContain('Contents — Start here');
  expect(current.tour!.slides).toHaveLength(3);
  await click('Delete', notice);
  expect(current.tour!.slides).toHaveLength(2);
  expect(current.tour!.slides[0]?.timing.autoplayTarget).toBeNull();
  const repaired = current.tour!.slides[1]!;
  expect(repaired.kind === 'navigation' && repaired.buttons[0]?.action.kind).toBe('none');
});

it('offers narration for the exact selected hotspot', async () => {
  await render();
  await click('2Second');
  await click('Slide objects', host.querySelector('#guide-inspector-panel')!);
  await click('Go first');
  const inspector = host.querySelector('#guide-inspector-panel')!;
  expect(inspector.textContent).toContain('Object narration');
  expect([...inspector.querySelectorAll('button')].some((b) => b.textContent === 'Record')).toBe(
    true
  );
});

it('uses the header presentation switch and keeps narration in playback, objects flat', async () => {
  await render();
  const panel = () => host.querySelector('#guide-inspector-panel')!;
  await click('Show all settings', panel());
  expect(panel().querySelector('nav')).toBeNull();
  expect(panel().textContent).toContain('Slide narration');
  await click('Show settings sections', panel());
  expect(panel().textContent).not.toContain('Slide narration');
  await click('Playback', panel());
  expect(panel().textContent).toContain('Slide narration');
  await click('Slide objects', panel());
  await click('Hotspot', panel());
  expect(panel().querySelector('nav')).toBeNull();
  expect(panel().querySelector('[title="Show all settings"]')).toBeNull();
  expect(panel().textContent).toContain('Object narration');
  await click('Back to slide settings', panel());
  expect(panel().querySelector('[aria-label="Slide objects"]')?.getAttribute('aria-pressed')).toBe(
    'true'
  );
});
