// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useReviewZoomEditor } from './zoom-editor';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
import { reconcileReviewFocus, projectReviewFocus } from '../../features/video/review/focus-edits';
import { buildReviewTimeMap } from '../../features/video/review/timeline';
import type {
  QuickEditZoomRegion,
  QuickEditZoomState,
} from '../../features/video/review/advanced/types';

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

const region = (id: string, start: number, end: number): QuickEditZoomRegion => ({
  id,
  start,
  end,
  transform: { scale: 1.5, centerX: 0.5, centerY: 0.5 },
  enter: { type: 'ease-in-out', duration: 0.3 },
  exit: { type: 'ease-in-out', duration: 0.3 },
});

function apply(setZoom: ReturnType<typeof vi.fn>, zoom: QuickEditZoomState) {
  const update = setZoom.mock.lastCall?.[0] as (zoom: QuickEditZoomState) => QuickEditZoomState;
  return update(zoom);
}

it('creates the default focus with two source seconds under video Speed', () => {
  const setZoom = vi.fn();
  const map = buildReviewTimeMap(20, [
    {
      id: 's',
      kind: 'speed',
      start: 2,
      end: 8,
      requestedStart: 2,
      requestedEnd: 8,
      rate: 2,
      audio: 'speed',
    },
  ]);
  let editor!: ReturnType<typeof useReviewZoomEditor>;
  function Harness() {
    editor = useReviewZoomEditor({
      setZoom,
      zoom: { enabled: true, regions: [] },
      timelineDuration: 17,
      timeMap: map,
    });
    return null;
  }
  act(() => root.render(<Harness />));
  act(() => editor.add(3, 17));
  expect(apply(setZoom, { enabled: true, regions: [] }).regions[0]).toMatchObject({
    start: 3,
    end: 4,
    sourceAnchor: { start: 4, end: 6 },
  });
});

it('owns region selection, updates, and the stage focus overlay through one hook', async () => {
  const setZoom = vi.fn((_update: (zoom: QuickEditZoomState) => QuickEditZoomState) => undefined);
  const ref = { current: null as ReturnType<typeof useReviewZoomEditor> | null };
  function Harness() {
    ref.current = useReviewZoomEditor({
      setZoom: setZoom as (update: (zoom: QuickEditZoomState) => QuickEditZoomState) => void,
      zoom: { ...createQuickEditAdvancedState().zoom },
      timelineDuration: 10,
    });
    return null;
  }
  act(() => root.render(<Harness />));
  if (!ref.current) throw new Error('Editor hook did not mount.');
  const current = () => {
    if (!ref.current) throw new Error('Editor hook did not mount.');
    return ref.current;
  };

  act(() => current().add(3, 10));
  const added = apply(setZoom, { ...createQuickEditAdvancedState().zoom });
  expect(added.enabled).toBe(true);
  expect(added.regions).toHaveLength(1);
  expect(added.regions[0]).toMatchObject({ start: 3, end: 5, transform: { scale: 1.5 } });
  expect(current().selection).toBe(added.regions[0]!.id);
  expect(current().selected(added)).toBe(added.regions[0]);

  act(() => current().resetPosition(added.regions[0]!.id));
  expect(apply(setZoom, added).regions[0]!.transform).toMatchObject({
    centerX: 0.5,
    centerY: 0.5,
  });

  act(() => current().change(added.regions[0]!.id, { scale: 2 }));
  expect(apply(setZoom, added).regions[0]!.transform.scale).toBe(2);

  act(() => current().commitDrag(added.regions[0]!.id, { start: 2, end: 5 }, 'move'));
  expect(apply(setZoom, added).regions[0]).toMatchObject({ start: 2, end: 4 });

  act(() => current().change(added.regions[0]!.id, { start: 2 }));
  expect(apply(setZoom, added).regions[0]!.start).toBe(2);

  act(() => current().change(added.regions[0]!.id, { end: 4 }));
  expect(apply(setZoom, added).regions[0]!.end).toBe(4);

  act(() => current().commitDrag(added.regions[0]!.id, { start: 1, end: 5 }, 'start'));
  expect(apply(setZoom, added).regions[0]!.start).toBe(1);

  act(() => current().remove(added.regions[0]!.id));
  expect(apply(setZoom, added).regions).toHaveLength(0);
  expect(current().selection).toBeNull();
});

