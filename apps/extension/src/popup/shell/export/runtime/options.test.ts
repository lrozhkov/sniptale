import { expect, it } from 'vitest';

import { buildPopupExportOptions } from './options';

it('builds export options from the selected artifacts', () => {
  expect(
    buildPopupExportOptions({
      includeBasicLogs: true,
      includeCssDiagnostics: false,
      includeFiles: true,
      includeFullPageScreenshot: false,
      includeHarDomLogs: true,
      includeImages: false,
      includeJson: true,
      includeMarkdown: false,
    })
  ).toEqual({
    includeBasicLogs: true,
    includeCssDiagnostics: false,
    includeFiles: true,
    includeFullPageScreenshot: false,
    includeHarDomLogs: true,
    includeImages: false,
    includeJson: true,
    includeMarkdown: false,
  });
});
