// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Blob as NodeBlob } from 'node:buffer';
import type { PagePackageEntry } from '@sniptale/runtime-contracts/page-package';
import { sanitizeImportedPagePackageEntry } from './sanitize-content';

beforeEach(() => {
  vi.stubGlobal('Blob', NodeBlob);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it('retains validated local SVG sprite fragments while re-sanitizing imported HTML', async () => {
  const source = [
    '<!doctype html>',
    '<style>.approve { background-image: url("../assets/icons.svg#approve"); }</style>',
    '<svg><use href="../assets/icons.svg#approve"></use>',
    '<use xlink:href="../assets/icons.svg#reject"></use></svg>',
  ].join('');
  const entry = {
    component: 'webCopy',
    mimeType: 'text/html',
    path: 'snapshot/index.html',
    sha256: '0'.repeat(64),
    size: source.length,
  } satisfies PagePackageEntry;

  const sanitized = await sanitizeImportedPagePackageEntry({
    assetPaths: new Set(['assets/icons.svg']),
    blob: new Blob([source], { type: 'text/html' }),
    entry,
    sourceUrl: 'https://example.test/',
  });
  const html = await sanitized.text();

  expect(html).toContain('url("assets/icons.svg#approve")');
  expect(html).toContain('href="assets/icons.svg#approve"');
  expect(html).toContain('xlink:href="assets/icons.svg#reject"');
});
