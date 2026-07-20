import { expect, it } from 'vitest';

import { isPopupExportOptions } from './options';

it('accepts only complete popup export option records with boolean flags', () => {
  expect(
    isPopupExportOptions({
      includeJson: true,
      includeMarkdown: true,
      includeFiles: false,
      includeImages: true,
      includeBasicLogs: false,
      includeHarDomLogs: true,
      includeCssDiagnostics: false,
      includeFullPageScreenshot: true,
    })
  ).toBe(true);
  expect(
    isPopupExportOptions({
      includeJson: true,
      includeMarkdown: true,
      includeFiles: false,
      includeImages: true,
      includeBasicLogs: false,
      includeHarDomLogs: true,
      includeCssDiagnostics: 'no',
      includeFullPageScreenshot: true,
    })
  ).toBe(false);
});
