import { expect, it } from 'vitest';
import { resolveRecordingTarget, recordingTargetRole } from './recording-target';

it.each([
  ['text', 'text-field'],
  ['password', 'text-field'],
  ['button', 'button'],
  ['checkbox', 'checkbox'],
  ['radio', 'radio'],
  ['range', 'slider'],
  ['number', 'number-field'],
  ['file', 'other-control'],
  ['hidden', 'unknown'],
])('classifies native input %s without reading its value', (targetType, kind) => {
  expect(resolveRecordingTarget({ targetTag: 'input', targetType, value: 'private' }).kind).toBe(
    kind
  );
});

it('does not infer missing legacy evidence or inspect labels', () => {
  expect(resolveRecordingTarget({ targetTag: 'a', targetName: 'Save' }).kind).toBe('unknown');
  expect(resolveRecordingTarget({ targetTag: 'input', targetType: {} }).kind).toBe('unknown');
  expect(resolveRecordingTarget({ targetTag: 'a', targetHasHref: 'yes' }).kind).toBe('link');
});

it('honors role token precedence and conservative native overrides', () => {
  expect(recordingTargetRole('invalid button')).toBe('button');
  expect(recordingTargetRole('heading button')).toBe('heading');
  expect(resolveRecordingTarget({ targetTag: 'div', targetRole: 'heading button' }).kind).toBe(
    'unknown'
  );
  expect(
    resolveRecordingTarget({ targetTag: 'input', targetType: 'checkbox', targetRole: 'textbox' })
      .kind
  ).toBe('checkbox');
  expect(
    resolveRecordingTarget({ targetTag: 'input', targetType: 'checkbox', targetRole: 'switch' })
  ).toEqual({ kind: 'switch', source: 'aria' });
});

it('keeps editable evidence separate from role semantics', () => {
  expect(resolveRecordingTarget({ targetEditable: 'yes' })).toEqual({
    kind: 'text-field',
    source: 'editable',
  });
  expect(resolveRecordingTarget({ targetRole: 'combobox', targetEditable: 'yes' }).kind).toBe(
    'combobox'
  );
  expect(resolveRecordingTarget({ targetEditable: 'true' }).kind).toBe('unknown');
});

it('distinguishes text input overrides from restricted input semantics', () => {
  for (const targetType of ['email', 'url', 'tel', 'search', 'password']) {
    expect(
      resolveRecordingTarget({ targetTag: 'input', targetType, targetRole: 'spinbutton' }).kind
    ).toBe('text-field');
  }
  expect(
    resolveRecordingTarget({ targetTag: 'input', targetType: 'text', targetRole: 'spinbutton' })
      .kind
  ).toBe('number-field');
  expect(
    resolveRecordingTarget({
      targetTag: 'input',
      targetType: 'search',
      targetHasList: 'yes',
      targetRole: 'slider',
    })
  ).toEqual({ kind: 'combobox', source: 'html' });
  expect(resolveRecordingTarget({ targetTag: 'textarea', targetRole: 'combobox' }).kind).toBe(
    'text-field'
  );
});

it('reads bounded persisted semantics and falls back when optional metadata is malformed', () => {
  expect(resolveRecordingTarget({ targetKind: 'switch', targetSource: 'aria' })).toEqual({
    kind: 'switch',
    source: 'aria',
  });
  for (const invalid of [
    { targetKind: 'invalid', targetSource: 'html' },
    { targetKind: 'button', targetSource: 'editable' },
    { targetKind: 'unknown', targetSource: 'html' },
    { targetKind: 'button', targetSource: 'unknown' },
    { targetKind: 'button', targetSource: 'invalid' },
  ]) {
    expect(resolveRecordingTarget({ ...invalid, targetTag: 'input', targetType: 'text' })).toEqual({
      kind: 'text-field',
      source: 'html',
    });
  }
});
