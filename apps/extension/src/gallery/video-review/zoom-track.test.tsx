// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ReviewZoomTrack } from './zoom-track';
import type { QuickEditZoomRegion } from '../../features/video/review/advanced/types';
import type { ReviewEdit } from '../../features/video/review/types';
import { createTrackProjection } from './track-projection';

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

const locale = vi.hoisted(() => ({ value: 'en' as 'en' | 'ru' }));
vi.mock('../../platform/i18n/locale/hook', () => ({ useAppLocale: () => locale.value }));

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
    beforeAction?: Parameters<typeof ReviewZoomTrack>[0]['beforeAction'];
    edits?: ReviewEdit[];
    toOutputTime?: (source: number) => number | null;
    enabled?: boolean;
    onLink?: (id: string, targetId: string | null) => void;
    onSelectLink?: (id: string) => void;
    linkSelectedId?: string | null;
    projection?: ReturnType<typeof createTrackProjection>;
  }
) {
  act(() => {
    root.render(
      <ReviewZoomTrack
        beforeAction={overrides?.beforeAction}
        duration={10}
        {...(time === null ? { time: null } : { time })}
        regions={regions}
        edits={overrides?.edits ?? edits}
        boundaries={[0, 2, 4, 6, 8, 10]}
        toOutputTime={overrides?.toOutputTime ?? ((source: number) => source)}
        projection={overrides?.projection}
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

it('keeps result duration while projected width changes across a speed segment', async () => {
  const speed: ReviewEdit = {
    id: 'speed',
    kind: 'speed',
    start: 2,
    end: 6,
    requestedStart: 2,
    requestedEnd: 6,
    rate: 2,
    audio: 'speed',
  };
  const projection = createTrackProjection(10, [speed]);
  const commit = vi.fn();
  const track = renderTrack([zoom('a', 0, 2)], commit, vi.fn(), null, {
    projection,
    toOutputTime: projection.output,
  });
  const block = track.blocks[0]!;
  Object.assign(block, {
    setPointerCapture: vi.fn(),
    hasPointerCapture: () => true,
    releasePointerCapture: vi.fn(),
  });
  expect(block.style.width).toBe('20%');
  await track.event(block, 'pointerdown', 0);
  await track.event(block, 'pointermove', 300, true);
  expect(Number.parseFloat(block.style.left)).toBeCloseTo(30);
  expect(Number.parseFloat(block.style.width)).toBeCloseTo(35);
  await track.event(block, 'pointerup', 300, true);
  expect(commit).toHaveBeenCalledWith('a', { start: 2.5, end: 4.5 }, 'move');
  renderTrack([zoom('a', 2.5, 4.5)], commit, vi.fn(), null, {
    projection,
    toOutputTime: projection.output,
  });
  expect(Number.parseFloat(track.blocks[0]!.style.width)).toBeCloseTo(35);
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
  expect(Number.parseFloat(first.style.width)).toBeCloseTo(20);
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

for (const width of [1000, 4000]) {
  for (const edge of ['start', 'end'] as const) {
    it(`clamps ${edge} through the opposite edge at timeline width ${width}`, async () => {
      const commit = vi.fn();
      const track = renderTrack([zoom('a', 2, 4)], commit);
      vi.mocked(track.lane.getBoundingClientRect).mockReturnValue(new DOMRect(0, 0, width, 32));
      const block = track.blocks[0]!;
      Object.assign(block, {
        setPointerCapture: vi.fn(),
        hasPointerCapture: () => true,
        releasePointerCapture: vi.fn(),
      });
      await track.event(
        block.querySelector(`[data-zoom-edge="${edge}"]`)!,
        'pointerdown',
        ((edge === 'start' ? 2 : 4) * width) / 10
      );
      await track.event(block, 'pointermove', edge === 'start' ? width : -width, true);
      expect((Number.parseFloat(block.style.width) * width) / 100).toBeCloseTo(24);
      expect(Number.parseFloat(block.style.left)).toBeCloseTo(
        edge === 'start' ? 40 - 2400 / width : 20
      );
      await track.event(block, 'pointerup', edge === 'start' ? width : -width, true);
      const range = commit.mock.calls[0]![1];
      expect(range.end - range.start).toBeCloseTo(240 / width);
      expect(edge === 'start' ? range.end : range.start).toBe(edge === 'start' ? 4 : 2);
      renderTrack([{ ...zoom('a', 2, 4), ...range }], commit);
      expect((Number.parseFloat(block.style.width) * width) / 100).toBeCloseTo(24);
    });
  }
}

it('keeps a cut-boundary fixed end and speed-projected minimum consistent with the preview', async () => {
  const sourceEdits: ReviewEdit[] = [
    {
      id: 'speed',
      kind: 'speed',
      start: 0,
      end: 4,
      requestedStart: 0,
      requestedEnd: 4,
      rate: 2,
      audio: 'speed',
    },
    { id: 'cut', kind: 'cut', start: 4, end: 5, requestedStart: 4, requestedEnd: 5 },
  ];
  const projection = createTrackProjection(10, sourceEdits);
  const commit = vi.fn();
  const track = renderTrack([zoom('a', 1, 2)], commit, vi.fn(), null, { projection });
  const block = track.blocks[0]!;
  Object.assign(block, {
    setPointerCapture: vi.fn(),
    hasPointerCapture: () => true,
    releasePointerCapture: vi.fn(),
  });
  await track.event(block.querySelector('[data-zoom-edge="start"]')!, 'pointerdown', 200);
  await track.event(block, 'pointermove', 900, true);
  expect(Number.parseFloat(block.style.width)).toBeCloseTo(2.4);
  expect(Number.parseFloat(block.style.left)).toBeCloseTo(37.6);
  await track.event(block, 'pointerup', 900, true);
  expect(commit).toHaveBeenCalledWith('a', { start: 1.88, end: 2 }, 'start');
  expect(projection.source(commit.mock.calls[0]![1].end, 'end')).toBe(4);
  expect(host.querySelector('[data-zoom-guide]')).toBeNull();
});

it('keeps focus selection and final range through delayed note admission', async () => {
  let admit!: () => void;
  const commit = vi.fn();
  const track = renderTrack([zoom('a', 2, 4)], commit, vi.fn(), null, {
    beforeAction: (action) => {
      admit = action;
    },
  });
  const block = track.blocks[0]!;
  Object.assign(block, {
    setPointerCapture: vi.fn(),
    hasPointerCapture: () => true,
    releasePointerCapture: vi.fn(),
  });
  await track.event(block, 'pointerdown', 200);
  await track.event(block, 'pointermove', 400);
  await track.event(block, 'pointerup', 400);
  expect(commit).not.toHaveBeenCalled();
  await act(async () => admit());
  expect(commit).toHaveBeenCalledExactlyOnceWith('a', { start: 4, end: 6 }, 'move');
});

it('formats timeline scale and tooltip with one localized decimal without mutating the region', () => {
  const region = zoom('fraction', 2, 4);
  region.transform.scale = 1.6666666667;
  for (const [language, expected] of [
    ['en', '1.7×'],
    ['ru', '1,7×'],
  ] as const) {
    locale.value = language;
    const view = renderTrack([region], vi.fn());
    expect(view.blocks[0]!.textContent).toContain(expected);
    expect(view.blocks[0]!.title).toContain(expected);
    expect(view.blocks[0]!.textContent).not.toContain('666666');
    expect(region.transform.scale).toBe(1.6666666667);
  }
  region.transform.scale = 2;
  const view = renderTrack([region], vi.fn());
  expect(view.blocks[0]!.title).toContain('2×');
  expect(view.blocks[0]!.title).not.toContain('2,0');
  locale.value = 'en';
});
