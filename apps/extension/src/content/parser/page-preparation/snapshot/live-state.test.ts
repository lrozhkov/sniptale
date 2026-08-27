// @vitest-environment jsdom

import { afterEach, expect, it, vi } from 'vitest';
import { markPreparedSnapshotLiveState } from './live-state';

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

it('copies current form state rather than stale markup defaults', () => {
  document.body.innerHTML = [
    '<input value="old"><input type="checkbox">',
    '<textarea>old</textarea><select><option>First</option><option>Second</option></select>',
    '<details><summary>More</summary></details>',
  ].join('');
  const [text, checkbox] = Array.from(document.querySelectorAll('input'));
  if (!text || !checkbox) throw new Error('Expected form controls');
  text.value = 'current';
  checkbox.checked = true;
  const textarea = document.querySelector('textarea');
  const select = document.querySelector('select');
  const details = document.querySelector('details');
  if (!textarea || !select || !details) throw new Error('Expected live controls');
  textarea.value = 'current text';
  select.selectedIndex = 1;
  details.open = true;

  const marks = markPreparedSnapshotLiveState(document);
  const snapshot = new DOMParser().parseFromString(document.documentElement.outerHTML, 'text/html');
  expect(marks.materialize(snapshot)).toEqual([]);
  marks.cleanup();

  expect(snapshot.querySelector('input')?.getAttribute('value')).toBe('current');
  expect(snapshot.querySelector('input[type="checkbox"]')?.hasAttribute('checked')).toBe(true);
  expect(snapshot.querySelector('textarea')?.textContent).toBe('current text');
  expect(snapshot.querySelectorAll('option')[1]?.hasAttribute('selected')).toBe(true);
  expect(snapshot.querySelector('details')?.hasAttribute('open')).toBe(true);
  expect(document.querySelector('[data-sniptale-live-state-id]')).toBeNull();
});

it('removes credential values while retaining ordinary live form state', () => {
  document.body.innerHTML = [
    '<input name="query" value="old">',
    '<input type="password" value="markup-secret">',
    '<input autocomplete="section-login one-time-code webauthn" value="markup-code">',
    '<input type="hidden" value="csrf-token">',
    '<input autocomplete="billing cc-number" value="4111111111111111">',
    '<input type="checkbox" autocomplete="one-time-code" checked>',
    '<textarea autocomplete="one-time-code" value="text-attribute-code">markup-text-code</textarea>',
    '<select autocomplete="cc-number" value="select-card">',
    '<option value="4111111111111111">4111111111111111</option>',
    '<option selected>12</option></select>',
  ].join('');
  const [query, password, oneTimeCode, hidden, card, sensitiveCheckbox] = Array.from(
    document.querySelectorAll('input')
  );
  if (!query || !password || !oneTimeCode || !hidden || !card || !sensitiveCheckbox) {
    throw new Error('Expected form controls');
  }
  query.value = 'current query';
  password.value = 'current-secret';
  oneTimeCode.value = '123456';
  hidden.value = 'current-csrf-token';
  card.value = '5555555555554444';
  sensitiveCheckbox.checked = true;
  const sensitiveTextarea = document.querySelector('textarea');
  const sensitiveSelect = document.querySelector('select');
  if (!sensitiveTextarea || !sensitiveSelect) throw new Error('Expected sensitive controls');
  sensitiveTextarea.value = 'current-text-code';
  sensitiveSelect.selectedIndex = 0;

  const marks = markPreparedSnapshotLiveState(document);
  const snapshot = new DOMParser().parseFromString(document.documentElement.outerHTML, 'text/html');
  expect(marks.materialize(snapshot)).toEqual([]);
  marks.cleanup();

  expect(snapshot.querySelector('input[name="query"]')?.getAttribute('value')).toBe(
    'current query'
  );
  expect(snapshot.querySelector('input[type="password"]')?.hasAttribute('value')).toBe(false);
  expect(
    snapshot
      .querySelector('input[autocomplete="section-login one-time-code webauthn"]')
      ?.hasAttribute('value')
  ).toBe(false);
  expect(snapshot.querySelector('input[type="hidden"]')?.hasAttribute('value')).toBe(false);
  expect(
    snapshot.querySelector('input[autocomplete="billing cc-number"]')?.hasAttribute('value')
  ).toBe(false);
  expect(
    snapshot
      .querySelector('input[type="checkbox"][autocomplete="one-time-code"]')
      ?.hasAttribute('checked')
  ).toBe(false);
  expect(snapshot.querySelector('textarea')?.textContent).toBe('');
  expect(snapshot.querySelector('textarea')?.hasAttribute('value')).toBe(false);
  expect(snapshot.querySelector('select')?.hasAttribute('value')).toBe(false);
  expect(snapshot.querySelector('select option')).toBeNull();
  expect(snapshot.querySelector('select')?.textContent).toBe('');
});

it('retains canvas pixels as an offline image-backed canvas layer', () => {
  document.body.innerHTML = '<canvas width="20" height="10"></canvas>';
  const canvas = document.querySelector('canvas');
  if (!canvas) throw new Error('Expected canvas');
  vi.spyOn(canvas, 'toDataURL').mockReturnValue('data:image/png;base64,cG5n');

  const marks = markPreparedSnapshotLiveState(document);
  const snapshot = new DOMParser().parseFromString(document.documentElement.outerHTML, 'text/html');
  expect(marks.materialize(snapshot)).toEqual([]);
  marks.cleanup();

  const captured = snapshot.querySelector('canvas');
  expect(captured?.getAttribute('data-sniptale-canvas-rasterized')).toBe('true');
  expect(captured?.getAttribute('style')).toContain('data:image/png;base64,cG5n');
});
