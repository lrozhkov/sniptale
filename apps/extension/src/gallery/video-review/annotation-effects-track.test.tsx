// @vitest-environment jsdom
import { ReviewTimelineResizeGuide } from './timeline-resize-guide';
import { act, Suspense, startTransition } from 'react';
import { ReviewPlaybackPresentationClockContext } from './playback-presentation-clock';
import { createReviewPlaybackPresentationClock } from './playback-presentation-clock.test-support';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ReviewAnnotationEffect } from '../../features/video/review/annotation-effects/types';
import { ReviewAnnotationEffectsTrack } from './annotation-effects-track';
import * as i18n from '../../platform/i18n';
import { createReviewAnnotationTextClip } from '../../features/video/review/annotation-effects/text-animation';
import { createTrackProjection } from './track-projection';

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
      <ReviewTimelineResizeGuide
        hover={null}
        viewport={{ current: null }}
        gutter={0}
        width={1000}
        duration={10}
      >
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
      </ReviewTimelineResizeGuide>
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
    expect(select).not.toHaveBeenCalled();
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
  expect(host.querySelector<HTMLElement>('[data-resizing]')?.style.left).toBe('500px');
  expect(lane.querySelector('[data-annotation-effect-guide]')).toBeNull();
  act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  pointer(block, 'pointerup', 500);
  expect(host.querySelector('[data-resizing]')).toBeNull();
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

