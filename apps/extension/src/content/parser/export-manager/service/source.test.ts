// @vitest-environment jsdom

import { afterEach, expect, it, vi } from 'vitest';
import { createExportDiagnosticsSource } from './source';

afterEach(() => vi.unstubAllGlobals());

it('uses the live document for CSS diagnostics when a detached snapshot represents this page', () => {
  const detached = document.implementation.createHTMLDocument('detached');
  detached.body.innerHTML = '<main>Prepared snapshot</main>';

  expect(
    createExportDiagnosticsSource({ document: detached, pageUrl: location.href })
  ).toMatchObject({ document, view: window });
});

it('uses the live document when the current-page snapshot omits an explicit URL', () => {
  const detached = document.implementation.createHTMLDocument('detached');

  expect(createExportDiagnosticsSource({ document: detached })).toMatchObject({
    document,
    view: window,
  });
});

it('keeps a detached explicit document in an extension Viewer runtime', () => {
  const detached = document.implementation.createHTMLDocument('detached');
  vi.stubGlobal('window', {
    document,
    location: { protocol: 'chrome-extension:' },
  });

  expect(
    createExportDiagnosticsSource({ document: detached, pageUrl: 'https://snapshot.example/page' })
  ).toMatchObject({ document: detached, view: null });
});

it('keeps detached diagnostics when no ambient page runtime exists', () => {
  const detached = document.implementation.createHTMLDocument('detached');
  vi.stubGlobal('window', undefined);

  expect(createExportDiagnosticsSource({ document: detached })).toMatchObject({
    document: detached,
    view: null,
  });
});