it('keeps the selection when removing a different region', async () => {
  const setZoom = vi.fn((_update: (zoom: QuickEditZoomState) => QuickEditZoomState) => undefined);
  const ref = { current: null as ReturnType<typeof useReviewZoomEditor> | null };
  function Harness() {
    ref.current = useReviewZoomEditor({
      setZoom: setZoom as never,
      zoom: { ...createQuickEditAdvancedState().zoom },
      timelineDuration: 10,
    });
    return null;
  }
  act(() => root.render(<Harness />));
  if (!ref.current) throw new Error('Editor hook did not mount.');
  const current = () => {
    if (!ref.current) throw new Error('Editor hook did not mount.');
    return ref.current;
  };
  const zoomed: QuickEditZoomState = {
    enabled: true,
    regions: [region('a', 0, 2), region('b', 4, 6)],
  };
  act(() => current().setSelection('a'));
  act(() => current().remove('b'));
  expect(current().selection).toBe('a');
  expect(apply(setZoom, zoomed).regions).toHaveLength(1);
});

it('revives a dormant migrated region on a user edit and keeps invalid commits dormant', async () => {
  const setZoom = vi.fn((_update: (zoom: QuickEditZoomState) => QuickEditZoomState) => undefined);
  const ref = { current: null as ReturnType<typeof useReviewZoomEditor> | null };
  const dormant: QuickEditZoomState = {
    enabled: true,
    regions: [
      {
        id: 'z',
        start: 0.5,
        end: 1.5,
        transform: { scale: 1.5, centerX: 0.5, centerY: 0.5 },
        enter: { type: 'none', duration: 0 },
        exit: { type: 'none', duration: 0 },
        dormant: true,
      },
    ],
  };
  function Harness() {
    ref.current = useReviewZoomEditor({
      setZoom: setZoom as (update: (zoom: QuickEditZoomState) => QuickEditZoomState) => void,
      zoom: dormant,
      timelineDuration: 10,
    });
    return null;
  }
  act(() => root.render(<Harness />));
  const current = () => {
    if (!ref.current) throw new Error('Editor hook did not mount.');
    return ref.current;
  };
  act(() => current().change('z', { scale: 3 }));
  const revived = apply(setZoom, dormant);
  expect(revived.regions[0]).toMatchObject({ dormant: false, transform: { scale: 3 } });
  // A dormant region no longer blocks insertion at its stored coordinates.
  act(() => current().add(1, 10));
  const after = apply(setZoom, revived);
  expect(after.regions).toHaveLength(2);
  expect(after.regions[1]).toMatchObject({ start: 1, end: 3 });
});

it('keeps a dormant region dormant when its stored interval collides with an active one', async () => {
  const setZoom = vi.fn((_update: (zoom: QuickEditZoomState) => QuickEditZoomState) => undefined);
  const ref = { current: null as ReturnType<typeof useReviewZoomEditor> | null };
  const mixed: QuickEditZoomState = {
    enabled: true,
    regions: [
      {
        id: 'z',
        start: 0.5,
        end: 5.5,
        transform: { scale: 1.5, centerX: 0.5, centerY: 0.5 },
        enter: { type: 'none', duration: 0 },
        exit: { type: 'none', duration: 0 },
        dormant: true,
      },
      {
        id: 'a',
        start: 4,
        end: 6,
        transform: { scale: 1.5, centerX: 0.5, centerY: 0.5 },
        enter: { type: 'none', duration: 0 },
        exit: { type: 'none', duration: 0 },
      },
    ],
  };
  function Harness() {
    ref.current = useReviewZoomEditor({
      setZoom: setZoom as (update: (zoom: QuickEditZoomState) => QuickEditZoomState) => void,
      zoom: mixed,
      timelineDuration: 10,
    });
    return null;
  }
  act(() => root.render(<Harness />));
  const current = () => {
    if (!ref.current) throw new Error('Editor hook did not mount.');
    return ref.current;
  };
  // Inspector edit: revival refused, the stored dormant state stays untouched.
  act(() => current().change('z', { scale: 3 }));
  let result = apply(setZoom, mixed);
  expect(result.regions[0]).toMatchObject({ dormant: true, transform: { scale: 1.5 } });
  // Drag revival: the moved interval would overlap the active neighbor.
  act(() => current().commitDrag('z', { start: 1, end: 6 }, 'move'));
  result = apply(setZoom, mixed);
  expect(result.regions[0]).toMatchObject({ dormant: true, start: 0.5, end: 5.5 });
  // A fitting edit revives: trimming the dormant region out of the overlap.
  act(() => current().change('z', { end: 3.5 }));
  result = apply(setZoom, mixed);
  expect(result.regions[0]).toMatchObject({ dormant: false, start: 0.5, end: 3.5 });
  // The occupied-playhead fallback points at the active region, not the dormant one.
  act(() => current().add(5, 10));
  expect(current().selection).toBe('a');
});

