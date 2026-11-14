// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { ReviewTimelineMagnets, useReviewTimelineSnap } from './timeline-magnets';
import { createTrackProjection } from './track-projection';
import { createReviewDisplayMap } from '../../features/video/review/timeline';

it('normalizes display endpoints once before source and display consumers select magnets', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const display = createReviewDisplayMap(12, [
    {
      id: 'hold',
      kind: 'freeze',
      start: 4,
      end: 4,
      requestedStart: 4,
      requestedEnd: 4,
      duration: 2,
      frameTime: 3.98,
      frameDuration: 0.04,
    },
  ]);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  let sourceResult: number | undefined, displayResult: number | undefined;
  function Consumers() {
    const source = useReviewTimelineSnap();
    const view = useReviewTimelineSnap({ output: display.sourceToDisplay });
    return (
      <div data-ui="gallery.videoReview.timePlane">
        <div
          data-testid="target"
          data-review-snap-domain="display"
          data-review-snap-start="10"
          data-review-snap-end="10"
        />
        <button
          data-testid="source"
          onPointerDown={() => {
            sourceResult = source(7.9, [], 0.2).time;
          }}
        >
          Source
        </button>
        <button
          data-testid="display"
          onPointerDown={() => {
            displayResult = view(9.9, [], 0.2).time;
          }}
        >
          Display
        </button>
      </div>
    );
  }
  try {
    act(() =>
      root.render(
        <ReviewTimelineMagnets sourceTime={display.displayToSource}>
          <Consumers />
        </ReviewTimelineMagnets>
      )
    );
    const target = host.querySelector('[data-testid="target"]')!;
    Object.defineProperty(target, 'getClientRects', { value: () => [new DOMRect(0, 0, 10, 20)] });
    for (const kind of ['source', 'display']) {
      const event = new MouseEvent('pointerdown', { bubbles: true, button: 0, clientY: 10 });
      Object.defineProperty(event, 'pointerId', { value: 1 });
      act(() => host.querySelector(`[data-testid="${kind}"]`)!.dispatchEvent(event));
    }
    expect(sourceResult).toBe(8);
    expect(displayResult).toBe(10);
  } finally {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});

it.each(['start', 'end'] as const)(
  'keeps the freeze %s edge distinct for display and result-time lanes',
  (edge) => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const edits = [
      { id: 'cut', kind: 'cut' as const, start: 0, end: 2, requestedStart: 0, requestedEnd: 2 },
      {
        id: 'hold',
        kind: 'freeze' as const,
        start: 4,
        end: 4,
        requestedStart: 4,
        requestedEnd: 4,
        duration: 2,
        frameTime: 3.98,
        frameDuration: 0.04,
      },
    ];
    const display = createReviewDisplayMap(12, edits);
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    let result: number | undefined;
    let resultTime: number | undefined;
    function Lane() {
      const outputSnap = useReviewTimelineSnap(createTrackProjection(12, edits));
      const snap = useReviewTimelineSnap({
        output: display.sourceToDisplay,
        fromDisplay: (time: number) => time,
      });
      return (
        <div data-ui="gallery.videoReview.timePlane">
          <div
            data-testid="freeze"
            data-review-snap-domain="display"
            data-review-snap-start="4"
            data-review-snap-end="6"
          />
          <button
            onPointerDown={() => {
              result = snap(edge === 'start' ? 3.9 : 5.9, [], 0.2).time;
            }}
          >
            Move
          </button>
          <button
            data-testid="output"
            onPointerDown={() => {
              resultTime = outputSnap(edge === 'start' ? 1.9 : 3.9, [], 0.2).time;
            }}
          >
            Move audio
          </button>
        </div>
      );
    }
    try {
      act(() =>
        root.render(
          <ReviewTimelineMagnets sourceTime={display.displayToSource}>
            <Lane />
          </ReviewTimelineMagnets>
        )
      );
      const target = host.querySelector<HTMLElement>('[data-testid="freeze"]')!;
      Object.defineProperty(target, 'getClientRects', { value: () => [new DOMRect(0, 0, 10, 20)] });
      const event = new MouseEvent('pointerdown', { bubbles: true, button: 0, clientY: 10 });
      Object.defineProperty(event, 'pointerId', { value: 1 });
      act(() => host.querySelector('button')!.dispatchEvent(event));
      expect(result).toBe(edge === 'start' ? 4 : 6);
      expect(target.dataset['reviewMagnetEdge']).toBe(edge);
      act(() => host.querySelector('[data-testid="output"]')!.dispatchEvent(event));
      expect(resultTime).toBe(edge === 'start' ? 2 : 4);
    } finally {
      act(() => root.unmount());
      host.remove();
      vi.unstubAllGlobals();
    }
  }
);

it('extends a freeze at EOF without clamping its duration to the old display length', async () => {
  const { snapReviewEditDrag } = await import('./timeline-edit-snap');
  const view = {
    id: 'hold',
    kind: 'freeze' as const,
    start: 10,
    end: 12,
    requestedStart: 10,
    requestedEnd: 10,
    duration: 2,
    frameTime: 9.98,
    frameDuration: 0.02,
  };
  expect(
    snapReviewEditDrag({
      edge: 'end',
      deltaPx: 100,
      widthPx: 1200,
      duration: 12,
      bypass: true,
      edits: [],
      boundaries: undefined,
      playhead: 10,
      current: view,
      keyframeMove: false,
    })
  ).toEqual({ start: 10, end: 13, guide: null });
});
