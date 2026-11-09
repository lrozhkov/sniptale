// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { createRecordingEventSource } from './event-source';
import { endKeyboardObservation } from './keyboard';
import { decodeRecordingEventCadence } from '../../../features/video/project/recording-events/records';
import { createInitialState } from './state';
import { createTelemetryListeners, recordTelemetryPauseBoundary } from './events';
import { iterateRecordingKeyboardRhythm } from '../../../features/video/project/keyboard-rhythm';
import { isRecordingActionEvent } from '../../../features/video/project/validation/recording-telemetry';

function key(
  type: 'keydown' | 'keyup',
  name: string,
  timeStamp: number,
  options: KeyboardEventInit = {},
  target?: Element
) {
  const event = new KeyboardEvent(type, { key: name, ...options });
  Object.defineProperties(event, {
    timeStamp: { value: timeStamp },
    ...(target ? { target: { value: target } } : {}),
  });
  return new Proxy(event, {
    get(source, property) {
      if (property === 'isTrusted') return true;
      const value = Reflect.get(source, property);
      return typeof value === 'function' ? value.bind(source) : value;
    },
  });
}
function onsets(state: ReturnType<typeof createInitialState>) {
  return state.signals.flatMap(
    (signal) =>
      signal.keyboardRhythm?.flatMap((block) => [...iterateRecordingKeyboardRhythm(block)]) ?? []
  );
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

it('keeps a lost command at its last actual repeat instead of the later Stop boundary', () => {
  const state = createInitialState();
  state.segmentStartedAtTimestamp = 0;
  const listeners = createTelemetryListeners(state);
  listeners.keyDown(key('keydown', 'c', 1000, { ctrlKey: true, code: 'KeyC' }));
  listeners.keyDown(key('keydown', 'c', 2000, { ctrlKey: true, code: 'KeyC', repeat: true }));
  vi.spyOn(performance, 'now').mockReturnValue(30000);
  recordTelemetryPauseBoundary(state);
  expect(state.actionEvents[0]?.data).toMatchObject({ completion: 'lost', lastObservedTime: 2 });
  expect(state.actionEvents[0]?.data).not.toHaveProperty('upTime');
  expect(state.actionEvents[0]?.data).not.toHaveProperty('pressDuration');
});

it('does not extend an unreleased command to the next independent down', () => {
  const state = createInitialState();
  state.segmentStartedAtTimestamp = 0;
  const listeners = createTelemetryListeners(state);
  listeners.keyDown(key('keydown', 'c', 1000, { ctrlKey: true, code: 'KeyC' }));
  listeners.keyDown(key('keydown', 'c', 2000, { ctrlKey: true, code: 'KeyC', repeat: true }));
  listeners.keyDown(key('keydown', 'c', 4000, { ctrlKey: true, code: 'KeyC' }));
  expect(state.actionEvents[0]?.data).toMatchObject({ completion: 'lost', lastObservedTime: 2 });
  expect(state.actionEvents[1]?.data).toMatchObject({ downTime: 4 });
});

it('retains 5000 anonymous onsets across the 4096-tick block boundary', () => {
  const state = createInitialState();
  state.segmentStartedAtTimestamp = 0;
  const listeners = createTelemetryListeners(state);
  for (let index = 0; index < 5000; index++) {
    const time = 1000 + index * 10;
    listeners.keyDown(key('keydown', 'x', time, { code: 'KeyX' }));
    listeners.keyUp(key('keyup', 'x', time + 1, { code: 'KeyX' }));
  }
  recordTelemetryPauseBoundary(state);
  const attacks = onsets(state);
  expect(attacks).toHaveLength(5000);
  expect(new Set(attacks.map((attack) => attack.id)).size).toBe(5000);
  expect(attacks[4095]?.time).toBe(41.95);
  expect(attacks[4096]?.time).toBe(41.96);
  expect(
    state.signals.flatMap((signal) => signal.keyboardRhythm ?? []).map((block) => block.count)
  ).toEqual([4096, 904]);
});

it('retains 70000 safe-command repeats in bounded cadence blocks without saturation or duplicate onset', () => {
  const state = createInitialState();
  state.segmentStartedAtTimestamp = 0;
  const listeners = createTelemetryListeners(state);
  listeners.keyDown(key('keydown', 'F5', 1000));
  for (let index = 1; index <= 70000; index++)
    listeners.keyDown(key('keydown', 'F5', 1000 + index, { repeat: true }));
  listeners.keyUp(key('keyup', 'F5', 71001));
  recordTelemetryPauseBoundary(state);
  expect(state.actionEvents).toHaveLength(1);
  const action = state.actionEvents[0]!;
  expect(action.data['repeatCount']).toBe(70000);
  expect(action.keyboardRepeats!.reduce((sum, block) => sum + block.count, 0)).toBe(70000);
  expect(action.keyboardRepeats!.every((block) => block.count <= 4096)).toBe(true);
  expect(isRecordingActionEvent(action)).toBe(true);
});

it('captures actual anonymous press times and repeats separately without printable values or codes', () => {
  const state = createInitialState();
  const listeners = createTelemetryListeners(state);
  const target = document.createElement('textarea');
  target.value = 'private typed phrase';
  for (const time of [1000, 1100, 1200, 2050, 2150]) {
    listeners.keyDown(key('keydown', 'x', time, { code: 'KeyX' }, target));
    listeners.keyUp(key('keyup', 'x', time + 30, { code: 'KeyX' }, target));
  }
  listeners.keyDown(key('keydown', 'y', 2500, { code: 'KeyY' }, target));
  for (const time of [2600, 2700])
    listeners.keyDown(key('keydown', 'y', time, { code: 'KeyY', repeat: true }, target));
  listeners.keyUp(key('keyup', 'y', 2800, { code: 'KeyY' }, target));
  recordTelemetryPauseBoundary(state);
  expect(onsets(state).map((attack) => attack.time)).toEqual([1, 1.1, 1.2, 2.05, 2.15, 2.5]);
  expect(
    state.signals.flatMap(
      (signal) =>
        signal.keyboardRepeats?.flatMap((block) =>
          [...iterateRecordingKeyboardRhythm(block)].map((attack) => attack.time)
        ) ?? []
    )
  ).toEqual([2.6, 2.7]);
  const encoded = JSON.stringify(state.signals);
  for (const forbidden of ['KeyX', 'KeyY', 'private typed phrase', '"key"', '"code"'])
    expect(encoded).not.toContain(forbidden);
});

it('produces a single safe command attack with repeat count and observed release duration', () => {
  const state = createInitialState();
  const listeners = createTelemetryListeners(state);
  const input = document.createElement('input');
  listeners.keyDown(key('keydown', 'v', 1000, { ctrlKey: true, code: 'KeyV' }, input));
  listeners.keyDown(
    key('keydown', 'v', 1200, { ctrlKey: true, code: 'KeyV', repeat: true }, input)
  );
  listeners.keyUp(key('keyup', 'v', 1500, { ctrlKey: true, code: 'KeyV' }, input));
  const event = new Event('input');
  Object.defineProperties(event, { target: { value: input }, timeStamp: { value: 1500 } });
  const delivered = new Proxy(event, {
    get(source, property) {
      if (property === 'isTrusted') return true;
      const value = Reflect.get(source, property);
      return typeof value === 'function' ? value.bind(source) : value;
    },
  });
  listeners.input(delivered);
  recordTelemetryPauseBoundary(state);
  expect(state.actionEvents).toHaveLength(1);
  expect(state.actionEvents[0]?.data).toMatchObject({
    combo: 'Ctrl+V',
    keyboardOnsetTime: 1,
    upTime: 1.5,
    pressDuration: 0.5,
    repeatCount: 1,
  });
  expect(
    state.actionEvents[0]?.keyboardRepeats?.flatMap((block) =>
      [...iterateRecordingKeyboardRhythm(block)].map((attack) => attack.time)
    )
  ).toEqual([1.2]);
  expect(onsets(state)).toEqual([]);
});

it.each(['password', 'one-time-code', 'cc-number'])(
  'excludes protected %s contexts entirely from exact timing/count',
  (privacy) => {
    const state = createInitialState();
    const listeners = createTelemetryListeners(state);
    const input = document.createElement('input');
    if (privacy === 'password') input.type = 'password';
    else input.setAttribute('autocomplete', privacy);
    listeners.keyDown(key('keydown', 'k', 1000, { ctrlKey: true, code: 'KeyK' }, input));
    listeners.keyUp(key('keyup', 'k', 1200, { ctrlKey: true, code: 'KeyK' }, input));
    recordTelemetryPauseBoundary(state);
    expect(state.actionEvents).toEqual([]);
    expect(state.signals).toMatchObject([
      { startTime: 1, endTime: 2, data: { privacy: 'protected' } },
    ]);
    expect(state.signals[0]?.data).not.toHaveProperty('eventCount');
    expect(state.signals[0]).not.toHaveProperty('keyboardRhythm');
  }
);

it('records delivered modifier-only chord once and suppresses a chord consumed by command', () => {
  const state = createInitialState();
  const listeners = createTelemetryListeners(state);
  listeners.keyDown(key('keydown', 'Alt', 1000, { altKey: true }));
  listeners.keyDown(key('keydown', 'Shift', 1100, { altKey: true, shiftKey: true }));
  listeners.keyUp(key('keyup', 'Shift', 1200, { altKey: true }));
  listeners.keyUp(key('keyup', 'Alt', 1300));
  listeners.keyDown(key('keydown', 'Control', 2000, { ctrlKey: true }));
  listeners.keyDown(key('keydown', 'Shift', 2100, { ctrlKey: true, shiftKey: true }));
  listeners.keyDown(key('keydown', 'k', 2200, { ctrlKey: true, shiftKey: true }));
  listeners.keyUp(key('keyup', 'Shift', 2300, { ctrlKey: true }));
  listeners.keyUp(key('keyup', 'Control', 2400));
  expect(state.actionEvents.map((action) => action.label)).toEqual(['Alt+Shift', 'Ctrl+Shift+K']);
});

it('does not manufacture keyup or merge cadence across lost observation and field changes', () => {
  const state = createInitialState();
  const listeners = createTelemetryListeners(state);
  const first = document.createElement('input');
  const second = document.createElement('input');
  listeners.keyDown(key('keydown', 'a', 1000, {}, first));
  listeners.keyDown(key('keydown', 'b', 1100, {}, second));
  listeners.keyDown(key('keydown', 'F2', 1200, {}, second));
  vi.spyOn(performance, 'now').mockReturnValue(1500);
  listeners.blur();
  expect(state.signals.filter((signal) => signal.keyboardRhythm)).toHaveLength(2);
  expect(state.actionEvents[0]?.data['completion']).toBe('lost');
  expect(state.actionEvents[0]?.data).not.toHaveProperty('upTime');
});

it.each([
  'section-checkout billing cc-number',
  'section-login one-time-code',
  'current-password',
  'new-password',
])('protects recognized autocomplete tokens in %s without precise rhythm', (autocomplete) => {
  const state = createInitialState();
  const listeners = createTelemetryListeners(state);
  const input = document.createElement('input');
  input.setAttribute('autocomplete', autocomplete);
  listeners.keyDown(key('keydown', 'a', 1250, {}, input));
  recordTelemetryPauseBoundary(state);
  expect(onsets(state)).toEqual([]);
  expect(state.signals).toMatchObject([
    { startTime: 1, endTime: 2, data: { privacy: 'protected' } },
  ]);
});

it('retains anonymous held-key duration/repeat count without adding a duplicate onset', () => {
  const state = createInitialState();
  const listeners = createTelemetryListeners(state);
  const field = document.createElement('textarea');
  listeners.keyDown(key('keydown', 'a', 1000, {}, field));
  listeners.keyDown(key('keydown', 'a', 1200, { repeat: true }, field));
  listeners.keyDown(key('keydown', 'a', 1300, { repeat: true }, field));
  listeners.keyUp(key('keyup', 'a', 1500, {}, field));
  recordTelemetryPauseBoundary(state);
  expect(onsets(state)).toHaveLength(1);
  expect(state.signals.find((signal) => signal.data['keyboardHold'] === true)?.data).toMatchObject({
    downTime: 1,
    upTime: 1.5,
    pressDuration: 0.5,
    repeatCount: 2,
    completion: 'released',
  });
});

it('retains a long anonymous hold without repeat but keeps ordinary short typing compact', () => {
  const state = createInitialState();
  const listeners = createTelemetryListeners(state);
  const field = document.createElement('textarea');
  listeners.keyDown(key('keydown', 'a', 1000, {}, field));
  listeners.keyUp(key('keyup', 'a', 1600, {}, field));
  listeners.keyDown(key('keydown', 'b', 2000, {}, field));
  listeners.keyUp(key('keyup', 'b', 2100, {}, field));
  recordTelemetryPauseBoundary(state);
  expect(onsets(state)).toHaveLength(2);
  expect(state.signals.filter((signal) => signal.data['keyboardHold'] === true)).toHaveLength(1);
  expect(state.signals.find((signal) => signal.data['keyboardHold'] === true)?.data).toMatchObject({
    downTime: 1,
    upTime: 1.6,
    repeatCount: 0,
  });
  expect(
    state.signals.find((signal) => signal.data['keyboardHold'] === true)?.data['pressDuration']
  ).toBeCloseTo(0.6);
});

it('clears a modifier-only candidate on global blur even after pointer observation was already lost', () => {
  const state = createInitialState();
  const listeners = createTelemetryListeners(state);
  const pointer = new MouseEvent('pointerout');
  const delivered = new Proxy(pointer, {
    get(source, property) {
      if (property === 'isTrusted') return true;
      const value = Reflect.get(source, property);
      return typeof value === 'function' ? value.bind(source) : value;
    },
  });
  vi.spyOn(performance, 'now').mockReturnValue(1000);
  listeners.pointerLeave(delivered);
  listeners.keyDown(key('keydown', 'Alt', 1100, { altKey: true }));
  listeners.keyDown(key('keydown', 'Shift', 1200, { altKey: true, shiftKey: true }));
  vi.spyOn(performance, 'now').mockReturnValue(1300);
  const blur = new FocusEvent('blur');
  Object.defineProperty(blur, 'target', { value: window });
  listeners.blur(blur);
  listeners.keyUp(key('keyup', 'Shift', 1400, { altKey: true }));
  expect(state.actionEvents).toEqual([]);
  expect(state.keyboard.modifiers).toBeNull();
  expect(state.keyboard.held.size).toBe(0);
});

it('uses only coarse activity when a trusted event is retargeted from a closed shadow password', () => {
  const state = createInitialState();
  const listeners = createTelemetryListeners(state);
  const host = document.createElement('div');
  const root = host.attachShadow({ mode: 'closed' });
  const input = document.createElement('input');
  input.type = 'password';
  root.append(input);
  document.body.append(host);
  vi.stubGlobal('chrome', {
    dom: { openOrClosedShadowRoot: (element: HTMLElement) => (element === host ? root : null) },
  });
  host.addEventListener('keydown', (event) =>
    listeners.keyDown(
      new Proxy(event, {
        get(source, property) {
          if (property === 'isTrusted') return true;
          const value = Reflect.get(source, property);
          return typeof value === 'function' ? value.bind(source) : value;
        },
      })
    )
  );
  const event = new KeyboardEvent('keydown', { key: 'a', bubbles: true, composed: true });
  Object.defineProperty(event, 'timeStamp', { value: 1000 });
  input.dispatchEvent(event);
  recordTelemetryPauseBoundary(state);
  expect(onsets(state)).toEqual([]);
  expect(state.actionEvents).toEqual([]);
  expect(state.signals).toMatchObject([{ data: { privacy: 'protected', activity: 'input' } }]);
});

it('honors explicit private ancestry before the nearest native input', () => {
  const state = createInitialState();
  const listeners = createTelemetryListeners(state);
  const wrapper = document.createElement('div');
  wrapper.setAttribute('data-sniptale-private', '');
  const input = document.createElement('input');
  wrapper.append(input);
  document.body.append(wrapper);
  listeners.keyDown(key('keydown', 'a', 1000, {}, input));
  listeners.keyUp(key('keyup', 'a', 1100, {}, input));
  recordTelemetryPauseBoundary(state);
  expect(onsets(state)).toEqual([]);
  expect(state.signals).toMatchObject([{ data: { privacy: 'protected' } }]);
});

it('honors a marked host in the composed path of an open shadow input', () => {
  const state = createInitialState();
  const listeners = createTelemetryListeners(state);
  const host = document.createElement('div');
  host.setAttribute('data-sniptale-private', '');
  const root = host.attachShadow({ mode: 'open' });
  const input = document.createElement('input');
  root.append(input);
  document.body.append(host);
  host.addEventListener('keydown', (event) =>
    listeners.keyDown(
      new Proxy(event, {
        get(source, property) {
          if (property === 'isTrusted') return true;
          const value = Reflect.get(source, property);
          return typeof value === 'function' ? value.bind(source) : value;
        },
      })
    )
  );
  const event = new KeyboardEvent('keydown', { key: 'a', bubbles: true, composed: true });
  Object.defineProperty(event, 'timeStamp', { value: 1000 });
  input.dispatchEvent(event);
  recordTelemetryPauseBoundary(state);
  expect(onsets(state)).toEqual([]);
  expect(state.signals).toMatchObject([{ data: { privacy: 'protected' } }]);
});

it('clears a prior public hold on protected keyup without persisting the private release time', () => {
  const state = createInitialState();
  const listeners = createTelemetryListeners(state);
  const input = document.createElement('input');
  listeners.keyDown(key('keydown', 'F2', 1000, {}, input));
  input.type = 'password';
  vi.spyOn(performance, 'now').mockReturnValue(1250);
  listeners.keyUp(key('keyup', 'F2', 1250, {}, input));
  expect(state.keyboard.held.size).toBe(0);
  expect(state.actionEvents[0]?.data).not.toHaveProperty('upTime');
  expect(state.actionEvents[0]?.data['lastObservedTime']).toBe(1);
});

it('does not attach a precise protected down boundary to a prior public key hold', () => {
  const state = createInitialState();
  const listeners = createTelemetryListeners(state);
  const input = document.createElement('input');
  listeners.keyDown(key('keydown', 'F2', 1000, {}, input));
  input.type = 'password';
  vi.spyOn(performance, 'now').mockReturnValue(1250);
  listeners.keyDown(key('keydown', 'a', 1250, {}, input));
  expect(state.keyboard.held.size).toBe(0);
  expect(state.actionEvents[0]?.data['lastObservedTime']).toBe(1);
  expect(state.actionEvents[0]?.data).not.toHaveProperty('upTime');
});

it.each(['available', 'missing', 'throwing'])(
  'keeps known native controls precise when root capability is %s',
  (capability) => {
    vi.stubGlobal(
      'chrome',
      capability === 'missing'
        ? {}
        : {
            dom: {
              openOrClosedShadowRoot: () => {
                if (capability === 'throwing') throw new Error('unavailable');
                return null;
              },
            },
          }
    );
    const state = createInitialState();
    const listeners = createTelemetryListeners(state);
    const input = document.createElement('input');
    listeners.keyDown(key('keydown', 'a', 1000, {}, input));
    listeners.keyUp(key('keyup', 'a', 1100, {}, input));
    recordTelemetryPauseBoundary(state);
    expect(onsets(state).map((attack) => attack.time)).toEqual([1]);
    expect(state.signals.every((signal) => signal.data['privacy'] !== 'protected')).toBe(true);
  }
);

it.each(['missing', 'throwing'])(
  'uses coarse coverage for opaque targets when root capability is %s',
  (capability) => {
    vi.stubGlobal(
      'chrome',
      capability === 'missing'
        ? {}
        : {
            dom: {
              openOrClosedShadowRoot: () => {
                throw new Error('unavailable');
              },
            },
          }
    );
    const state = createInitialState();
    const listeners = createTelemetryListeners(state);
    const host = document.createElement('div');
    listeners.keyDown(key('keydown', 'F2', 1234, {}, host));
    listeners.keyUp(key('keyup', 'F2', 1567, {}, host));
    recordTelemetryPauseBoundary(state);
    expect(onsets(state)).toEqual([]);
    expect(state.actionEvents).toEqual([]);
    expect(state.signals).toMatchObject([
      { startTime: 1, endTime: 2, data: { privacy: 'protected' } },
    ]);
  }
);

it('keeps ordinary editable and open-root input events precise when privacy is verified without inner reads', () => {
  const inspect = vi.fn((element: HTMLElement) => element.shadowRoot);
  vi.stubGlobal('chrome', { dom: { openOrClosedShadowRoot: inspect } });
  const state = createInitialState();
  const listeners = createTelemetryListeners(state);
  const editable = document.createElement('div');
  editable.contentEditable = 'true';
  Object.defineProperty(editable, 'textContent', {
    get: () => {
      throw new Error('private text read');
    },
  });
  listeners.keyDown(key('keydown', 'a', 1000, {}, editable));
  listeners.keyUp(key('keyup', 'a', 1100, {}, editable));
  const host = document.createElement('div');
  host.attachShadow({ mode: 'open' });
  listeners.keyDown(key('keydown', 'b', 1200, {}, host));
  listeners.keyUp(key('keyup', 'b', 1300, {}, host));
  recordTelemetryPauseBoundary(state);
  expect(onsets(state).map((attack) => attack.time)).toEqual([1, 1.2]);
  expect(inspect).toHaveBeenCalledWith(editable);
  expect(inspect).toHaveBeenCalledWith(host);
});

it('clears a prior public hold on protected input without attaching the private input time', () => {
  const state = createInitialState();
  const listeners = createTelemetryListeners(state);
  const input = document.createElement('input');
  listeners.keyDown(key('keydown', 'F2', 1000, {}, input));
  input.type = 'password';
  const event = new Event('input');
  Object.defineProperties(event, { target: { value: input }, timeStamp: { value: 1250 } });
  const delivered = new Proxy(event, {
    get(source, property) {
      if (property === 'isTrusted') return true;
      const value = Reflect.get(source, property);
      return typeof value === 'function' ? value.bind(source) : value;
    },
  });
  listeners.input(delivered);
  expect(state.keyboard.held.size).toBe(0);
  expect(state.actionEvents[0]?.data['lastObservedTime']).toBe(1);
  input.type = 'text';
  listeners.keyUp(key('keyup', 'F2', 1500, {}, input));
  expect(state.actionEvents[0]?.data).not.toHaveProperty('upTime');
});

it('does not attach a precise protected blur boundary to a prior public key hold', () => {
  const state = createInitialState();
  const listeners = createTelemetryListeners(state);
  const input = document.createElement('input');
  listeners.keyDown(key('keydown', 'F2', 1000, {}, input));
  input.type = 'password';
  vi.spyOn(performance, 'now').mockReturnValue(1250);
  const event = new FocusEvent('blur');
  Object.defineProperties(event, { target: { value: input }, timeStamp: { value: 1250 } });
  listeners.blur(event);
  expect(state.keyboard.held.size).toBe(0);
  expect(state.actionEvents[0]?.data['lastObservedTime']).toBe(1);
  expect(state.actionEvents[0]?.data).not.toHaveProperty('upTime');
});

it.each(['missing', 'throwing'])(
  'keeps an exposed open-root host precise when root capability is %s',
  (capability) => {
    vi.stubGlobal(
      'chrome',
      capability === 'missing'
        ? {}
        : {
            dom: {
              openOrClosedShadowRoot: () => {
                throw new Error('unavailable');
              },
            },
          }
    );
    const state = createInitialState();
    const listeners = createTelemetryListeners(state);
    const host = document.createElement('div');
    host.attachShadow({ mode: 'open' });
    listeners.keyDown(key('keydown', 'a', 1000, {}, host));
    listeners.keyUp(key('keyup', 'a', 1100, {}, host));
    recordTelemetryPauseBoundary(state);
    expect(onsets(state).map((attack) => attack.time)).toEqual([1]);
    expect(state.signals.every((signal) => signal.data['privacy'] !== 'protected')).toBe(true);
  }
);

function streamedKeyboard() {
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
  const listeners = createTelemetryListeners(state);
  return {
    state,
    listeners,
    packets,
    all: () => packets.flatMap((packet) => packet.records),
    flush: () => state.eventSource!.flush(),
  };
}

it('streams 5000 anonymous DOM onsets without lifetime action, signal or cadence arrays', async () => {
  const { state, listeners, all, flush } = streamedKeyboard();
  for (let index = 0; index < 5000; index++) {
    const timestamp = 86400000 + index * 0.123;
    listeners.keyDown(key('keydown', 'x', timestamp, { code: 'KeyX' }));
    listeners.keyUp(key('keyup', 'x', timestamp + 0.001, { code: 'KeyX' }));
    if (index % 32 === 31) await flush();
    expect(state.keyboard.times.length).toBeLessThanOrEqual(512);
    expect(state.actionEvents).toHaveLength(0);
    expect(state.signals).toHaveLength(0);
  }
  endKeyboardObservation(state);
  expect(await flush()).toBe(true);
  const ticks = all().flatMap((record) =>
    record.kind === 'keyboard-repeat-block' && record.phase === 'onset'
      ? (decodeRecordingEventCadence(record.cadence) ?? [])
      : []
  );
  expect(ticks).toHaveLength(5000);
  expect(ticks[0]).toBe(86400000000);
  expect(ticks[1]).toBe(86400000123);
  expect(state.keyboard.streamed.size).toBe(0);
});

it('streams 70000 command repeats and a real completion with bounded live memory', async () => {
  const { state, listeners, all, flush } = streamedKeyboard();
  listeners.keyDown(key('keydown', 'F5', 1000, { code: 'F5' }));
  for (let i = 1; i <= 70000; i++) {
    listeners.keyDown(key('keydown', 'F5', 1000 + i * 0.1, { code: 'F5', repeat: true }));
    if (i % 512 === 0) await flush();
    expect(state.keyboard.streamed.get('F5')!.repeats.length).toBeLessThan(512);
  }
  listeners.keyUp(key('keyup', 'F5', 8001, { code: 'F5' }));
  await flush();
  expect(all().filter((record) => record.kind === 'action')).toHaveLength(1);
  expect(all().find((record) => record.kind === 'action-update')).toMatchObject({
    revision: 1,
    data: {
      completion: 'released',
      repeatCount: 70000,
      upTimeUs: 8001000,
      pressDurationUs: 7001000,
    },
  });
  expect(
    all()
      .filter((record) => record.kind === 'keyboard-repeat-block')
      .reduce(
        (sum, record) => sum + (record.kind === 'keyboard-repeat-block' ? record.cadence.count : 0),
        0
      )
  ).toBe(70000);
  expect(state.actionEvents).toHaveLength(0);
  expect(state.signals).toHaveLength(0);
});

it('retains repeats with unknown onset and a lost hold without a fake attack or Stop stretch', async () => {
  const { state, listeners, all, flush } = streamedKeyboard();
  listeners.keyDown(key('keydown', 'x', 2000, { repeat: true, code: 'KeyX' }));
  listeners.keyDown(key('keydown', 'x', 3000, { repeat: true, code: 'KeyX' }));
  vi.spyOn(performance, 'now').mockReturnValue(9000);
  endKeyboardObservation(state);
  await flush();
  expect(all().filter((record) => record.kind === 'gap')).toHaveLength(1);
  expect(all().filter((record) => record.kind === 'keyboard-repeat-block')).toMatchObject([
    { phase: 'repeat', cadence: { count: 2 } },
  ]);
  expect(
    all().find((record) => record.kind === 'signal' && record.signal.kind === 'keyboard-hold')
  ).toMatchObject({
    signal: {
      startTimeUs: 2000000,
      endTimeUs: 3000000,
      data: {
        downTimeUs: null,
        upTimeUs: null,
        pressDurationUs: null,
        lastObservedTimeUs: 3000000,
        repeatCount: 2,
        completion: 'lost',
      },
    },
  });
});

it('keeps actual modifier edges and sanitizes unsupported command terminals', async () => {
  const { state, listeners, all, flush } = streamedKeyboard();
  listeners.keyDown(key('keydown', 'Control', 1000, { code: 'ControlLeft', ctrlKey: true }));
  listeners.keyDown(key('keydown', '/', 1100, { code: 'Slash', ctrlKey: true }));
  listeners.keyUp(key('keyup', '/', 1200, { code: 'Slash', ctrlKey: true }));
  endKeyboardObservation(state);
  await flush();
  expect(
    all()
      .filter((record) => record.kind === 'action')
      .map((record) => record.kind === 'action' && record.action.label)
  ).toEqual(['Ctrl', 'Ctrl+Unknown']);
  expect(
    all()
      .filter((record) => record.kind === 'action-update')
      .at(-1)
  ).toMatchObject({
    data: { completion: 'lost', upTimeUs: null, lastObservedTimeUs: 1000000 },
  });
});

it('does not retain protected key identities, counts or fine timestamps in either history path', async () => {
  const { state, listeners, all, flush } = streamedKeyboard();
  const input = document.createElement('input');
  input.type = 'password';
  document.body.append(input);
  for (let i = 0; i < 200; i++) {
    listeners.keyDown(key('keydown', 'secret', 1100 + i, { code: 'SecretCode' }, input));
    listeners.keyUp(key('keyup', 'secret', 1100 + i + 0.1, { code: 'SecretCode' }, input));
  }
  state.eventSource!.boundary(
    {
      sourceClockId: state.observationClock.id,
      observationTimeSeconds: 2,
      viewport: {
        width: 1024,
        height: 768,
        devicePixelRatio: 1,
        visualViewportScale: 1,
        visualViewportOffsetX: 0,
        visualViewportOffsetY: 0,
      },
    },
    'stop'
  );
  await flush();
  const facts = all().filter((record) => record.kind === 'signal');
  expect(facts).toHaveLength(1);
  expect(facts[0]).toMatchObject({
    signal: {
      startTimeUs: 1000000,
      endTimeUs: 2000000,
      point: null,
      data: { privacy: 'protected', eventCount: null },
    },
  });
  expect(JSON.stringify(all())).not.toContain('secret');
  expect(JSON.stringify(all())).not.toContain('SecretCode');
  expect(state.signals).toHaveLength(0);
  expect(state.actionEvents).toHaveLength(0);
});

it('retains a safe command release observed after capture starts without a down or attack', async () => {
  const { listeners, all, flush } = streamedKeyboard();
  listeners.keyUp(key('keyup', 'F5', 2000, { code: 'F5' }));
  await flush();
  expect(all().filter((record) => record.kind === 'gap')).toHaveLength(1);
  expect(all().find((record) => record.kind === 'action')).toMatchObject({
    action: {
      label: 'F5',
      data: { downTimeUs: null, keyboardAttackId: null, keyboardOnsetTimeUs: null },
    },
  });
  expect(all().find((record) => record.kind === 'action-update')).toMatchObject({
    data: {
      upTimeUs: 2000000,
      pressDurationUs: null,
      completion: 'released',
      repeatCount: 0,
    },
  });
  expect(all().filter((record) => record.kind === 'keyboard-repeat-block')).toHaveLength(0);
});

it('reports unknown keyboard context once and preserves a proven pair across the context boundary', async () => {
  const { listeners, all, flush } = streamedKeyboard();
  listeners.keyDown(key('keydown', 'c', 1000, { code: 'KeyC', ctrlKey: true }));
  listeners.keyDown(key('keydown', 'F5', 2000, { code: 'F5', repeat: true }));
  listeners.keyUp(key('keyup', 'F6', 2500, { code: 'F6' }));
  listeners.keyUp(key('keyup', 'c', 3000, { code: 'KeyC', ctrlKey: true }));
  await flush();
  const gaps = all().filter((record) => record.kind === 'gap');
  expect(gaps).toHaveLength(1);
  expect(gaps[0]).toMatchObject({
    fromTimeUs: 2000000,
    toTimeUs: 2000000,
    source: 'keyboard',
    reason: 'source-unavailable',
    lostCount: null,
  });
  const base = all().find((record) => record.kind === 'action' && record.action.label === 'Ctrl+C');
  expect(base?.kind).toBe('action');
  if (base?.kind !== 'action') throw new Error('Missing proven command.');
  expect(
    all().find((record) => record.kind === 'action-update' && record.actionId === base.action.id)
  ).toMatchObject({
    segmentId: 1,
    data: { upTimeUs: 3000000, pressDurationUs: 2000000, completion: 'released' },
  });
});
