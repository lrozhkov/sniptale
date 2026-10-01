// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { createContentDrawingController } from './controller';
import { DrawingSurface } from './surface';
import { drawDrawingFrame } from './frame';
import { createRecordingDrawingOwner } from '../overlay/toolbar/video-recording/drawing-session';
import { createPagePreparationDrawingSession } from './history';

vi.mock('./frame', () => ({ drawDrawingFrame: vi.fn() }));
vi.mock('../platform/dom-host', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../platform/dom-host')>()),
  toggleContentHostClass: vi.fn(),
}));
afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function setup(
  tool: 'pencil' | 'marker' | 'arrow',
  mode: 'preparation' | 'recording' = 'preparation'
) {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const frames = new Map<number, FrameRequestCallback>();
  let nextFrame = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++nextFrame, callback);
    return nextFrame;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    frames.delete(id);
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  Object.defineProperty(HTMLCanvasElement.prototype, 'setPointerCapture', {
    configurable: true,
    value: vi.fn(),
  });
  const owner = mode === 'recording' ? createRecordingDrawingOwner() : null;
  const controller =
    owner?.controller ??
    createContentDrawingController(
      createPagePreparationDrawingSession({
        commitEntry: () => true,
        subscribeToClear: () => () => {},
      })
    );
  const session = controller.session;
  session.setActiveTool(tool);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const render = (active = true, chromeHidden = false) =>
    act(() =>
      root.render(
        <DrawingSurface
          active={active}
          chromeHidden={chromeHidden}
          controller={controller}
          {...(owner
            ? {
                escapeImmediately: true,
                showSelectionChrome: false,
                visualEffects: {
                  getOpacity: owner.getVisualOpacity,
                  getRevision: owner.getVisualRevision,
                  subscribe: owner.subscribeVisualChanges,
                },
              }
            : {})}
        />
      )
    );
  render();
  const canvas = host.querySelector('canvas')!;
  const flush = () =>
    act(() => {
      const pending = [...frames];
      frames.clear();
      pending.forEach(([, callback]) => callback(0));
    });
  const send = (
    type: string,
    x: number,
    y: number,
    shiftKey = false,
    emptyCoalesced = false,
    coalesced?: MouseEvent[]
  ) =>
    act(() => {
      const event = new MouseEvent(type, {
        bubbles: true,
        button: 0,
        clientX: x,
        clientY: y,
        shiftKey,
      });
      Object.defineProperties(event, {
        pointerId: { value: 1 },
        pointerType: { value: 'mouse' },
        ...(emptyCoalesced || coalesced
          ? { getCoalescedEvents: { value: () => coalesced ?? [] } }
          : {}),
      });
      canvas.dispatchEvent(event);
    });
  return {
    canvas,
    controller,
    session,
    owner,
    frames,
    flush,
    send,
    render,
    unmount: () => {
      act(() => root.unmount());
      owner?.dispose();
      if (!owner) session.dispose();
    },
  };
}

it.each(['pencil', 'marker'] as const)(
  'retains a scheduled frame through rapid %s updates and paints the latest draft',
  (tool) => {
    const fixture = setup(tool);
    fixture.flush();
    fixture.send('pointerdown', 40, 100);
    const pendingFrame = [...fixture.frames.keys()][0];
    for (let index = 1; index <= 100; index++)
      fixture.send('pointermove', 40 + index * 4, 100 + index);
    expect([...fixture.frames.keys()]).toEqual([pendingFrame]);
    fixture.flush();
    const live = vi
      .mocked(drawDrawingFrame)
      .mock.calls.filter(([args]) => args.canvas === fixture.canvas)
      .at(-1)![0].draft;
    expect(live).toMatchObject({ kind: 'create', object: { kind: tool } });
    if (live?.kind !== 'create' || (live.object.kind !== 'pencil' && live.object.kind !== 'marker'))
      throw new Error('Missing stroke');
    expect(live.object.samples.at(-1)).toMatchObject({ x: 440, y: 200 });
    fixture.send('pointerup', 440, 200);
    fixture.flush();
    expect(fixture.session.getSnapshot().document.objects[0]).toEqual(live.object);
    fixture.send('pointermove', 900, 500);
    fixture.flush();
    expect(fixture.session.getSnapshot().document.objects[0]).toEqual(live.object);
    fixture.send('pointerdown', 100, 300);
    fixture.send('pointermove', 200, 350);
    fixture.send('pointercancel', 200, 350);
    fixture.flush();
    expect(fixture.session.getSnapshot().document.objects).toHaveLength(1);
    fixture.send('pointerdown', 100, 400);
    fixture.send('pointermove', 300, 450);
    fixture.send('pointerup', 300, 450);
    fixture.flush();
    expect(fixture.session.getSnapshot().document.objects).toHaveLength(2);
    fixture.send('pointerdown', 50, 500);
    fixture.unmount();
    expect(fixture.frames.size).toBe(0);
  }
);