it('refuses a zoom at EOF and selects the existing region when the playhead is occupied', async () => {
  const setZoom = vi.fn((_update: (zoom: QuickEditZoomState) => QuickEditZoomState) => undefined);
  const ref = { current: null as ReturnType<typeof useReviewZoomEditor> | null };
  const zoomRef = { current: { ...createQuickEditAdvancedState().zoom } };
  function Harness() {
    ref.current = useReviewZoomEditor({
      setZoom: setZoom as (update: (zoom: QuickEditZoomState) => QuickEditZoomState) => void,
      zoom: zoomRef.current,
      timelineDuration: 10,
    });
    return null;
  }
  act(() => root.render(<Harness />));
  const current = () => {
    if (!ref.current) throw new Error('Editor hook did not mount.');
    return ref.current;
  };
  let appliedCalls = 0;
  const applyZoom = () => {
    while (appliedCalls < setZoom.mock.calls.length) {
      const update = setZoom.mock.calls[appliedCalls]![0] as (
        zoom: QuickEditZoomState
      ) => QuickEditZoomState;
      zoomRef.current = update(zoomRef.current);
      appliedCalls += 1;
    }
    return zoomRef.current;
  };

  act(() => current().add(10, 10));
  expect(setZoom).not.toHaveBeenCalled();
  expect(current().selection).toBeNull();

  act(() => current().add(3, 10));
  const first = applyZoom();
  act(() => root.render(<Harness />));
  expect(first.regions).toHaveLength(1);
  const firstId = first.regions[0]!.id;
  act(() => current().add(3.5, 10));
  const second = applyZoom();
  expect(second.regions).toHaveLength(1);
  expect(current().selection).toBe(firstId);
});

it('shares a disposable framing draft without writing history and rejects stale selection drafts', () => {
  const setZoom = vi.fn();
  let zoom = { enabled: true, regions: [region('a', 0, 2), region('b', 4, 6)] };
  let selected = 'a';
  let editor: ReturnType<typeof useReviewZoomEditor>;
  function Harness() {
    editor = useReviewZoomEditor({ setZoom, zoom, timelineDuration: 10, selection: selected });
    return null;
  }
  act(() => root.render(<Harness />));
  act(() => editor.preview('a', { centerX: 0.7 }));
  expect(editor!.previewRegion(zoom.regions[0]!).transform.centerX).toBe(0.7);
  expect(zoom.regions[0]!.transform.centerX).toBe(0.5);
  expect(setZoom).not.toHaveBeenCalled();
  // Autosave acknowledgement reparses the same content while the pointer is still held.
  zoom = structuredClone(zoom);
  act(() => root.render(<Harness />));
  expect(editor!.previewRegion(zoom.regions[0]!).transform.centerX).toBe(0.7);
  act(() => editor.preview('a', null));
  expect(editor!.previewRegion(zoom.regions[0]!)).toBe(zoom.regions[0]);
  act(() => editor.preview('a', { centerX: 0.8 }));
  selected = 'b';
  act(() => root.render(<Harness />));
  selected = 'a';
  act(() => root.render(<Harness />));
  expect(editor!.previewRegion(zoom.regions[0]!)).toBe(zoom.regions[0]);
  expect(setZoom).not.toHaveBeenCalled();
  act(() => editor.change('a', { centerX: 0.8 }));
  expect(setZoom).toHaveBeenCalledOnce();
  expect(apply(setZoom, zoom).regions[0]!.transform.centerX).toBe(0.8);
});

