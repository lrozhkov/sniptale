// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ReviewZoomTrack } from './zoom-track';
import type { QuickEditZoomRegion } from '../../features/video/review/advanced/types';
import type { ReviewEdit } from '../../features/video/review/types';

vi.mock('../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/i18n')>()),
  translate: (key: string) => key,
}));

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const zoom = (id: string, start: number, end: number): QuickEditZoomRegion => ({
  id,
  start,
  end,
  transform: { scale: 1.5, centerX: 0.5, centerY: 0.5 },
  enter: { type: 'ease-in-out', duration: 0.3 },
  exit: { type: 'ease-in-out', duration: 0.3 },
});

const edits: ReviewEdit[] = [];

function renderTrack(
  regions: QuickEditZoomRegion[],
  onDragCommit: (
    id: string,
    range: { start: number; end: number },
    edge: 'start' | 'end' | 'move'
  ) => void,
  onAdd = vi.fn(),
  time: number | null = 6,
  overrides?: {
    edits?: ReviewEdit[];
    toOutputTime?: (source: number) => number | null;
    enabled?: boolean;
    onLink?: (id: string, targetId: string | null) => void;
    onSelectLink?: (id: string) => void;
    linkSelectedId?: string | null;
  }
) {
  act(() => {
    root.render(
      <ReviewZoomTrack
        duration={10}
        {...(time === null ? { time: null } : { time })}
        regions={regions}
        edits={overrides?.edits ?? edits}
        boundaries={[0, 2, 4, 6, 8, 10]}
        toOutputTime={overrides?.toOutputTime ?? ((source: number) => source)}
        selectedId={null}
        onSelect={vi.fn()}
        onAdd={onAdd}
        onDragCommit={onDragCommit}
        {...(overrides?.enabled === undefined ? {} : { enabled: overrides.enabled })}
        {...(overrides?.onLink ? { onLink: overrides.onLink } : {})}
        {...(overrides?.onSelectLink ? { onSelectLink: overrides.onSelectLink } : {})}
        {...(overrides?.linkSelectedId !== undefined
          ? { linkSelectedId: overrides.linkSelectedId }
          : {})}
      />
    );
  });
  const lane = host.querySelector<HTMLElement>('[data-ui="gallery.videoReview.zoomLane"]')!;
  vi.spyOn(lane, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 1000, 32));
  return {
    lane,
    blocks: [...lane.querySelectorAll<HTMLElement>('[role="button"]')],
    add: host.querySelector<HTMLButtonElement>('[aria-label="gallery.videoReview.zoomAdd"]')!,
    event: async (target: Element, kind: string, x: number, shift = false) =>
      act(async () => {
        target.dispatchEvent(
          new MouseEvent(kind, { bubbles: true, clientX: x, button: 0, shiftKey: shift })
        );
      }),
  };
}

it('adds regions through the lane button', async () => {
  const onAdd = vi.fn();
  const track = renderTrack([zoom('a', 0, 2)], vi.fn(), onAdd);
  await act(async () => track.add.click());
  expect(onAdd).toHaveBeenCalledOnce();
});

it('snaps to edit edges projected into result time (R03)', async () => {
  const commit = vi.fn((_id: string, _range: { start: number; end: number }) => undefined);
  const sourceEdits: ReviewEdit[] = [
    { id: 'edit-1', start: 6, end: 7, requestedStart: 6, requestedEnd: 7, kind: 'cut' },
  ];
  const track = renderTrack([zoom('a', 0, 2)], commit, vi.fn(), 6, {
    edits: sourceEdits,
    toOutputTime: (source) => source / 2,
  });
  const first = track.blocks[0];
  if (!first) throw new Error('Zoom region did not render.');
  Object.assign(first, {
    setPointerCapture: vi.fn(),
    hasPointerCapture: () => true,
    releasePointerCapture: vi.fn(),
  });
  await track.event(first, 'pointerdown', 100);
  await track.event(first, 'pointermove', 400);
  await track.event(first, 'pointerup', 400);
  // Source edge 6 projects to result 3: the move snaps there instead of 2.75.
  expect(commit).toHaveBeenLastCalledWith('a', { start: 3, end: 5 }, 'move');
});

it('ignores dormant regions for snapping (R03)', async () => {
  const commit = vi.fn((_id: string, _range: { start: number; end: number }) => undefined);
  const dormant = { ...zoom('d', 3, 5), dormant: true };
  const track = renderTrack([zoom('a', 0, 2), dormant], commit, vi.fn(), 6);
  const first = track.blocks[0];
  if (!first) throw new Error('Zoom region did not render.');
  Object.assign(first, {
    setPointerCapture: vi.fn(),
    hasPointerCapture: () => true,
    releasePointerCapture: vi.fn(),
  });
  // freeStart 2.96: a dormant region at [3,5) must not magnet the move to 3.
  await track.event(first, 'pointerdown', 100);
  await track.event(first, 'pointermove', 396);
  await track.event(first, 'pointerup', 396);
  expect(commit).toHaveBeenLastCalledWith('a', { start: 2.96, end: 4.96 }, 'move');
});

