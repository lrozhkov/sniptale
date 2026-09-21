// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useReviewZoomEditor } from './zoom-editor';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
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
