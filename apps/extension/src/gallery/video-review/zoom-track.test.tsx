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
  onAdd = vi.fn()
) {
  act(() => {
    root.render(
      <ReviewZoomTrack
        duration={10}
        time={6}
        regions={regions}
        edits={edits}
        boundaries={[0, 2, 4, 6, 8, 10]}
        selectedId={null}
        onSelect={vi.fn()}
        onAdd={onAdd}
        onDragCommit={onDragCommit}
      />
    );
  });
  const lane = host.querySelector<HTMLElement>('[data-ui="gallery.videoReview.zoomLane"]')!;
  vi.spyOn(lane, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 1000, 32));
  return {
    lane,
    blocks: [...lane.querySelectorAll<HTMLElement>('[role="button"]')],
    add: lane.querySelector<HTMLButtonElement>('[aria-label="gallery.videoReview.zoomAdd"]')!,
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