it('selects a contextual focus with its supplied geometry and refuses occupied intervals', () => {
  const zoom = { ...createQuickEditAdvancedState().zoom, regions: [region('occupied', 4, 6)] };
  const setZoom = vi.fn(),
    onSelectionChange = vi.fn();
  let editor!: ReturnType<typeof useReviewZoomEditor>;
  function Harness() {
    editor = useReviewZoomEditor({ zoom, setZoom, timelineDuration: 10, onSelectionChange });
    return null;
  }
  act(() => root.render(<Harness />));
  expect(editor.addRegion(region('blocked', 3, 5))).toBeNull();
  expect(editor.addRegion(region('out-of-bounds', 9, 11))).toBeNull();
  expect(setZoom).not.toHaveBeenCalled();
  const target = {
    ...region('from-action', 1, 3),
    transform: { scale: 2.5, centerX: 0.2, centerY: 0.3 },
  };
  act(() => {
    expect(editor.addRegion(target)).toEqual(expect.any(String));
  });
  const created = apply(setZoom, zoom).regions[0]!;
  expect(created).toMatchObject({ start: 1, end: 3, transform: target.transform });
  expect(created.id).not.toBe(target.id);
  expect(onSelectionChange).toHaveBeenCalledWith(created.id);
});

it('stores source geometry when creating and editing focus around an existing cut', () => {
  const timeMap = buildReviewTimeMap(8, [
    {
      id: 'cut',
      kind: 'cut',
      start: 2,
      end: 4,
      requestedStart: 2,
      requestedEnd: 4,
    },
  ]);
  let zoom = createQuickEditAdvancedState().zoom;
  let editor!: ReturnType<typeof useReviewZoomEditor>;
  function Harness() {
    editor = useReviewZoomEditor({
      zoom,
      timelineDuration: 6,
      timeMap,
      setZoom(update) {
        zoom = update(zoom);
      },
    });
    return null;
  }
  act(() => root.render(<Harness />));
  act(() => editor.add(1, 6));
  expect(zoom.regions[0]).toMatchObject({ start: 1, end: 2, sourceAnchor: { start: 1, end: 3 } });
  act(() => root.render(<Harness />));
  act(() => editor.change(zoom.regions[0]!.id, { end: 4 }));
  expect(zoom.regions[0]).toMatchObject({ start: 1, end: 4, sourceAnchor: { start: 1, end: 6 } });
});

it('commits authored source intent under a Cut and rejects stale source collisions', () => {
  const cut = {
    id: 'cut',
    kind: 'cut' as const,
    start: 3,
    end: 7,
    requestedStart: 3,
    requestedEnd: 7,
  };
  const zoom = {
    ...createQuickEditAdvancedState().zoom,
    regions: [
      { ...region('focus', 0, 2), sourceAnchor: { start: 0, end: 2 } },
      { ...region('neighbor', 4, 6), sourceAnchor: { start: 8, end: 10 } },
    ],
  };
  const setZoom = vi.fn();
  let editor!: ReturnType<typeof useReviewZoomEditor>;
  function Harness() {
    editor = useReviewZoomEditor({
      setZoom,
      zoom,
      timelineDuration: 6,
      timeMap: buildReviewTimeMap(10, [cut]),
    });
    return null;
  }
  act(() => root.render(<Harness />));
  act(() => editor.commitDrag('focus', { start: 0, end: 2 }, 'move', { start: 4, end: 6 }));
  const hidden = apply(setZoom, zoom);
  expect(hidden.regions[0]).toMatchObject({ start: 0, end: 2, sourceAnchor: { start: 4, end: 6 } });
  act(() => editor.commitDrag('focus', { start: 3, end: 4 }, 'move', { start: 6, end: 8 }));
  expect(apply(setZoom, hidden).regions[0]).toMatchObject({
    start: 3,
    end: 4,
    sourceAnchor: { start: 6, end: 8 },
  });
  for (const anchor of [
    { start: 7, end: 9 },
    { start: -1, end: 1 },
    { start: 9, end: 11 },
    { start: 4, end: 4 },
    { start: NaN, end: 5 },
  ]) {
    act(() => editor.commitDrag('focus', { start: 0, end: 2 }, 'move', anchor));
    expect(apply(setZoom, hidden)).toBe(hidden);
  }
});

