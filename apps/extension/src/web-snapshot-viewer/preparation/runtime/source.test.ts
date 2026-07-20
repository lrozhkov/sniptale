// @vitest-environment jsdom

import { afterEach, expect, it } from 'vitest';
import {
  WebSnapshotCaptureMode,
  type WebSnapshotManifest,
} from '@sniptale/runtime-contracts/web-snapshot';
import { createViewerAiPickSourceResolver } from './source';

function createManifest(): WebSnapshotManifest {
  return {
    capturedAt: '2026-05-13T00:00:00.000Z',
    captureMode: WebSnapshotCaptureMode.ReadOnlyNoScripts,
    id: 'snapshot-1',
    paths: {
      computedStyles: 'computed.css',
      domSnapshot: 'dom.json',
      errors: 'errors.json',
      manifest: 'manifest.json',
      screenshot: 'screenshot.png',
      snapshotHtml: 'index.html',
      stylesheets: 'styles.css',
      virtualDomSnapshot: 'virtual.json',
    },
    schemaVersion: 1,
    source: {
      faviconUrl: null,
      title: 'Saved Snapshot',
      url: 'https://saved.example/path',
    },
    stats: { assetCount: 0, failedAssetCount: 0, packageSize: 1 },
    warnings: [],
  };
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