it('keeps annotation presentation asleep for unrelated seek time and fresh command receivers', () => {
  const instances = [item('first')];
  const snapshots: Parameters<typeof ReviewAnnotationEffectsTrack>[0]['snapshots'] = [];
  const first = vi.fn();
  const latest = vi.fn();
  const place = vi.fn();
  const calls = vi.spyOn(i18n, 'translate');
  render({ instances, snapshots, drawing: true, time: 1, onSelect: first, onPlace: place });
  const initial = calls.mock.calls.filter(
    ([key]) => key === 'gallery.videoReview.annotationEffects'
  ).length;
  const lane = render({
    instances,
    snapshots,
    drawing: true,
    time: 7,
    snapTimes: [8],
    onSelect: latest,
    onPlace: place,
  });
  expect
    .soft(calls.mock.calls.filter(([key]) => key === 'gallery.videoReview.annotationEffects'))
    .toHaveLength(initial);
  act(() => lane.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
  expect(place).toHaveBeenLastCalledWith({ start: 7 }, lane);
  act(() =>
    lane
      .querySelector('[data-annotation-effect-id]')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  );
  expect(latest).toHaveBeenCalledWith('first');
  expect(first).not.toHaveBeenCalled();
});

it('uses the live gesture clock and rejects receivers from an abandoned annotation render', async () => {
  const clock = createReviewPlaybackPresentationClock(() => false);
  clock.publish(1);
  const committed = vi.fn();
  const abandoned = vi.fn();
  const latestPlace = vi.fn();
  const attempted = vi.fn();
  const instances = [item('first')];
  const snapshots: Parameters<typeof ReviewAnnotationEffectsTrack>[0]['snapshots'] = [];
  const pending = new Promise<void>(() => {});
  function Wait({ suspend }: { suspend: boolean }) {
    if (suspend) {
      attempted();
      throw pending;
    }
    return null;
  }
  const view = (place: typeof committed, suspend: boolean, busy = false) => (
    <ReviewPlaybackPresentationClockContext value={clock}>
      <Suspense fallback={<span data-pending-annotation />}>
        <ReviewAnnotationEffectsTrack
          instances={instances}
          snapshots={snapshots}
          duration={10}
          time={0}
          enabled
          busy={busy}
          drawing
          selectedId="first"
          snapTimes={[]}
          onEnabled={enabled}
          onSelect={select}
          onBegin={begin}
          onPreview={preview}
          onCommit={commit}
          onCancel={cancel}
          onPlace={place}
        />
        <Wait suspend={suspend} />
      </Suspense>
    </ReviewPlaybackPresentationClockContext>
  );
  await act(async () => root.render(view(committed, false)));
  const lane = host.querySelector('[data-ui="gallery.videoReview.annotationEffectsLane"]')!;
  clock.publish(7);
  act(() => lane.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
  expect(committed).toHaveBeenLastCalledWith({ start: 7 }, lane);
  await act(async () => {
    startTransition(() => root.render(view(abandoned, true)));
  });
  expect(attempted).toHaveBeenCalled();
  expect(host.querySelector('[data-pending-annotation]')).toBeNull();
  clock.publish(8);
  act(() => lane.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
  expect(committed).toHaveBeenLastCalledWith({ start: 8 }, lane);
  expect(abandoned).not.toHaveBeenCalled();
  await act(async () => root.render(view(latestPlace, false)));
  act(() => lane.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
  expect(latestPlace).toHaveBeenCalledExactlyOnceWith({ start: 8 }, lane);
  await act(async () => root.render(view(latestPlace, false, true)));
  act(() => lane.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
  expect(latestPlace).toHaveBeenCalledOnce();
});

it('moves a native text clip to the end across a Speed edge on the result clock', () => {
  const projection = createTrackProjection(12, [
    {
      id: 'speed',
      kind: 'speed',
      start: 0,
      end: 6,
      requestedStart: 0,
      requestedEnd: 6,
      rate: 2,
      audio: 'mute',
    },
  ]);
  const title = createReviewAnnotationTextClip('title', 'Title', 1, 3, 0);
  const options = { duration: 12, projection, textClips: [title], instances: [] };
  const lane = render(options);
  const plate = lane.querySelector<HTMLElement>('[data-annotation-effect-id="title"]')!;
  pointer(plate, 'pointerdown', 200);
  pointer(plate, 'pointermove', 200 + 8000 / 12, true);
  expect(preview).toHaveBeenLastCalledWith({ start: 7, end: 9 });
  const range = { left: plate.style.left, width: plate.style.width };
  pointer(plate, 'pointerup', 200 + 8000 / 12, true);
  expect(preview).toHaveBeenLastCalledWith({ start: 7, end: 9 });
  expect(commit).toHaveBeenCalledOnce();
  const published = render({ ...options, textClips: [{ ...title, start: 7, end: 9 }] });
  const end = published.querySelector<HTMLElement>('[data-annotation-effect-id="title"]')!;
  expect({ left: end.style.left, width: end.style.width }).toEqual(range);
});

it('snaps native text across a CUT gap to the actual plate edge without changing its duration', () => {
  const projection = createTrackProjection(12, [
    {
      id: 'cut',
      kind: 'cut',
      start: 2,
      end: 4,
      requestedStart: 2,
      requestedEnd: 4,
    },
  ]);
  const title = createReviewAnnotationTextClip('title', 'Title', 1, 3, 0);
  const options = {
    duration: 12,
    projection,
    textClips: [title],
    instances: [],
    snapTimes: [6],
    time: 11,
  };
  const lane = render(options);
  const plate = lane.querySelector<HTMLElement>('[data-annotation-effect-id="title"]')!;
  pointer(plate, 'pointerdown', 100);
  pointer(plate, 'pointermove', 100 + (4.95 / 12) * 1000);
  expect(preview).toHaveBeenLastCalledWith({ start: 4, end: 6 });
  const guide = lane.querySelector<HTMLElement>('[data-annotation-effect-guide]');
  expect(guide?.style.left).toBe(plate.style.left);
  const range = { left: plate.style.left, width: plate.style.width };
  pointer(plate, 'pointerup', 100 + (4.95 / 12) * 1000);
  expect(commit).toHaveBeenCalledOnce();
  const published = render({ ...options, textClips: [{ ...title, start: 4, end: 6 }] });
  const final = published.querySelector<HTMLElement>('[data-annotation-effect-id="title"]')!;
  expect({ left: final.style.left, width: final.style.width }).toEqual(range);
});

it('moves a title right after a cut shortened the visible result without trimming the authored tail', () => {
  const projection = createTrackProjection(6, [
    {
      id: 'cut',
      kind: 'cut',
      start: 0,
      end: 3,
      requestedStart: 0,
      requestedEnd: 3,
    },
  ]);
  const title = createReviewAnnotationTextClip('title', 'Title', 1, 4, 0);
  const lane = render({
    duration: 6,
    projection,
    textClips: [title],
    instances: [],
    time: 0,
    snapTimes: [],
  });
  const plate = lane.querySelector<HTMLElement>('[data-annotation-effect-id="title"]')!;
  pointer(plate, 'pointerdown', 700);
  pointer(plate, 'pointermove', 700 + 250 / 6);
  pointer(plate, 'pointerup', 700 + 250 / 6);
  const moved = preview.mock.lastCall?.[0];
  expect(moved?.start).toBeCloseTo(1.25);
  expect(moved?.end).toBeCloseTo(4.25);
  expect(commit).toHaveBeenCalledOnce();
});

it('clears the local title plate preview on late admission and shows the authored plate after Undo', () => {
  let admission: (() => void) | undefined;
  const projection = createTrackProjection(10, []);
  const title = createReviewAnnotationTextClip('title', 'Title', 1, 3, 0);
  const options = {
    projection,
    textClips: [title],
    instances: [],
    beforeAction: (action: () => void) => {
      admission = action;
    },
  };
  const lane = render(options);
  const plate = lane.querySelector<HTMLElement>('[data-annotation-effect-id="title"]')!;
  pointer(plate, 'pointerdown', 100);
  pointer(plate, 'pointermove', 200, true);
  expect(plate.style.left).toBe('20%');
  pointer(plate, 'pointerup', 200, true);
  act(() => admission?.());
  expect(commit).toHaveBeenCalledOnce();
  expect(plate.style.left).toBe('10%');
  render({ ...options, textClips: [{ ...title, start: 2, end: 4 }] });
  expect(plate.style.left).toBe('20%');
  render(options);
  expect(plate.style.left).toBe('10%');
});
