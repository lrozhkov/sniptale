// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ReviewAnnotationEffect } from '../../features/video/review/annotation-effects/types';
import { ReviewAnnotationEffectsTrack } from './annotation-effects-track';

let host: HTMLDivElement;
let root: Root;
const select = vi.fn();
const begin = vi.fn<() => boolean>();
const preview = vi.fn();
const commit = vi.fn();
const cancel = vi.fn();
const enabled = vi.fn();
const item = (id: string, start = 1, end = 4): ReviewAnnotationEffect => ({
  id,
  snapshotId: 'snapshot',
  enabled: true,
  start,
  end,
  attachment: 'content',
  transform: { x: 0.1, y: 0.1, width: 0.3, height: 0.2, rotation: 0 },
  controls: {},
  order: id === 'first' ? 0 : 1,
});

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  vi.clearAllMocks();
  begin.mockReturnValue(true);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function render(overrides: Partial<Parameters<typeof ReviewAnnotationEffectsTrack>[0]> = {}) {
  act(() =>
    root.render(
      <ReviewAnnotationEffectsTrack
        instances={[item('first'), item('second', 2, 3)]}
        snapshots={[]}
        duration={10}
        time={7}
        enabled={false}
        busy={false}
        selectedId="first"
        snapTimes={[5]}
        onEnabled={enabled}
        onSelect={select}
        onBegin={begin}
        onPreview={preview}
        onCommit={commit}
        onCancel={cancel}
        {...overrides}
      />
    )
  );
  const lane = host.querySelector<HTMLDivElement>(
    '[data-ui="gallery.videoReview.annotationEffectsLane"]'
  )!;
  vi.spyOn(lane, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 1000, 100));
  for (const block of [
    lane,
    ...lane.querySelectorAll<HTMLElement>('[data-annotation-effect-id]'),
  ]) {
    let captured = false;
    Object.assign(block, {
      setPointerCapture: () => {
        captured = true;
      },
      hasPointerCapture: () => captured,
      releasePointerCapture: () => {
        captured = false;
      },
    });
  }
  return lane;
}
function pointer(node: Element, type: string, x: number, altKey = false) {
  const event = new MouseEvent(type, { bubbles: true, clientX: x, button: 0, altKey });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  act(() => node.dispatchEvent(event));
}

it('places a default-duration click or explicit overlapping source range without entering history', () => {
  const place = vi.fn();
  const lane = render({ drawing: true, onPlace: place });
  pointer(lane, 'pointerdown', 250);
  pointer(lane, 'pointerup', 250);
  expect(place).toHaveBeenLastCalledWith({ start: 2.5 }, lane);
  pointer(lane, 'pointerdown', 600);
  pointer(lane, 'pointermove', 100);
  expect(lane.querySelector<HTMLElement>('[data-annotation-effect-placement]')?.style.width).toBe(
    '50%'
  );
  pointer(lane, 'pointerup', 100);
  expect(place).toHaveBeenLastCalledWith({ start: 1, end: 6 }, lane);
  expect(begin).not.toHaveBeenCalled();
  expect(preview).not.toHaveBeenCalled();
  expect(commit).not.toHaveBeenCalled();
  expect(select).not.toHaveBeenCalled();
});

it('draws with source-edge magnets and Alt bypass, clamping a final click within the source', () => {
  const place = vi.fn();
  const lane = render({ drawing: true, onPlace: place });
  pointer(lane, 'pointerdown', 100);
  pointer(lane, 'pointermove', 494);
  pointer(lane, 'pointerup', 494);
  expect(place).toHaveBeenLastCalledWith({ start: 1, end: 5 }, lane);
  pointer(lane, 'pointerdown', 100, true);
  pointer(lane, 'pointermove', 494, true);
  pointer(lane, 'pointerup', 494, true);
  expect(place).toHaveBeenLastCalledWith({ start: 1, end: 4.94 }, lane);
  pointer(lane, 'pointerdown', 1000);
  pointer(lane, 'pointerup', 1000);
  expect(place).toHaveBeenLastCalledWith({ start: 9.999 }, lane);
});

