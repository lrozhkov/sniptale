// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { describeTelemetryTarget } from './target';
import { createInitialState } from './state';
import { createTelemetryListeners } from './events';
import { finalizeTelemetrySignals } from './signals';

afterEach(() => document.body.replaceChildren());
function describe(element: Element) {
  let result: ReturnType<typeof describeTelemetryTarget> | null = null;
  element.addEventListener(
    'click',
    (event) => {
      result = describeTelemetryTarget(event);
    },
    { once: true }
  );
  element.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
  if (!result) throw new Error('Expected click');
  return result as ReturnType<typeof describeTelemetryTarget>;
}

it('uses button text and excludes hidden or editable descendants', () => {
  const button = document.createElement('button');
  button.textContent = 'Save';
  const hidden = document.createElement('span');
  hidden.hidden = true;
  hidden.textContent = 'private hidden value';
  const input = document.createElement('input');
  input.value = 'password';
  button.append(hidden, input);
  document.body.append(button);
  expect(describe(button).data).toEqual({ targetTag: 'button', targetName: 'Save' });
});

it('reads associated labels without storing password, text input or editable contents', () => {
  for (const type of ['text', 'password']) {
    const label = document.createElement('label');
    label.textContent = 'Account';
    const input = document.createElement('input');
    input.type = type;
    input.value = 'entered-secret';
    label.append(input);
    document.body.append(label);
    expect(describe(input).data).toEqual({
      targetTag: 'input',
      targetType: input.type,
      targetName: 'Account',
    });
  }
  const editable = document.createElement('div');
  editable.setAttribute('contenteditable', 'true');
  editable.setAttribute('role', 'textbox');
  editable.textContent = 'private message';
  document.body.append(editable);
  expect(describe(editable).data).toEqual({ targetTag: 'div', targetRole: 'textbox' });
});

it('keeps button identity inside an open shadow root', () => {
  const host = document.createElement('div');
  const shadow = host.attachShadow({ mode: 'open' });
  const button = document.createElement('button');
  button.setAttribute('aria-label', 'Confirm');
  shadow.append(button);
  document.body.append(host);
  expect(describe(button).data['targetName']).toBe('Confirm');
});

it('bounds labels and does not copy ordinary page text or URLs', () => {
  const button = document.createElement('button');
  button.setAttribute('aria-label', 'A'.repeat(1000));
  expect(describe(button).data['targetName']).toHaveLength(120);
  const div = document.createElement('div');
  div.textContent = 'ordinary private page text';
  expect(describe(div).data).toEqual({ targetTag: 'div' });
  const link = document.createElement('a');
  link.href = 'https://example.test/private?token=secret';
  link.textContent = 'Open';
  expect(describe(link).data).toEqual({ targetTag: 'a', targetName: 'Open' });
});

it('merges fast form entry while publishing only scalar target metadata', () => {
  const state = createInitialState();
  const listeners = createTelemetryListeners(state);
  for (const [index, name] of [
    'First field',
    'Second field',
    'First field',
    'Second field',
    'First field',
  ].entries()) {
    const input = document.createElement('input');
    input.setAttribute('aria-label', name);
    input.value = 'never retained';
    document.body.append(input);
    input.addEventListener('input', listeners.input);
    for (const offset of [0, 500]) {
      const event = new Event('input', { bubbles: true });
      Object.defineProperty(event, 'timeStamp', { value: 1000 + index * 800 + offset });
      input.dispatchEvent(event);
    }
  }
  finalizeTelemetrySignals(state);
  expect(state.signals).toHaveLength(1);
  expect(state.signals.map((signal) => signal.data['targetName'])).toEqual(['First field']);
  expect(state.typingSignal).toBeNull();
  expect(state.typingTarget).toBeNull();
  expect(JSON.stringify(state.signals)).not.toContain('never retained');
  expect(
    state.signals
      .flatMap((signal) => Object.values(signal.data))
      .every((value) => typeof value === 'string' || typeof value === 'number')
  ).toBe(true);
});

it('retains a select description without retaining selected or unselected option values', () => {
  const label = document.createElement('label');
  label.textContent = 'Account';
  const select = document.createElement('select');
  for (const name of ['Private account A', 'Private account B']) {
    const option = document.createElement('option');
    option.textContent = name;
    select.append(option);
  }
  label.append(select);
  document.body.append(label);
  expect(describe(select).data).toEqual({ targetTag: 'select', targetName: 'Account' });
});

it('does not label checkbox, range, or select changes as typing', () => {
  const state = createInitialState();
  const listeners = createTelemetryListeners(state);
  for (const type of ['checkbox', 'radio', 'range', 'color', 'file', 'button']) {
    const input = document.createElement('input');
    input.type = type;
    input.addEventListener('input', listeners.input);
    input.addEventListener('change', listeners.change);
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('change'));
  }
  const select = document.createElement('select');
  select.addEventListener('change', listeners.change);
  select.dispatchEvent(new Event('change'));
  finalizeTelemetrySignals(state);
  expect(state.signals.filter((signal) => signal.kind === 'typing')).toEqual([]);
});
