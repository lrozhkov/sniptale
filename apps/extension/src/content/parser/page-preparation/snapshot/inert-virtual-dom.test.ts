// @vitest-environment jsdom

import { afterEach, expect, it } from 'vitest';
import { buildInertPreparedSnapshotVirtualDom } from './inert-virtual-dom';

afterEach(() => {
  document.head.replaceChildren();
  document.body.replaceChildren();
});

it('imports live DOM node-for-node without parsing, fetching, or structural normalization', () => {
  const paragraph = document.createElement('p');
  const nestedBlock = document.createElement('div');
  nestedBlock.textContent = 'Programmatic block child';
  paragraph.append(nestedBlock);

  const table = document.createElement('table');
  const row = document.createElement('tr');
  row.append(document.createElement('td'));
  table.append(row);

  const pre = document.createElement('pre');
  pre.textContent = 'first\rsecond';
  const noScript = document.createElement('noscript');
  noScript.textContent = '<img src="https://attacker.example/capture">';
  document.body.append(paragraph, table, pre, noScript);

  const snapshot = buildInertPreparedSnapshotVirtualDom(document, document.body);

  expect(snapshot.document.defaultView).toBeNull();
  expect(snapshot.root.querySelector('p > div')?.textContent).toBe('Programmatic block child');
  expect(snapshot.root.querySelector('table > tr')).not.toBeNull();
  expect(snapshot.root.querySelector('pre')?.textContent).toBe('first\rsecond');
  expect(snapshot.root.querySelector('noscript')?.textContent).toBe(
    '<img src="https://attacker.example/capture">'
  );
  expect(snapshot.root.querySelector('noscript img')).toBeNull();
  expect(snapshot.resolveOriginalElement(snapshot.root.querySelector('p > div')!)).toBe(
    nestedBlock
  );
});