it.each(['body', 'start', 'end'])(
  'edits the existing %s instead of placing another annotation while Add is active',
  (target) => {
    const place = vi.fn();
    const lane = render({ drawing: true, onPlace: place });
    const plate = lane.querySelector<HTMLElement>('[data-annotation-effect-id]')!;
    const node =
      target === 'body' ? plate : plate.querySelector(`[data-annotation-effect-edge="${target}"]`)!;
    pointer(node, 'pointerdown', 200);
    pointer(plate, 'pointermove', 600);
    pointer(plate, 'pointerup', 600);
    expect(place).not.toHaveBeenCalled();
    expect(begin).toHaveBeenCalledWith('first');
    expect(preview).toHaveBeenCalled();
    expect(commit).toHaveBeenCalledOnce();
    expect(select).toHaveBeenCalledWith('first');
  }
);

it.each(['pointercancel', 'lostpointercapture', 'Escape', 'tool-change'] as const)(
  'cancels drawing on %s and suppresses late note admission',
  (reason) => {
    const place = vi.fn();
    let admitted: (() => void) | undefined;
    const props = {
      drawing: true,
      onPlace: place,
      beforeAction: (action: () => void) => {
        admitted = action;
      },
    };
    const lane = render(props);
    pointer(lane, 'pointerdown', 100);
    pointer(lane, 'pointermove', 500);
    if (reason === 'Escape') {
      pointer(lane, 'pointerup', 500);
      act(() =>
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      );
    } else if (reason === 'tool-change') render({ ...props, drawing: false });
    else pointer(lane, reason, 500);
    act(() => admitted?.());
    pointer(lane, 'pointerup', 500);
    expect(place).not.toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
  }
);

