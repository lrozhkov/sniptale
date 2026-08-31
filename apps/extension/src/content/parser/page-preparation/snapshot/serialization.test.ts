// @vitest-environment jsdom

import { expect, it } from 'vitest';
import { serializePreparedSnapshotDocument } from './sanitizer';

it('uses XHTML when HTML parsing would normalize the captured live DOM', () => {
  const snapshot = document.implementation.createHTMLDocument('Unstable DOM');
  const paragraph = snapshot.createElement('p');
  paragraph.append(snapshot.createElement('div'));
  const table = snapshot.createElement('table');
  table.append(snapshot.createElement('tr'));
  const pre = snapshot.createElement('pre');
  pre.textContent = 'first\rsecond';
  snapshot.body.append(paragraph, table, pre);

  const serialized = serializePreparedSnapshotDocument(snapshot, {
    preferParseStableHtml: true,
  });
  const restored = new DOMParser().parseFromString(serialized, 'application/xhtml+xml');

  expect(serialized).toMatch(/^<\?xml/u);
  expect(restored.querySelector('p > div')).not.toBeNull();
  expect(restored.querySelector('table > tr')).not.toBeNull();
  expect(restored.querySelector('pre')?.textContent).toBe('first\rsecond');
});

it('keeps parse-stable open-shadow snapshots as HTML for declarative shadow restoration', () => {
  const snapshot = document.implementation.createHTMLDocument('Shadow DOM');
  const host = snapshot.createElement('snapshot-host');
  const boundary = snapshot.createElement('template');
  boundary.setAttribute('shadowrootmode', 'open');
  boundary.content.append(snapshot.createElement('span'));
  host.append(boundary);
  snapshot.body.append(host);

  const serialized = serializePreparedSnapshotDocument(snapshot, {
    preferParseStableHtml: true,
  });

  expect(serialized).toMatch(/^<!doctype html>/u);
  expect(serialized).toContain('<template shadowrootmode="open"><span></span></template>');
});

it('uses XHTML for parser-unstable DOM while retaining boundaries for viewer hydration', () => {
  const snapshot = document.implementation.createHTMLDocument('Mixed DOM');
  const paragraph = snapshot.createElement('p');
  paragraph.append(snapshot.createElement('div'));
  const host = snapshot.createElement('snapshot-host');
  const boundary = snapshot.createElement('template');
  boundary.setAttribute('shadowrootmode', 'open');
  host.append(boundary);
  snapshot.body.append(paragraph, host);

  const serialized = serializePreparedSnapshotDocument(snapshot, {
    preferParseStableHtml: true,
  });
  const restored = new DOMParser().parseFromString(serialized, 'application/xhtml+xml');

  expect(serialized).toMatch(/^<\?xml/u);
  expect(restored.querySelector('p > div')).not.toBeNull();
  expect(restored.querySelector('template[shadowrootmode="open"]')).not.toBeNull();
});