it('exposes a connect affordance on an eligible gap and creates the link', async () => {
  const onLink = vi.fn((_id: string, _target: string | null) => undefined);
  const onSelectLink = vi.fn((_id: string) => undefined);
  renderTrack([zoom('a', 0, 2), zoom('b', 4, 6)], vi.fn(), vi.fn(), 6, {
    onLink,
    onSelectLink,
  });
  const gap = host.querySelector<HTMLButtonElement>('[data-ui="gallery.videoReview.zoomLink"]')!;
  expect(gap.getAttribute('data-connected')).toBe('false');
  expect(gap.getAttribute('aria-pressed')).toBe('false');
  await act(async () => gap.click());
  expect(onLink).toHaveBeenCalledWith('a', 'b');
  expect(onSelectLink).toHaveBeenCalledWith('a');
});

it('keeps a connected gap visible and selects its settings instead of unlinking', async () => {
  const onLink = vi.fn((_id: string, _target: string | null) => undefined);
  const onSelectLink = vi.fn((_id: string) => undefined);
  const linked: QuickEditZoomRegion = { ...zoom('a', 0, 2), linkTo: 'b' };
  renderTrack([linked, zoom('b', 4, 6)], vi.fn(), vi.fn(), 6, {
    onLink,
    onSelectLink,
    linkSelectedId: 'a',
  });
  const gap = host.querySelector<HTMLButtonElement>('[data-ui="gallery.videoReview.zoomLink"]')!;
  expect(gap.getAttribute('data-connected')).toBe('true');
  expect(gap.getAttribute('aria-pressed')).toBe('true');
  await act(async () => gap.click());
  // Clicking the connected gap opens settings; it must not silently unlink.
  expect(onSelectLink).toHaveBeenCalledWith('a');
  expect(onLink).not.toHaveBeenCalled();
});

it('hides the affordance for dormant, touching, or disabled pairs', () => {
  const onLink = vi.fn((_id: string, _target: string | null) => undefined);
  // Touching edges leave no gap to link.
  renderTrack([zoom('a', 0, 2), zoom('b', 2, 4)], vi.fn(), vi.fn(), 6, { onLink });
  expect(host.querySelector('[data-ui="gallery.videoReview.zoomLink"]')).toBeNull();
  // A dormant source is skipped entirely.
  const dormant: QuickEditZoomRegion = { ...zoom('a', 0, 2), dormant: true };
  renderTrack([dormant, zoom('b', 4, 6)], vi.fn(), vi.fn(), 6, { onLink });
  expect(host.querySelector('[data-ui="gallery.videoReview.zoomLink"]')).toBeNull();
  // Disabled zoom lane keeps no connect control.
  renderTrack([zoom('a', 0, 2), zoom('b', 4, 6)], vi.fn(), vi.fn(), 6, {
    onLink,
    enabled: false,
  });
  expect(host.querySelector('[data-ui="gallery.videoReview.zoomLink"]')).toBeNull();
});

it('leaves playhead ownership to the shared timeline across kept and removed source points', () => {
  renderTrack([zoom('a', 0, 2)], vi.fn(), vi.fn(), 6);
  const playhead = host.querySelector<HTMLElement>('[data-zoom-playhead]');
  expect(playhead).toBeNull();
  renderTrack([zoom('a', 0, 2)], vi.fn(), vi.fn(), null);
  expect(host.querySelector('[data-zoom-playhead]')).toBeNull();
});

it('moves a whole region and keeps a trim drag inside the neighbor window', async () => {
  const commit = vi.fn((_id: string, _range: { start: number; end: number }) => undefined);
  const track = renderTrack([zoom('a', 0, 2), zoom('b', 4, 6)], commit);
  const [first, second] = track.blocks;
  if (!first || !second) throw new Error('Zoom regions did not render.');
  Object.assign(first, {
    setPointerCapture: vi.fn(),
    hasPointerCapture: () => true,
    releasePointerCapture: vi.fn(),
  });
  Object.assign(second, {
    setPointerCapture: vi.fn(),
    hasPointerCapture: () => true,
    releasePointerCapture: vi.fn(),
  });
  // Move the first region by one second.
  await track.event(first, 'pointerdown', 100);
  await track.event(first, 'pointermove', 200);
  await track.event(first, 'pointerup', 200);
  expect(commit).toHaveBeenLastCalledWith('a', { start: 1, end: 3 }, 'move');
  const startEdge = second.querySelector('[data-zoom-edge="start"]')!;
  if (!(first instanceof HTMLElement) || !(second instanceof HTMLElement)) return;
  // Trim the start edge of the second region onto the first region's boundary (8px magnet).
  await track.event(startEdge, 'pointerdown', 400);
  await track.event(second, 'pointermove', 195);
  expect(document.querySelector('[data-zoom-guide]')).not.toBeNull();
  await track.event(second, 'pointerup', 195);
  expect(commit).toHaveBeenLastCalledWith('b', { start: 2, end: 6 }, 'start');
  expect(document.querySelector('[data-zoom-guide]')).toBeNull();
  // The shift bypass releases the magnet; the clamp still keeps the window open.
  await track.event(startEdge, 'pointerdown', 400);
  await track.event(second, 'pointermove', 195, true);
  await track.event(second, 'pointerup', 195);
  expect(commit).toHaveBeenLastCalledWith('b', { start: 2, end: 6 }, 'start');
  expect(commit).toHaveBeenCalledTimes(3);
  // Escape cancels the transient drag without committing.
  await track.event(startEdge, 'pointerdown', 400);
  await track.event(second, 'pointermove', 195);
  await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
  await track.event(second, 'pointerup', 195);
  expect(commit).toHaveBeenCalledTimes(3);
});