it('keyboard placement uses the playhead and busy placement is inert', () => {
  const place = vi.fn();
  const lane = render({ drawing: true, onPlace: place });
  act(() => lane.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
  expect(place).toHaveBeenCalledExactlyOnceWith({ start: 7 }, lane);
  render({ drawing: true, onPlace: place, busy: true });
  pointer(lane, 'pointerdown', 100);
  pointer(lane, 'pointerup', 100);
  act(() => lane.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
  expect(place).toHaveBeenCalledTimes(1);
});

it('packs overlap independently of order and retains disabled plates and stable drag rows', () => {
  const lane = render();
  const first = lane.querySelector<HTMLDivElement>('[data-annotation-effect-id="first"]')!;
  const second = lane.querySelector<HTMLDivElement>('[data-annotation-effect-id="second"]')!;
  expect(first.dataset['annotationEffectRow']).toBe('0');
  expect(first.querySelector('[data-label-part="value"]')?.textContent).toBe('3.0');
  expect(second.dataset['annotationEffectRow']).toBe('1');
  expect(
    host.querySelector('[data-review-track-muted]')?.getAttribute('data-review-track-muted')
  ).toBe('true');
  pointer(first, 'pointerdown', 100);
  pointer(first, 'pointermove', 500);
  expect(first.style.left).toBe('50%');
  expect(second.dataset['annotationEffectRow']).toBe('1');
  expect(commit).not.toHaveBeenCalled();
  pointer(first, 'pointerup', 500);
  expect(commit).toHaveBeenCalledTimes(1);
  expect(preview).toHaveBeenLastCalledWith({ start: 5, end: 8 });
});

it('snaps the moving end, preserves duration, and bypasses magnets with Alt', () => {
  const lane = render({ instances: [item('first')], time: 10 });
  const block = lane.querySelector('[data-annotation-effect-id]')!;
  pointer(block, 'pointerdown', 100);
  pointer(block, 'pointermove', 196);
  expect(preview).toHaveBeenLastCalledWith({ start: 2, end: 5 });
  pointer(block, 'pointermove', 196, true);
  expect(preview.mock.lastCall?.[0].start).toBeCloseTo(1.96);
  expect(lane.querySelector('[data-annotation-effect-guide]')).toBeNull();
  pointer(block, 'pointerup', 196);
});

it('trims through overlap and Escape cancels without committing', () => {
  const lane = render();
  const block = lane.querySelector('[data-annotation-effect-id="first"]')!;
  pointer(block.querySelector('[data-annotation-effect-edge="end"]')!, 'pointerdown', 400);
  pointer(block, 'pointermove', 500);
  expect(preview).toHaveBeenLastCalledWith({ start: 1, end: 5 });
  act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  pointer(block, 'pointerup', 500);
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(commit).not.toHaveBeenCalled();
});

it('joins a pointer-up held by note admission, while cancellation suppresses late admission', () => {
  let admission: (() => void) | undefined;
  const lane = render({
    beforeAction: (action) => {
      admission = action;
    },
  });
  const block = lane.querySelector('[data-annotation-effect-id="first"]')!;
  pointer(block, 'pointerdown', 100);
  pointer(block, 'pointermove', 200);
  pointer(block, 'pointerup', 200);
  expect(begin).not.toHaveBeenCalled();
  act(() => admission?.());
  expect(begin).toHaveBeenCalledTimes(1);
  expect(preview).toHaveBeenLastCalledWith({ start: 2, end: 5 });
  expect(commit).toHaveBeenCalledTimes(1);
  pointer(block, 'pointerdown', 100);
  act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  act(() => admission?.());
  expect(begin).toHaveBeenCalledTimes(1);
});

it('shares keyboard commits and lane toggles, and ignores disabled activation', () => {
  const lane = render();
  const block = lane.querySelector('[data-annotation-effect-id="first"]')!;
  act(() =>
    block.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true })
    )
  );
  expect(preview).toHaveBeenLastCalledWith({ start: 1, end: 4.1 });
  expect(commit).toHaveBeenCalledTimes(1);
  act(() => host.querySelector<HTMLButtonElement>('button')?.click());
  expect(enabled).toHaveBeenCalledWith(true);
  render({ busy: true });
  act(() =>
    block.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
  );
  pointer(block, 'pointerdown', 100);
  expect(commit).toHaveBeenCalledTimes(1);
});

it('unmount cancels note admission after pointer-up and cannot begin a stale gesture', async () => {
  let admission: (() => void) | undefined;
  const lane = render({
    beforeAction: (action) => {
      admission = action;
    },
  });
  const block = lane.querySelector('[data-annotation-effect-id="first"]')!;
  pointer(block, 'pointerdown', 100);
  pointer(block, 'pointermove', 200);
  pointer(block, 'pointerup', 200);
  await act(async () => root.render(null));
  act(() => admission?.());
  expect(begin).not.toHaveBeenCalled();
  expect(commit).not.toHaveBeenCalled();
  expect(cancel).toHaveBeenCalledTimes(1);
});

it.each(['pointercancel', 'lostpointercapture'])(
  '%s cancels a captured drag without committing',
  (type) => {
    const lane = render();
    const block = lane.querySelector('[data-annotation-effect-id="first"]')!;
    pointer(block, 'pointerdown', 100);
    pointer(block, 'pointermove', 200);
    pointer(block, type, 200);
    pointer(block, 'pointerup', 200);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(commit).not.toHaveBeenCalled();
  }
);

it('Escape cancels admission retained after pointer-up without later beginning or committing', () => {
  let admission: (() => void) | undefined;
  const lane = render({
    beforeAction: (action) => {
      admission = action;
    },
  });
  const block = lane.querySelector('[data-annotation-effect-id="first"]')!;
  pointer(block, 'pointerdown', 100);
  pointer(block, 'pointermove', 200);
  pointer(block, 'pointerup', 200);
  act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  act(() => admission?.());
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(begin).not.toHaveBeenCalled();
  expect(commit).not.toHaveBeenCalled();
});
