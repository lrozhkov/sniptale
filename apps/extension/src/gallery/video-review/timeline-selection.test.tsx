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
  beforeAction?: Parameters<typeof ReviewSourceLane>[0]['beforeAction'];
  edits: ReviewEdit[];
  onChangeEdit: (edit: ReviewEdit, range: ReviewAnchor) => void;
  time: number;
  selection: ReviewAnchor;
  boundaries?: number[];
  snapToKeyframes?: boolean;
  plane?: { left: number; width: number };
}) {
  act(() => {
    root.render(
      <ReviewSourceLane
        beforeAction={args.beforeAction}
        duration={10}
        time={args.time}
        selection={args.selection}
        annotations={[]}
        edits={args.edits}
        boundaries={args.boundaries ?? [0, 2, 4, 6, 8, 10]}
        {...(args.snapToKeyframes ? { snapToKeyframes: true } : {})}
        onEdit={vi.fn()}
        onChangeEdit={args.onChangeEdit}
        onSeek={vi.fn()}
        onSelect={vi.fn()}
        onComment={vi.fn()}
      />
    );
  });
  const lane = host.querySelector<HTMLElement>('[data-ui="gallery.videoReview.sourceLane"]')!;
  vi.spyOn(lane, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(args.plane?.left ?? 0, 0, args.plane?.width ?? 1000, 48)
  );
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

it('keeps a whole source edit at its original width when only one edge meets a magnet', async () => {
  const change = vi.fn();
  const edit = cut(2, 4);
  const lane = renderLane({
    edits: [edit],
    onChangeEdit: change,
    time: 5,
    selection: { kind: 'point', time: 5 },
  });
  await lane.event(lane.block, 'pointerdown', 200);
  await lane.event(lane.block, 'pointermove', 305);
  expect(lane.block.style.left).toBe('30%');
  expect(lane.block.style.width).toBe('20%');
  await lane.event(lane.block, 'pointerup', 305);
  expect(change).toHaveBeenLastCalledWith(edit, { kind: 'range', start: 3, end: 5 });

  await lane.event(lane.block, 'pointerdown', 200);
  await lane.event(lane.block, 'pointermove', 305, { shiftKey: true });
  expect(parseFloat(lane.block.style.width)).toBeCloseTo(20);
  await lane.event(lane.block, 'pointerup', 305);
  expect(change).toHaveBeenLastCalledWith(edit, { kind: 'range', start: 3.05, end: 5.05 });
});

it('keeps a basic edit in place when the target keyframe has no equal-length partner', async () => {
  const change = vi.fn();
  const edit = cut(0, 2);
  const lane = renderLane({
    edits: [edit],
    onChangeEdit: change,
    time: 0,
    selection: { kind: 'point', time: 0 },
    boundaries: [0, 2, 4, 7, 9, 10],
    snapToKeyframes: true,
  });
  await lane.event(lane.block, 'pointerdown', 0);
  await lane.event(lane.block, 'pointermove', 400);
  expect(lane.block.style.left).toBe('0%');
  expect(lane.block.style.width).toBe('20%');
  await lane.event(lane.block, 'pointerup', 400);
  expect(change).not.toHaveBeenCalled();
  await lane.event(lane.block, 'pointerdown', 0);
  await lane.event(lane.block, 'pointermove', 700);
  expect(lane.block.style.left).toBe('70%');
  expect(lane.block.style.width).toBe('20%');
  await lane.event(lane.block, 'pointerup', 700);
  expect(change).toHaveBeenCalledWith(edit, { kind: 'range', start: 7, end: 9 });
});

it.each([
  { left: 0, width: 500, travel: 124.5 },
  { left: -240, width: 1500, travel: 373.5 },
])('moves a speed block near the track end at width $width and scroll $left', async (plane) => {
  const change = vi.fn();
  const edit: ReviewEdit = {
    ...cut(5.5, 7.5),
    kind: 'speed',
    rate: 2,
    audio: 'speed',
  };
  const lane = renderLane({
    edits: [edit],
    onChangeEdit: change,
    time: 0,
    selection: { kind: 'point', time: 0 },
    boundaries: [8.01, 9.95],
    plane,
  });
  await lane.event(lane.block, 'pointerdown', 0);
  await lane.event(lane.block, 'pointermove', plane.travel);
  expect(Number.parseFloat(lane.block.style.width)).toBeCloseTo(20);
  expect(Number.parseFloat(lane.block.style.left)).toBeCloseTo(79.5);
  await lane.event(lane.block, 'pointerup', plane.travel);
  const committed = change.mock.calls[0]?.[1] as ReviewAnchor;
  expect(committed.kind).toBe('range');
  if (committed.kind === 'range') {
    expect(committed.start).toBeCloseTo(7.95);
    expect(committed.end).toBeCloseTo(9.95);
    expect(committed.end - committed.start).toBeCloseTo(2);
  }
  renderLane({
    edits: [{ ...edit, start: 7.95, end: 9.95 }],
    onChangeEdit: change,
    time: 0,
    selection: { kind: 'point', time: 0 },
    plane,
  });
  expect(
    Number.parseFloat(
      host.querySelector<HTMLElement>('[data-ui="gallery.videoReview.editBlock"]')!.style.width
    )
  ).toBeCloseTo(20);
});

it('keeps resize geometry while a deferred commit is pending and restores it on rejection', async () => {
  let settle!: () => void;
  const pending = new Promise<void>((resolve) => {
    settle = resolve;
  });
  const lane = renderLane({
    edits: [cut(2, 4)],
    time: 0,
    selection: { kind: 'point', time: 0 },
    onChangeEdit: () => pending,
  });
  await lane.event(lane.end, 'pointerdown', 400);
  await lane.event(lane.block, 'pointermove', 600, { shiftKey: true });
  expect(lane.block.style.width).toBe('40%');
  await lane.event(lane.block, 'pointerup', 600);
  expect(lane.block.style.width).toBe('40%');
  await act(async () => settle());
  expect(lane.block.style.width).toBe('20%');
});

it('retains the complete edit drag until new-note admission finishes', async () => {
  let admit!: () => void;
  const change = vi.fn();
  const edit = cut(2, 4);
  const lane = renderLane({
    edits: [edit],
    time: 0,
    selection: { kind: 'point', time: 0 },
    onChangeEdit: change,
    beforeAction: (action) => {
      admit = action;
    },
  });
  await lane.event(lane.block, 'pointerdown', 200);
  await lane.event(lane.block, 'pointermove', 400);
  await lane.event(lane.block, 'pointerup', 400);
  expect(change).not.toHaveBeenCalled();
  await act(async () => admit());
  expect(change).toHaveBeenCalledExactlyOnceWith(edit, { kind: 'range', start: 4, end: 6 });
});

it('keeps compact range notes above source content without changing authored anchors', async () => {
  const note = {
    id: 'interval-note',
    text: 'A long note '.repeat(100),
    anchor: { kind: 'range' as const, start: 2, end: 6 },
  };
  const onComment = vi.fn();
  await act(async () =>
    root.render(
      <ReviewSourceLane
        duration={10}
        time={0}
        selection={{ kind: 'point', time: 0 }}
        annotations={[note]}
        onSeek={vi.fn()}
        onSelect={vi.fn()}
        onComment={onComment}
      />
    )
  );
  const lane = host.querySelector<HTMLElement>('[data-ui="gallery.videoReview.sourceLane"]')!;
  const marker = lane.querySelector<HTMLButtonElement>('button')!;
  expect(Number.parseFloat(marker.style.top) + 16).toBeLessThanOrEqual(0);
  expect(marker.style.height).toBe('16px');
  expect(marker.style.left).toBe('20%');
  expect(marker.style.width).toBe('40%');
  expect(marker.title).toBe(note.text);
  await act(async () => marker.click());
  expect(onComment).toHaveBeenCalledExactlyOnceWith(note);
  expect(note.anchor).toEqual({ kind: 'range', start: 2, end: 6 });
});
