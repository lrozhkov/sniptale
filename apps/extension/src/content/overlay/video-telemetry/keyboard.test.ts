// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { createInitialState } from './state';
import { createTelemetryListeners, recordTelemetryPauseBoundary } from './events';
import { iterateRecordingKeyboardRhythm } from '../../../features/video/project/keyboard-rhythm';

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