it.each(
  (['start', 'end'] as const).flatMap((edge) =>
    (['source', 'result', 'inspector'] as const).map((method) => ({ edge, method }))
  )
)('contracts phases on the $edge edge through $method under Speed', ({ edge, method }) => {
  const original = {
    ...region('focus', 0, 5),
    sourceAnchor: { start: 0, end: 10 },
    enter: { type: 'linear' as const, duration: 4 },
    exit: { type: 'linear' as const, duration: 2 },
  };
  let zoom: QuickEditZoomState = { enabled: true, regions: [original] };
  const timeMap = buildReviewTimeMap(10, [
    {
      id: 'speed',
      kind: 'speed',
      start: 0,
      end: 10,
      requestedStart: 0,
      requestedEnd: 10,
      rate: 2,
      audio: 'speed',
    },
  ]);
  let editor!: ReturnType<typeof useReviewZoomEditor>;
  function Harness() {
    editor = useReviewZoomEditor({
      zoom,
      timeMap,
      timelineDuration: 5,
      setZoom(update) {
        zoom = update(zoom);
      },
    });
    return null;
  }
  act(() => root.render(<Harness />));
  const sourceAnchor = edge === 'start' ? { start: 7, end: 10 } : { start: 0, end: 3 };
  act(() => {
    const range = { start: sourceAnchor.start / 2, end: sourceAnchor.end / 2 };
    if (method === 'inspector') editor.change('focus', { [edge]: range[edge] });
    else editor.commitDrag('focus', range, edge, method === 'source' ? sourceAnchor : undefined);
  });
  expect(zoom.regions[0]).toMatchObject({
    sourceAnchor,
    enter: { duration: 2 },
    exit: { duration: 1 },
  });
  expect(original.enter.duration).toBe(4);
});

it.each([
  [{ scale: 3 }, { transform: { scale: 3 } }],
  [{ centerX: 0.7 }, { transform: { centerX: 0.7 } }],
  [{ centerY: 0.2 }, { transform: { centerY: 0.2 } }],
  [{ enter: { type: 'ease-in-out' as const, duration: 0.7 } }, { enter: { duration: 0.7 } }],
  [{ exit: { type: 'ease-in-out' as const, duration: 0.6 } }, { exit: { duration: 0.6 } }],
])(
  'commits property %j beside a cut-hidden region without changing source intent',
  (patch, expected) => {
    const cut = {
      id: 'cut',
      kind: 'cut' as const,
      start: 2,
      end: 6,
      requestedStart: 2,
      requestedEnd: 6,
    };
    const retained = reconcileReviewFocus({
      regions: [region('hidden', 2, 4), region('visible', 6, 8)],
      duration: 10,
      before: [],
      after: [cut],
      edit: cut,
      preserveUnderCuts: true,
    });
    const timeMap = buildReviewTimeMap(10, [cut]);
    expect(retained.map(({ start, end }) => ({ start, end }))).toEqual([
      { start: 2, end: 4 },
      { start: 2, end: 4 },
    ]);
    expect(projectReviewFocus(retained, timeMap).map(({ id }) => id)).toEqual(['visible']);
    let zoom = { enabled: true, regions: retained };
    let editor!: ReturnType<typeof useReviewZoomEditor>;
    function Harness() {
      editor = useReviewZoomEditor({
        zoom,
        timelineDuration: 6,
        timeMap,
        setZoom: (update) => {
          zoom = update(zoom);
        },
      });
      return null;
    }
    act(() => root.render(<Harness />));
    act(() => editor.change('visible', patch));
    expect(zoom.regions[1]).toMatchObject(expected);
    expect(zoom.regions[0]).toEqual(retained[0]);
    expect(zoom.regions.map(({ sourceAnchor, dormant }) => ({ sourceAnchor, dormant }))).toEqual(
      retained.map(({ sourceAnchor, dormant }) => ({ sourceAnchor, dormant }))
    );
    const restored = reconcileReviewFocus({
      regions: zoom.regions,
      duration: 10,
      before: [cut],
      after: [],
      edit: null,
      preserveUnderCuts: true,
    });
    expect(restored[1]).toMatchObject({ ...expected, start: 6, end: 8 });
    expect(restored[0]).toMatchObject({ start: 2, end: 4 });
  }
);
