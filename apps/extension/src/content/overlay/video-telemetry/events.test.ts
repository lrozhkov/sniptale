// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { createRecordingEventSource } from './event-source';
import { createInitialState } from './state';
import { createTelemetryListeners, recordTelemetryPauseBoundary } from './events';

function trusted<T extends Event>(event: T): T {
  return new Proxy(event, {
    get(target, key) {
      if (key === 'isTrusted') return true;
      const value = Reflect.get(target, key);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}
function pointer(
  type: string,
  timeStamp: number,
  x: number,
  y: number,
  button = 0,
  target?: Element
) {
  const event = new MouseEvent(type, { detail: 1, clientX: x, clientY: y, button });
  Object.defineProperties(event, {
    timeStamp: { value: timeStamp },
    ...(target ? { target: { value: target } } : {}),
  });
  return trusted(event);
}
afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

it('records one trusted down/up fact and ignores script clicks and label forwarding', () => {
  const state = createInitialState();
  const button = document.createElement('button');
  button.setAttribute('aria-label', 'Export recording');
  const icon = document.createElement('span');
  button.append(icon);
  document.body.append(button);
  const listeners = createTelemetryListeners(state);
  listeners.pointerDown(pointer('pointerdown', 1000, 20, 30, 0, icon));
  listeners.pointerUp(pointer('pointerup', 1100, 22, 31, 0, icon));
  listeners.click(pointer('click', 1100, 22, 31, 0, icon));
  expect(state.actionEvents).toHaveLength(1);
  expect(state.actionEvents[0]).toMatchObject({
    kind: 'CLICK',
    point: { x: 20, y: 30 },
    preset: 'CLICK_RIPPLE',
    data: {
      targetName: 'Export recording',
      gestureType: 'click',
      downTime: 1,
      upTime: 1.1,
      completion: 'released',
      upX: 22,
      upY: 31,
    },
  });
  expect(state.actionEvents[0]?.data['pressDuration']).toBeCloseTo(0.1);
});

it('keeps Enter as a key action without synthetic coordinates', () => {
  const state = createInitialState();
  state.lastKnownPointerPosition = { x: 120, y: 80 };
  const listeners = createTelemetryListeners(state);
  listeners.keyDown(trusted(new KeyboardEvent('keydown', { key: 'Enter' })));
  listeners.click(new MouseEvent('click', { detail: 0 }));
  expect(state.actionEvents.map((event) => event.kind)).toEqual(['KEY']);
  expect(state.cursorTrack).toBeNull();
});

it('retains actual origin clicks and independent double-click presses', () => {
  const state = createInitialState();
  const listeners = createTelemetryListeners(state);
  for (const time of [1000, 1200]) {
    listeners.pointerDown(pointer('pointerdown', time, 0, 0));
    listeners.pointerUp(pointer('pointerup', time + 50, 0, 0));
  }
  expect(state.actionEvents).toHaveLength(2);
  expect(state.actionEvents.every((event) => event.point?.x === 0 && event.point.y === 0)).toBe(
    true
  );
});

it('rejects a script-dispatched click even when its detail claims a pointer action', () => {
  const state = createInitialState();
  createTelemetryListeners(state).click(
    new MouseEvent('click', { detail: 1, clientX: 20, clientY: 30 })
  );
  expect(state.actionEvents).toEqual([]);
  expect(state.cursorTrack).toBeNull();
});

it.each([0, 1, 2, 3, 4, 5])(
  'retains button %s physical edges exactly once through mouse/pointer duplicate delivery',
  (button) => {
    const state = createInitialState();
    const listeners = createTelemetryListeners(state);
    const down = pointer('pointerdown', 1000, 100, 100, button);
    const up = pointer('pointerup', 1700, 100, 100, button);
    listeners.pointerDown(down);
    listeners.mouseDown(down);
    listeners.pointerUp(up);
    listeners.mouseUp(up);
    listeners.click(up);
    expect(state.actionEvents).toHaveLength(1);
    expect(state.actionEvents[0]?.data).toMatchObject({
      button,
      gestureType: 'hold',
      pressDuration: 0.7,
      completion: 'released',
    });
  }
);

it.each([2, 6, 10, 12, 16])(
  'uses maximum excursion %s CSS px rather than path length or final position',
  (excursion) => {
    const state = createInitialState();
    const listeners = createTelemetryListeners(state);
    listeners.pointerDown(pointer('pointerdown', 1000, 100, 100));
    for (let i = 0; i < 20; i++)
      listeners.pointerMove(pointer('pointermove', 1010 + i, 100 + excursion, 100));
    listeners.pointerUp(pointer('pointerup', 1200, 100, 100));
    expect(state.actionEvents[0]?.data['gestureType']).toBe(excursion >= 12 ? 'drag' : 'click');
    expect(state.actionEvents[0]?.point).toEqual({ x: 100, y: 100 });
  }
);

it('does not manufacture release or dwell across a lost observation boundary', () => {
  const state = createInitialState();
  const listeners = createTelemetryListeners(state);
  listeners.pointerDown(pointer('pointerdown', 1000, 100, 100));
  vi.spyOn(performance, 'now').mockReturnValue(1300);
  listeners.blur();
  listeners.pointerUp(pointer('pointerup', 5000, 100, 100));
  expect(state.actionEvents[0]?.data).toMatchObject({ completion: 'lost' });
  expect(state.actionEvents[0]?.data).not.toHaveProperty('upTime');
  expect(
    state.cursorTrack?.samples.some((sample) => sample.observation === 'blur' && !sample.visible)
  ).toBe(true);
  expect(state.signals.filter((signal) => signal.kind === 'cursor-idle')).toEqual([]);
});

it.each(['blur', 'pause', 'outside'] as const)(
  'retains the last real pointer observation when %s occurs after silence',
  (boundary) => {
    const state = createInitialState();
    state.segmentStartedAtTimestamp = 0;
    const listeners = createTelemetryListeners(state);
    listeners.pointerDown(pointer('pointerdown', 1000, 100, 100));
    listeners.pointerMove(pointer('pointermove', 2000, 150, 100));
    vi.spyOn(performance, 'now').mockReturnValue(30000);
    if (boundary === 'blur') listeners.blur();
    else if (boundary === 'pause') recordTelemetryPauseBoundary(state);
    else listeners.pointerLeave(pointer('pointerout', 30000, 150, 100));
    expect(state.actionEvents[0]?.data).toMatchObject({ completion: 'lost', lastObservedTime: 2 });
    expect(state.actionEvents[0]?.data).not.toHaveProperty('upTime');
    expect(state.actionEvents[0]?.data).not.toHaveProperty('pressDuration');
  }
);

it('keeps native semantic completion after pointercancel without inventing physical up', () => {
  const state = createInitialState();
  const listeners = createTelemetryListeners(state);
  const source = document.createElement('div');
  listeners.pointerDown(pointer('pointerdown', 1000, 100, 100, 0, source));
  const drag = pointer('dragstart', 1200, 102, 100, 0, source) as DragEvent;
  listeners.dragStart(drag);
  listeners.pointerCancel(pointer('pointercancel', 1250, 102, 100));
  listeners.pointerLeave(pointer('pointerout', 1260, 102, 100));
  listeners.drop(drag);
  listeners.dragEnd(drag);
  expect(state.actionEvents[0]?.data).toMatchObject({
    gestureType: 'native-drag',
    completion: 'semantic',
    dropObserved: true,
  });
  expect(state.actionEvents[0]?.data).not.toHaveProperty('upTime');
});

it('records wheel input separately from observed scroll and keyboard context menus create no button', () => {
  const state = createInitialState();
  const listeners = createTelemetryListeners(state);
  listeners.wheel(trusted(new WheelEvent('wheel', { deltaY: 120, deltaMode: 1, ctrlKey: true })));
  listeners.scroll(trusted(new Event('scroll')));
  listeners.click(trusted(new MouseEvent('contextmenu', { detail: 0 })));
  expect(state.actionEvents.map((event) => event.data['eventType'])).toEqual(['wheel', 'scroll']);
  expect(state.actionEvents[0]?.data).toMatchObject({ deltaY: 120, deltaMode: 1, ctrlKey: true });
});

it('keeps a pointer gesture observed when only a page control loses focus', () => {
  const state = createInitialState();
  const listeners = createTelemetryListeners(state);
  listeners.pointerDown(pointer('pointerdown', 1000, 100, 100));
  const blur = new FocusEvent('blur');
  Object.defineProperty(blur, 'target', { value: document.createElement('button') });
  // Browser window capture receives element blur too; only the Window target loses pointer coverage.
  Reflect.apply(listeners.blur, null, [blur]);
  listeners.pointerMove(pointer('pointermove', 1100, 160, 100));
  listeners.pointerUp(pointer('pointerup', 1200, 160, 100));
  expect(state.actionEvents[0]?.data).toMatchObject({
    gestureType: 'drag',
    completion: 'released',
    upTime: 1.2,
  });
});

it('pairs a button chord independently and retains the physical timing of each button', () => {
  const state = createInitialState();
  const listeners = createTelemetryListeners(state);
  listeners.pointerDown(pointer('pointerdown', 1000, 100, 100, 0));
  listeners.mouseDown(pointer('mousedown', 1100, 100, 100, 2));
  listeners.mouseUp(pointer('mouseup', 1300, 100, 100, 2));
  listeners.pointerUp(pointer('pointerup', 1500, 100, 100, 0));
  expect(
    state.actionEvents.map((action) => [
      action.data['button'],
      action.data['downTime'],
      action.data['upTime'],
    ])
  ).toEqual([
    [0, 1, 1.5],
    [2, 1.1, 1.3],
  ]);
});

it('does not finish a native drag after pause when the pointer was already outside', () => {
  const state = createInitialState();
  const listeners = createTelemetryListeners(state);
  const source = document.createElement('div');
  listeners.pointerDown(pointer('pointerdown', 1000, 100, 100, 0, source));
  listeners.dragStart(pointer('dragstart', 1100, 100, 100, 0, source) as DragEvent);
  listeners.pointerCancel(pointer('pointercancel', 1200, 100, 100, 0, source));
  vi.spyOn(performance, 'now').mockReturnValue(1300);
  listeners.pointerLeave(pointer('pointerout', 1300, 100, 100, 0, source));
  expect(state.gestures.size).toBe(1);
  vi.spyOn(performance, 'now').mockReturnValue(1400);
  recordTelemetryPauseBoundary(state);
  listeners.dragEnd(pointer('dragend', 2000, 100, 100, 0, source) as DragEvent);
  expect(state.gestures.size).toBe(0);
  expect(state.actionEvents[0]?.data['completion']).toBe('lost');
  expect(state.actionEvents[0]?.data).not.toHaveProperty('semanticEndTime');
});

it('measures physical press duration from raw document edges independently of media-offset refinement', () => {
  const state = createInitialState();
  state.segmentStartedAtTimestamp = 1000;
  const listeners = createTelemetryListeners(state);
  listeners.pointerDown(pointer('pointerdown', 1000, 20, 30));
  state.segmentStartedAtTimestamp = 1050;
  listeners.pointerUp(pointer('pointerup', 1100, 20, 30));
  expect(state.actionEvents[0]?.data['pressDuration']).toBeCloseTo(0.1);
});
it('does not manufacture a zero-time click from an event before the admitted recording boundary', () => {
  const state = createInitialState();
  state.segmentStartedAtTimestamp = 2000;
  const listeners = createTelemetryListeners(state);
  listeners.pointerDown(pointer('pointerdown', 1000, 20, 30));
  listeners.pointerUp(pointer('pointerup', 1100, 20, 30));
  expect(state.actionEvents).toHaveLength(0);
});

function streamedPointer() {
  const state = createInitialState();
  state.segmentStartedAtTimestamp = 0;
  const packets: import('../../../contracts/video/event-observations').RecordingEventObservationPacket[] =
    [];
  state.eventSource = createRecordingEventSource({
    recordingId: 'recording',
    project: (moment) => ({
      activeTimeUs: Math.round(moment.observationTimeSeconds * 1000000),
      clockRevision: 0,
      clock: {
        source: 'dom-event-time',
        timestampQuantumUs: null,
        resolutionBoundUs: null,
        mappingUncertaintyUs: null,
      },
    }),
    send: async (packet) => {
      packets.push(structuredClone(packet));
    },
  });
  return {
    state,
    listeners: createTelemetryListeners(state),
    all: () => packets.flatMap((packet) => packet.records),
    flush: () => state.eventSource!.flush(),
  };
}

it('streams 5000 completed DOM clicks without retaining lifetime action history or target text', async () => {
  const { state, listeners, all, flush } = streamedPointer();
  const button = document.createElement('button');
  button.textContent = 'private target description';
  document.body.append(button);
  for (let i = 0; i < 5000; i++) {
    const time = 1000 + i * 10;
    listeners.pointerDown(pointer('pointerdown', time, 20, 30, 0, button));
    listeners.pointerUp(pointer('pointerup', time + 1, 20, 30, 0, button));
    listeners.click(pointer('click', time + 1, 20, 30, 0, button));
    if (i % 32 === 31) await flush();
    expect(state.actionEvents).toHaveLength(0);
    expect(state.releasedGestures.size).toBe(0);
  }
  recordTelemetryPauseBoundary(state, 52000, 'stop');
  expect(await flush()).toBe(true);
  const clicks = all().filter(
    (record) => record.kind === 'action' && record.action.kind === 'CLICK'
  );
  expect(clicks).toHaveLength(5000);
  expect(clicks[0]).toMatchObject({
    action: {
      label: 'Click',
      timeUs: 1000000,
      data: {
        downTimeUs: 1000000,
        upTimeUs: 1001000,
        pressDurationUs: 1000,
        completion: 'released',
      },
    },
  });
  expect(JSON.stringify(all())).not.toContain('private target description');
  expect(all().at(-1)).toMatchObject({ kind: 'boundary', reason: 'stop' });
});

it(
  'flushes a released gesture through a separate public-boundary recorder and never ' +
    'stretches missing up',
  async () => {
    const { state, listeners, all, flush } = streamedPointer();
    listeners.pointerDown(pointer('pointerdown', 1000, 20, 30));
    listeners.pointerUp(pointer('pointerup', 1100, 20, 30));
    listeners.pointerDown(pointer('pointerdown', 2000, 20, 30));
    listeners.pointerMove(pointer('pointermove', 2500, 40, 30));
    recordTelemetryPauseBoundary(state, 9000, 'stop');
    await flush();
    const clicks = all().filter(
      (record) => record.kind === 'action' && record.action.kind === 'CLICK'
    );
    expect(clicks).toHaveLength(2);
    expect(clicks[0]).toMatchObject({
      action: { data: { completion: 'released', upTimeUs: 1100000 } },
    });
    expect(clicks[1]).toMatchObject({
      action: {
        data: {
          completion: 'lost',
          upTimeUs: null,
          pressDurationUs: null,
          lastObservedTimeUs: 2500000,
          gestureType: 'drag',
        },
      },
    });
    expect(state.releasedGestures.size).toBe(0);
  }
);

it(
  'retains semantic double-click count and anonymous keyboard activation without ' +
    'inventing physical edges',
  async () => {
    const { listeners, all, flush } = streamedPointer();
    listeners.pointerDown(pointer('pointerdown', 1000, 20, 30));
    listeners.pointerUp(pointer('pointerup', 1100, 20, 30));
    const double = new MouseEvent('click', { detail: 2, clientX: 20, clientY: 30 });
    Object.defineProperty(double, 'timeStamp', { value: 1100 });
    listeners.click(trusted(double));
    const activation = new MouseEvent('click', { detail: 0 });
    Object.defineProperty(activation, 'timeStamp', { value: 2000 });
    listeners.click(trusted(activation));
    await flush();
    expect(all().filter((record) => record.kind === 'action')).toMatchObject([
      { action: { data: { clickCount: 2, downTimeUs: 1000000, upTimeUs: 1100000 } } },
      {
        action: {
          point: null,
          data: {
            completion: 'semantic',
            downTimeUs: null,
            upTimeUs: null,
            pressDurationUs: null,
            semanticEndTimeUs: 2000000,
          },
        },
      },
    ]);
  }
);

it('retains actual wheel deltas and scroll offsets as separate source facts', async () => {
  const { state, listeners, all, flush } = streamedPointer();
  listeners.wheel(
    trusted(
      new WheelEvent('wheel', { deltaX: -3.5, deltaY: 120, deltaZ: 2, deltaMode: 1, ctrlKey: true })
    )
  );
  listeners.scroll(trusted(new Event('scroll')));
  await flush();
  expect(all().filter((record) => record.kind === 'action')).toMatchObject([
    {
      action: {
        kind: 'SCROLL',
        data: {
          eventType: 'wheel',
          deltaX: -3.5,
          deltaY: 120,
          deltaZ: 2,
          deltaMode: 1,
          scrollX: null,
          scrollY: null,
          ctrlKey: true,
        },
      },
    },
    {
      action: {
        kind: 'SCROLL',
        data: {
          eventType: 'scroll',
          deltaX: null,
          deltaY: null,
          deltaZ: null,
          deltaMode: null,
          scrollX: window.scrollX,
          scrollY: window.scrollY,
          ctrlKey: null,
        },
      },
    },
  ]);
  expect(state.actionEvents).toHaveLength(0);
});

it('does not infer an up point when geometry changed during the gesture and later changed back', async () => {
  const { state, listeners, all, flush } = streamedPointer();
  const originalWidth = window.innerWidth;
  listeners.pointerDown(pointer('pointerdown', 1000, 20, 30));
  vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(originalWidth + 100);
  listeners.pointerUp(pointer('pointerup', 1100, 40, 30));
  vi.mocked(Object.getOwnPropertyDescriptor(window, 'innerWidth')!.get!).mockReturnValue(
    originalWidth
  );
  recordTelemetryPauseBoundary(state, 2000, 'stop');
  await flush();
  expect(all().find((record) => record.kind === 'action')).toMatchObject({
    action: {
      point: { x: 20 / originalWidth, y: 30 / window.innerHeight },
      data: { upTimeUs: 1100000, upPoint: null },
    },
  });
});