it.each(['pencil', 'marker'] as const)(
  'uses the native %s sample when a browser returns an empty coalesced batch',
  (tool) => {
    const fixture = setup(tool);
    fixture.send('pointerdown', 40, 100);
    fixture.send('pointermove', 180, 140, false, true);
    fixture.send('pointerup', 180, 140);
    fixture.flush();
    const object = fixture.session.getSnapshot().document.objects[0];
    expect(object).toMatchObject({
      kind: tool,
      samples: expect.arrayContaining([expect.objectContaining({ x: 180, y: 140 })]),
    });
    fixture.unmount();
  }
);

it('creates free arrows and applies Shift snapping only while it is held within one gesture', () => {
  const fixture = setup('arrow');
  fixture.flush();
  fixture.send('pointerdown', 40, 100);
  fixture.send('pointermove', 200, 108);
  fixture.flush();
  const current = () =>
    vi
      .mocked(drawDrawingFrame)
      .mock.calls.filter(([args]) => args.canvas === fixture.canvas)
      .at(-1)![0].draft;
  expect(current()).toMatchObject({ object: { end: { x: 200, y: 108 } } });
  fixture.send('pointermove', 200, 108, true);
  fixture.flush();
  expect(current()).toMatchObject({ object: { end: { y: 100 } } });
  fixture.send('pointermove', 200, 108, false);
  fixture.flush();
  expect(current()).toMatchObject({ object: { end: { x: 200, y: 108 } } });
  fixture.send('pointerup', 200, 108);
  fixture.flush();
  expect(fixture.session.getSnapshot().document.objects[0]).toMatchObject({
    start: { x: 40, y: 100 },
    end: { x: 200, y: 108 },
  });
  fixture.unmount();
});

it('uses the current arrow endpoint instead of stale coalesced samples', () => {
  const fixture = setup('arrow');
  fixture.send('pointerdown', 40, 100);
  fixture.send('pointermove', 200, 120, false, false, [
    new MouseEvent('pointermove', { clientX: 150, clientY: 160 }),
  ]);
  fixture.send('pointerup', 200, 120);
  fixture.flush();
  expect(fixture.session.getSnapshot().document.objects[0]).toMatchObject({
    end: { x: 200, y: 120 },
  });
  fixture.unmount();
});

it.each(['preparation', 'recording'] as const)(
  'the pending %s frame reads commit, cancel, finalizer, and chrome state',
  (mode) => {
    const fixture = setup('pencil', mode);
    fixture.flush();
    const latest = () =>
      vi
        .mocked(drawDrawingFrame)
        .mock.calls.filter(([args]) => args.canvas === fixture.canvas)
        .at(-1)![0];
    fixture.send('pointerdown', 50, 200);
    fixture.send('pointermove', 300, 240);
    fixture.send('pointerup', 300, 240);
    fixture.flush();
    expect(latest().draft).toBeNull();
    expect(latest().objects).toHaveLength(1);
    fixture.send('pointerdown', 50, 300);
    fixture.send('pointermove', 300, 340);
    fixture.send('pointercancel', 300, 340);
    fixture.flush();
    expect(latest().draft).toBeNull();
    expect(latest().objects).toHaveLength(1);
    fixture.send('pointerdown', 50, 400);
    fixture.send('pointermove', 300, 440);
    act(() => fixture.controller.finalizeInteraction());
    fixture.render(false, true);
    fixture.flush();
    expect(latest().draft).toBeNull();
    expect(latest().objects).toHaveLength(2);
    const chrome = vi
      .mocked(drawDrawingFrame)
      .mock.calls.filter(([args]) => args.canvas !== fixture.canvas)
      .at(-1)![0];
    expect(chrome.showChrome).toBe(false);
    expect(chrome.selectedIds).toEqual([]);
    fixture.render(true);
    fixture.send('pointerdown', 60, 500);
    fixture.send('pointermove', 350, 540);
    fixture.send('pointerup', 350, 540);
    fixture.flush();
    expect(latest().objects).toHaveLength(3);
    fixture.unmount();
  }
);

it('redraws recording fade and expiry without pointer movement', () => {
  vi.useFakeTimers();
  const fixture = setup('marker', 'recording');
  fixture.flush();
  fixture.owner!.setAutoHideDelay(3);
  fixture.owner!.setClockRunning(true);
  fixture.send('pointerdown', 50, 300);
  fixture.send('pointermove', 300, 350);
  fixture.send('pointerup', 300, 350);
  fixture.flush();
  const object = fixture.session.getSnapshot().document.objects[0]!;
  act(() => vi.advanceTimersByTime(2800));
  expect(fixture.frames.size).toBe(1);
  fixture.flush();
  const latest = () =>
    vi
      .mocked(drawDrawingFrame)
      .mock.calls.filter(([args]) => args.canvas === fixture.canvas)
      .at(-1)![0];
  expect(latest().getObjectOpacity?.(object.id)).toBeCloseTo(2 / 3);
  act(() => vi.advanceTimersByTime(200));
  fixture.flush();
  expect(latest().objects).toHaveLength(0);
  fixture.unmount();
  vi.useRealTimers();
});
