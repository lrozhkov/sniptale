// @vitest-environment jsdom

import { afterEach, expect, it } from 'vitest';
import { buildPreparedSnapshotDocument } from './builder';

afterEach(() => {
  document.head.replaceChildren();
  document.body.replaceChildren();
  document.body.removeAttribute('class');
  document.body.removeAttribute('style');
  document.body.removeAttribute('data-sniptale-prev-user-select');
  document.body.removeAttribute('data-sniptale-prev-webkit-user-select');
});

it('drops highlighter interaction locks while preserving the page selection style', async () => {
  document.body.className = [
    'page-shell',
    'sniptale-highlighter-mode',
    'sniptale-navigation-locked',
    'sniptale-no-select',
  ].join(' ');
  document.body.setAttribute('data-sniptale-prev-user-select', 'text');
  document.body.setAttribute('data-sniptale-prev-webkit-user-select', 'text');
  document.body.style.userSelect = 'none';
  document.body.style.webkitUserSelect = 'none';
  document.body.innerHTML = '<p>Select this snapshot text</p>';

  const result = await buildPreparedSnapshotDocument({ iframeTimeoutMs: 20 });

  expect(result.document.body.className).toBe('page-shell');
  expect(result.document.body.style.userSelect).toBe('text');
  expect(result.document.body.style.webkitUserSelect).toBe('text');
  expect(result.html).not.toContain('data-sniptale-prev-user-select');
  expect(result.html).not.toContain('data-sniptale-prev-webkit-user-select');
  expect(document.body.classList.contains('sniptale-highlighter-mode')).toBe(true);
  expect(document.body.style.userSelect).toBe('none');
});
