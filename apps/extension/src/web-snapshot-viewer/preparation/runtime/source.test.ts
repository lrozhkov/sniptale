// @vitest-environment jsdom

import { afterEach, expect, it } from 'vitest';
import type { WebSnapshotManifest } from '@sniptale/runtime-contracts/web-snapshot';
import { createPagePackageManifestFixture } from '../../../features/web-snapshot/manifest.test-support';
import { createViewerAiPickSourceResolver } from './source';

function createManifest(): WebSnapshotManifest {
  return createPagePackageManifestFixture({
    source: {
      faviconUrl: null,
      title: 'Saved Snapshot',
      url: 'https://saved.example/path',
    },
  });
}

afterEach(() => {
  document.body.replaceChildren();
});

it('resolves AI-pick source metadata from the snapshot iframe and manifest', () => {
  const iframe = document.createElement('iframe');
  document.body.appendChild(iframe);

  const source = createViewerAiPickSourceResolver(iframe, createManifest())();

  expect(source?.snapshotSource.document).toBe(iframe.contentDocument);
  expect(source?.snapshotSource.root).toBe(iframe.contentDocument!.body);
  expect(source?.snapshotSource.pageTitle).toBe('Saved Snapshot');
  expect(source?.snapshotSource.pageUrl).toBe('https://saved.example/path');
  expect(source?.snapshotSource.pageHostname).toBe('saved.example');
  expect(source?.targetIframe).toBe(iframe);
  if (!source?.acceptsTarget) {
    throw new Error('Expected viewer AI pick source.');
  }

  expect(source.acceptsTarget(iframe.contentDocument!.body)).toBe(true);
  expect(source.acceptsTarget(document.body)).toBe(false);
});
