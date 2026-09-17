// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ReviewSourceLane } from './timeline-selection';
import type { ReviewAnchor, ReviewEdit } from '../../features/video/review/types';

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

function renderLane(args: {
  edits: ReviewEdit[];
  onChangeEdit: (edit: ReviewEdit, range: ReviewAnchor) => void;
  time: number;
  selection: ReviewAnchor;
}) {
  act(() => {
    root.render(
      <ReviewSourceLane
        duration={10}
        time={args.time}
        selection={args.selection}
        annotations={[]}
        edits={args.edits}
        boundaries={[0, 2, 4, 6, 8, 10]}
        onEdit={vi.fn()}
        onChangeEdit={args.onChangeEdit}
        onSeek={vi.fn()}
        onSelect={vi.fn()}
        onComment={vi.fn()}
      />
    );
  });
  const lane = host.querySelector<HTMLElement>('[data-ui="gallery.videoReview.sourceLane"]')!;
  vi.spyOn(lane, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 1000, 48));
  const button = lane.querySelector<HTMLButtonElement>('button')!;
  const block = button.parentElement!;
  Object.assign(block, {
    setPointerCapture: vi.fn(),
    hasPointerCapture: () => true,
    releasePointerCapture: vi.fn(),
  });
  const event = async (target: Element, kind: string, x: number, extra: PointerInit = {}) =>
    act(async () => {
      target.dispatchEvent(
        new MouseEvent(kind, { bubbles: true, clientX: x, button: 0, ...extra })
      );
    });
  return {
    block,
    start: block.querySelector('[data-edge="start"]')!,
    end: block.querySelector('[data-edge="end"]')!,
    event,
  };
}

type PointerInit = { shiftKey?: boolean };

const cut = (start: number, end: number): ReviewEdit => ({
  id: 'cut',
  kind: 'cut',
  start,
  end,
  requestedStart: start,
  requestedEnd: end,
});

it('moves and resizes edit blocks once per gesture, cancelling transient geometry safely', async () => {
  const change = vi.fn();
  const edit = cut(2, 4);
  const lane = renderLane({
    edits: [edit],
    onChangeEdit: change,
    time: 0,
    selection: { kind: 'point', time: 0 },
  });
  const { block } = lane;
  const event = async (target: Element, kind: string, x: number, button = 0) =>
    act(async () => {
      target.dispatchEvent(new MouseEvent(kind, { bubbles: true, clientX: x, button }));
    });
  await event(block, 'pointerdown', 200);
  await event(block, 'pointermove', 400);
  expect(block.style.left).toBe('40%');
  expect(change).not.toHaveBeenCalled();
  await event(block, 'pointerup', 400);
  expect(change).toHaveBeenLastCalledWith(edit, { kind: 'range', start: 4, end: 6 });
  expect(change).toHaveBeenCalledOnce();
  await event(lane.start, 'pointerdown', 200);
  await event(block, 'pointermove', 0);
  await event(block, 'pointerup', 0);
  expect(change).toHaveBeenLastCalledWith(edit, { kind: 'range', start: 0, end: 4 });
  await event(lane.end, 'pointerdown', 400);
  await event(block, 'pointermove', 605);
  await event(block, 'pointerup', 605);
  expect(change).toHaveBeenLastCalledWith(edit, { kind: 'range', start: 2, end: 6 });
  change.mockClear();
  await event(block, 'pointerdown', 200);
  await event(block, 'pointermove', 600);
  await event(block, 'pointercancel', 600);
  await event(block, 'pointerup', 600);
  expect(change).not.toHaveBeenCalled();
  expect(block.style.left).toBe('20%');
  for (const target of [block, lane.start, lane.end]) {
    vi.mocked(block.releasePointerCapture).mockClear();
    const destination = target === lane.start ? 0 : 400;
    await event(target, 'pointerdown', 200);
    await event(block, 'pointermove', destination);
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    expect(block.style.left).toBe('20%');
    expect(block.style.width).toBe('20%');
    expect(block.releasePointerCapture).toHaveBeenCalled();
    await event(block, 'pointerup', destination);
    expect(change).not.toHaveBeenCalled();
  }
  await event(block, 'pointerdown', 200, 2);
  await event(block, 'pointermove', 500);
  await event(block, 'pointerup', 500);
  expect(change).not.toHaveBeenCalled();
  await act(async () =>
    lane.end.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowRight' }))
  );
  expect(change).toHaveBeenLastCalledWith(edit, { kind: 'range', start: 2, end: 6 });
  await act(async () =>
    lane.start.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowLeft' }))
  );
  expect(change).toHaveBeenLastCalledWith(edit, { kind: 'range', start: 0, end: 4 });
});

it('snaps boundary drags to candidates inside the pixel threshold with a shift bypass', async () => {
  const change = vi.fn();
  const edit = cut(2, 4);
  const lane = renderLane({
    edits: [edit],
    onChangeEdit: change,
    time: 6,
    selection: { kind: 'point', time: 6 },
  });
  // Trim end edge: 605px is 5px from the 6s boundary (8px threshold) and snaps only that edge.
  await lane.event(lane.end, 'pointerdown', 400);
  await lane.event(lane.block, 'pointermove', 605);
  expect(lane.block.style.left).toBe('20%');
  expect(change).not.toHaveBeenCalled();
  await lane.event(lane.block, 'pointerup', 605);
  expect(change).toHaveBeenLastCalledWith(edit, { kind: 'range', start: 2, end: 6 });
  // Beyond the threshold the magnet releases and the edge follows the pointer.
  await lane.event(lane.end, 'pointerdown', 400);
  await lane.event(lane.block, 'pointermove', 650);
  await lane.event(lane.block, 'pointerup', 650);
  expect(change).toHaveBeenLastCalledWith(edit, { kind: 'range', start: 2, end: 6.5 });
  // Trim start edge: the untouched end edge never snaps.
  await lane.event(lane.start, 'pointerdown', 200);
  await lane.event(lane.block, 'pointermove', 230);
  await lane.event(lane.block, 'pointerup', 230);
  expect(change).toHaveBeenLastCalledWith(edit, { kind: 'range', start: 2.3, end: 4 });
  // Shift temporarily disables the magnet.
  await lane.event(lane.end, 'pointerdown', 400);
  await lane.event(lane.block, 'pointermove', 605, { shiftKey: true });
  await lane.event(lane.block, 'pointerup', 605);
  expect(change).toHaveBeenLastCalledWith(edit, { kind: 'range', start: 2, end: 6.05 });
});
