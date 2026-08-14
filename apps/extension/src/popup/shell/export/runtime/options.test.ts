import { expect, it } from 'vitest';

import { buildPopupExportOptions } from './options';

it('preserves the legacy options payload when annotations are disabled', () => {
  expect(
    buildPopupExportOptions({
      includeAnnotations: false,
      includeBasicLogs: true,
      includeCssDiagnostics: false,
      includeFiles: true,
      includeFullPageScreenshot: false,
      includePageDiagnostics: true,
      includeImages: false,
      includeJson: true,
      includeMarkdown: false,
    })
  ).toEqual({
    includeBasicLogs: true,
    includeCssDiagnostics: false,
    includeFiles: true,
    includeFullPageScreenshot: false,
    includePageDiagnostics: true,
    includeImages: false,
    includeJson: true,
    includeMarkdown: false,
  });
});

it('adds annotations to the options payload only when selected', () => {
  expect(
    buildPopupExportOptions({
      includeAnnotations: true,
      includeBasicLogs: false,
      includeCssDiagnostics: false,
      includeFiles: false,
      includeFullPageScreenshot: false,
      includePageDiagnostics: false,
      includeImages: false,
      includeJson: false,
      includeMarkdown: false,
    })
  ).toEqual({
    includeAnnotations: true,
    includeBasicLogs: false,
    includeCssDiagnostics: false,
    includeFiles: false,
    includeFullPageScreenshot: false,
    includePageDiagnostics: false,
    includeImages: false,
    includeJson: false,
    includeMarkdown: false,
  });
});
