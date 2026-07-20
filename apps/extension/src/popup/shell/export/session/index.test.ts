import { expect, it } from 'vitest';
import { getCanExport } from './';

const baseArgs = {
  exportDisabledReason: null,
  includeBasicLogs: false,
  includeCssDiagnostics: false,
  includeFiles: false,
  includeFullPageScreenshot: false,
  includeHarDomLogs: false,
  includeImages: false,
  includeJson: false,
  includeMarkdown: false,
  isExporting: false,
  selectedCount: 1,
};

it('allows export with only basic logs enabled', () => {
  expect(
    getCanExport({
      ...baseArgs,
      includeBasicLogs: true,
    })
  ).toBe(true);
});

it('allows export with only HAR + DOM enabled', () => {
  expect(
    getCanExport({
      ...baseArgs,
      includeHarDomLogs: true,
    })
  ).toBe(true);
});

it('allows export with only CSS diagnostics enabled', () => {
  expect(
    getCanExport({
      ...baseArgs,
      includeCssDiagnostics: true,
    })
  ).toBe(true);
});

it('allows export with only full-page screenshot enabled', () => {
  expect(
    getCanExport({
      ...baseArgs,
      includeFullPageScreenshot: true,
    })
  ).toBe(true);
});

it('allows export with only files enabled', () => {
  expect(
    getCanExport({
      ...baseArgs,
      includeFiles: true,
    })
  ).toBe(true);
});

it('requires at least one selected tab', () => {
  expect(
    getCanExport({
      ...baseArgs,
      includeJson: true,
      selectedCount: 0,
    })
  ).toBe(false);
});

it('treats images as an effective artifact without files', () => {
  expect(
    getCanExport({
      ...baseArgs,
      includeImages: true,
    })
  ).toBe(true);
});
