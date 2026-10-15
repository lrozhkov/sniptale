// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useReviewZoomEditor, withReviewFocusType } from './zoom-editor';
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

it('admits a spatial commit against latest state rather than the render that queued it', () => {
  const zoom = { enabled: true, regions: [region('a', 0, 2)] };
  const setZoom = vi.fn();
  let editor!: ReturnType<typeof useReviewZoomEditor>;
  function Harness() {
    editor = useReviewZoomEditor({ setZoom, zoom, timelineDuration: 10, selection: 'a' });
    return null;
  }
  act(() => root.render(<Harness />));
  const revision = editor.revision(zoom.regions[0]);
  act(() => editor.preview('a', { centerX: 0.7 }));
  act(() => editor.changeAtRevision('a', revision, { centerX: 0.7 }));
  expect(setZoom).toHaveBeenCalledOnce();
  expect(editor.previewRegion(zoom.regions[0]!)).toBe(zoom.regions[0]);
  // The external mutation lands after the gesture enqueues its updater.
  const latest = {
    ...zoom,
    regions: [{ ...zoom.regions[0]!, transform: { scale: 2, centerX: 0.4, centerY: 0.5 } }],
  };
  expect(apply(setZoom, latest)).toBe(latest);
  expect(latest.regions[0]!.transform).toEqual({ scale: 2, centerX: 0.4, centerY: 0.5 });
});

it.each(['missing', 'disabled', 'dormant', 'border', 'spotlight', 'source', 'motion'] as const)(
  'rejects a spatial commit after the latest target becomes %s without a state change',
  (replacement) => {
    const original = region('a', 0, 2);
    const zoom = { enabled: true, regions: [original] };
    const setZoom = vi.fn();
    let editor!: ReturnType<typeof useReviewZoomEditor>;
    function Harness() {
      editor = useReviewZoomEditor({ setZoom, zoom, timelineDuration: 10 });
      return null;
    }
    act(() => root.render(<Harness />));
    act(() => editor.changeAtRevision('a', editor.revision(original), { centerX: 0.7 }));
    let target = original;
    if (replacement === 'dormant') target = { ...original, dormant: true };
    if (replacement === 'border' || replacement === 'spotlight')
      target = withReviewFocusType(original, replacement);
    if (replacement === 'source') target = { ...original, sourceAnchor: { start: 3, end: 5 } };
    if (replacement === 'motion')
      target = { ...original, motionBlur: { enter: { enabled: true, strength: 0.5 } } };
    const latest = {
      enabled: replacement !== 'disabled',
      regions: replacement === 'missing' ? [] : [target],
    };
    expect(apply(setZoom, latest)).toBe(latest);
  }
);

it('keeps authored revisions through own previews and autosave while committing one effective change', () => {
  let zoom = { enabled: true, regions: [region('a', 0, 2)] };
  const setZoom = vi.fn();
  let editor!: ReturnType<typeof useReviewZoomEditor>;
  function Harness() {
    editor = useReviewZoomEditor({ setZoom, zoom, timelineDuration: 10, selection: 'a' });
    return null;
  }
  act(() => root.render(<Harness />));
  const revision = editor.revision(zoom.regions[0]);
  act(() => editor.preview('a', { centerX: 0.7 }));
  expect(editor.previewRegion(zoom.regions[0]!).transform.centerX).toBe(0.7);
  expect(editor.revision(zoom.regions[0])).toBe(revision);
  zoom = structuredClone(zoom);
  act(() => root.render(<Harness />));
  expect(editor.revision(zoom.regions[0])).toBe(revision);
  expect(setZoom).not.toHaveBeenCalled();
  act(() => editor.changeAtRevision('a', revision, { centerX: 0.7 }));
  const changed = apply(setZoom, zoom);
  expect(setZoom).toHaveBeenCalledOnce();
  expect(changed.regions[0]!.transform.centerX).toBe(0.7);
  expect(editor.previewRegion(zoom.regions[0]!)).toBe(zoom.regions[0]);
  expect(apply(setZoom, changed)).toBe(changed);
  act(() => editor.changeAtRevision('a', editor.revision(changed.regions[0]), { centerX: 0.7 }));
  expect(apply(setZoom, changed)).toBe(changed);
  const bounded = {
    ...changed,
    regions: [
      { ...changed.regions[0]!, transform: { ...changed.regions[0]!.transform, centerX: 1 } },
    ],
  };
  act(() => editor.changeAtRevision('a', editor.revision(bounded.regions[0]), { centerX: 2 }));
  expect(apply(setZoom, bounded)).toBe(bounded);
});
