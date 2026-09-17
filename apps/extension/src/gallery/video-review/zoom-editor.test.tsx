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
      background: { enabled: false },
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

  const overlay = current().focusOverlay(added.regions[0]!);
  expect(overlay.camera).toEqual(added.regions[0]!.transform);
  overlay.onDrag({ x: 0.7, y: 0.2 });
  expect(apply(setZoom, added).regions[0]!.transform).toMatchObject({
    centerX: 0.7,
    centerY: 0.2,
  });

  act(() => current().resetPosition(added.regions[0]!.id));
  expect(apply(setZoom, added).regions[0]!.transform).toMatchObject({
    centerX: 0.5,
    centerY: 0.5,
  });

  act(() => current().change(added.regions[0]!.id, { scale: 2 }));
  expect(apply(setZoom, added).regions[0]!.transform.scale).toBe(2);

  act(() => current().commitDrag(added.regions[0]!.id, { start: 2, end: 5 }));
  expect(apply(setZoom, added).regions[0]).toMatchObject({ start: 2, end: 5 });

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
      background: { enabled: false },
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
