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
  expect(describe(button).data).toEqual({
    targetTag: 'button',
    targetName: 'Save',
    targetKind: 'button',
    targetSource: 'html',
  });
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
      targetKind: 'text-field',
      targetSource: 'html',
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
  expect(describe(editable).data).toEqual({
    targetTag: 'div',
    targetRole: 'textbox',
    targetEditable: 'yes',
    targetKind: 'text-field',
    targetSource: 'aria',
  });
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
  expect(describe(div).data).toEqual({
    targetTag: 'div',
    targetKind: 'unknown',
    targetSource: 'unknown',
  });
  const link = document.createElement('a');
  link.href = 'https://example.test/private?token=secret';
  link.textContent = 'Open';
  expect(describe(link).data).toEqual({
    targetTag: 'a',
    targetName: 'Open',
    targetHasHref: 'yes',
    targetKind: 'link',
    targetSource: 'html',
  });
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
  expect(describe(select).data).toEqual({
    targetTag: 'select',
    targetName: 'Account',
    targetKind: 'select',
    targetSource: 'html',
  });
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

it('resolves a semantic ancestor across an open shadow boundary', () => {
  const button = document.createElement('button');
  button.setAttribute('aria-label', 'Save document');
  const host = document.createElement('span');
  const root = host.attachShadow({ mode: 'open' });
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  root.append(icon);
  button.append(host);
  document.body.append(button);
  expect(describe(icon).data).toMatchObject({ targetTag: 'button', targetName: 'Save document' });
});

it('recognizes a supported fallback role without copying surrounding text', () => {
  const button = document.createElement('div');
  button.setAttribute('role', 'unrecognized-role button');
  button.setAttribute('aria-label', 'Confirm');
  const icon = document.createElement('span');
  button.append(icon);
  document.body.append(button);
  expect(describe(icon).data).toMatchObject({ targetTag: 'div', targetName: 'Confirm' });
});

it('ignores decorative roles when locating a containing control', () => {
  const button = document.createElement('button');
  button.setAttribute('aria-label', 'Save');
  for (const role of ['img', 'none', 'presentation', 'generic']) {
    const icon = document.createElement('span');
    icon.setAttribute('role', role);
    button.replaceChildren(icon);
    document.body.append(button);
    expect(describe(icon).data).toMatchObject({ targetKind: 'button', targetName: 'Save' });
  }
});

it('classifies editable regions without retaining entered content and respects false barriers', () => {
  const editable = document.createElement('div');
  editable.setAttribute('contenteditable', 'plaintext-only');
  const child = document.createElement('span');
  child.textContent = 'private entered text';
  editable.append(child);
  document.body.append(editable);
  const data = describe(child).data;
  expect(data).toMatchObject({ targetKind: 'text-field', targetSource: 'editable' });
  expect(JSON.stringify(data)).not.toContain('private entered text');
  child.setAttribute('contenteditable', 'false');
  expect(describe(child).data['targetKind']).toBe('unknown');
});

it('retains legacy anchor labels without inventing link semantics', () => {
  const link = document.createElement('a');
  link.textContent = 'Section';
  expect(describe(link).data).toEqual({
    targetTag: 'a',
    targetKind: 'unknown',
    targetSource: 'unknown',
    targetName: 'Section',
  });
});

it('does not turn label forwarding into a second pointer action', () => {
  const state = createInitialState();
  const listeners = createTelemetryListeners(state);
  const label = document.createElement('label');
  const input = document.createElement('input');
  input.type = 'checkbox';
  label.append(input);
  document.body.append(label);
  label.addEventListener('click', listeners.click);
  label.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
  expect(state.actionEvents).toHaveLength(1);
  expect(state.actionEvents[0]?.data['clickCount']).toBe(1);
});

it('keeps one click identity across descendants of a newly supported control', () => {
  const state = createInitialState();
  const listeners = createTelemetryListeners(state);
  const control = document.createElement('div');
  control.setAttribute('role', 'switch');
  const first = document.createElement('span');
  const second = document.createElement('span');
  control.append(first, second);
  document.body.append(control);
  control.addEventListener('click', listeners.click);
  first.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
  second.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 2 }));
  expect(state.actionEvents).toHaveLength(1);
  expect(state.actionEvents[0]?.data).toMatchObject({ clickCount: 2, targetKind: 'switch' });
});

it('does not expose control semantics from inside a closed shadow root to an outside listener', () => {
  const host = document.createElement('div');
  const root = host.attachShadow({ mode: 'closed' });
  const input = document.createElement('input');
  input.value = 'closed private value';
  root.append(input);
  document.body.append(host);
  const observations: Record<string, string>[] = [];
  host.addEventListener('click', (event) => observations.push(describeTelemetryTarget(event).data));
  input.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
  expect(observations).toEqual([
    { targetTag: 'div', targetKind: 'unknown', targetSource: 'unknown' },
  ]);
});

it('normalizes missing and invalid native input types at capture time', () => {
  const input = document.createElement('input');
  for (const type of ['', 'not-a-type']) {
    input.setAttribute('type', type);
    expect(describe(input).data).toMatchObject({ targetType: 'text', targetKind: 'text-field' });
  }
});

it('resolves a slotted icon to its shadow control without copying editable content', () => {
  const host = document.createElement('div');
  const root = host.attachShadow({ mode: 'open' });
  const button = document.createElement('button');
  button.setAttribute('aria-label', 'Confirm');
  button.append(document.createElement('slot'));
  root.append(button);
  const icon = document.createElement('span');
  const input = document.createElement('input');
  input.value = 'private-input';
  icon.append(input);
  host.append(icon);
  document.body.append(host);
  const result = describe(icon);
  expect(result.clickElement).toBe(button);
  expect(result.data).toEqual({
    targetTag: 'button',
    targetName: 'Confirm',
    targetKind: 'button',
    targetSource: 'html',
  });
});
