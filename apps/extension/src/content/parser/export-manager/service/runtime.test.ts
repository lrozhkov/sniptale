import { beforeEach, expect, it, vi } from 'vitest';

import { translate } from '../../../../platform/i18n';

const diagnosticsMocks = vi.hoisted(() => ({
  captureFullPageScreenshotAsset: vi.fn(),
  startExportHarCapture: vi.fn(),
  stopExportHarCapture: vi.fn(),
}));

vi.mock('../diagnostics', () => diagnosticsMocks);

import {
  captureOptionalArchiveAssets,
  getExportErrorMessage,
  startHarCaptureIfNeeded,
  stopHarCaptureIfNeeded,
} from './runtime';

function createExportOptions(
  overrides: Partial<{
    includeFullPageScreenshot: boolean;
  }> = {}
) {
  return {
    includeBasicLogs: false,
    includeCssDiagnostics: false,
    includeFiles: true,
    includeFullPageScreenshot: false,
    includeHarDomLogs: false,
    includeImages: true,
    includeJson: true,
    includeMarkdown: true,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

it('formats error messages from real Error instances and unknown values', () => {
  expect(getExportErrorMessage(new Error('boom'), 'fallback')).toBe('boom');
  expect(getExportErrorMessage('nope', 'fallback')).toBe('fallback');
});

it('captures optional screenshot assets only when the option is enabled', async () => {
  const updateProgress = vi.fn();
  const asset = {
    path: 'page-screenshot.png',
    content: new Blob(['png']),
  };
  diagnosticsMocks.captureFullPageScreenshotAsset.mockResolvedValue(asset);

  await expect(
    captureOptionalArchiveAssets({
      options: createExportOptions(),
      updateProgress,
      warnings: [],
    })
  ).resolves.toEqual([]);

  const warnings: string[] = [];
  await expect(
    captureOptionalArchiveAssets({
      options: createExportOptions({ includeFullPageScreenshot: true }),
      updateProgress,
      warnings,
    })
  ).resolves.toEqual([asset]);

  expect(updateProgress).toHaveBeenCalledWith({
    activeStepKey: 'fullPageScreenshot',
    phase: 'scanning',
    message: translate('content.runtime.captureFullPageScreenshot'),
    current: 0,
    total: 0,
  });
  expect(warnings).toEqual([]);
  expect(diagnosticsMocks.captureFullPageScreenshotAsset).toHaveBeenCalledTimes(1);
});

it('records warnings when optional screenshot capture fails', async () => {
  diagnosticsMocks.captureFullPageScreenshotAsset.mockRejectedValue(new Error('capture failed'));

  const warnings: string[] = [];
  const assets = await captureOptionalArchiveAssets({
    options: createExportOptions({ includeFullPageScreenshot: true }),
    updateProgress: vi.fn(),
    warnings,
  });

  expect(assets).toEqual([]);
  expect(warnings).toEqual(['capture failed']);
});

it('starts HAR capture only for active sessions and surfaces failures as warnings', async () => {
  const warnings: string[] = [];
  const handle = {
    capabilityToken: 'har-token',
    expiresAtEpochMs: 123,
    sessionId: 'session-1',
  };
  diagnosticsMocks.startExportHarCapture.mockResolvedValue(handle);

  await expect(startHarCaptureIfNeeded(null, warnings)).resolves.toBeNull();
  await expect(startHarCaptureIfNeeded('session-1', warnings)).resolves.toBe(handle);

  diagnosticsMocks.startExportHarCapture.mockRejectedValue('offline');

  await expect(startHarCaptureIfNeeded('session-2', warnings)).resolves.toBeNull();
  expect(warnings).toEqual([translate('content.runtime.harUnavailable')]);
});

it('stops HAR capture only for active sessions and converts errors into warnings', async () => {
  const warnings: string[] = [];
  const handle = {
    capabilityToken: 'har-token',
    expiresAtEpochMs: 123,
    sessionId: 'session-1',
  };
  diagnosticsMocks.stopExportHarCapture.mockResolvedValue({ entries: [] });

  await expect(stopHarCaptureIfNeeded(null, warnings)).resolves.toBeNull();
  await expect(stopHarCaptureIfNeeded(handle, warnings)).resolves.toEqual({ entries: [] });

  diagnosticsMocks.stopExportHarCapture.mockRejectedValue(new Error('stop failed'));

  await expect(
    stopHarCaptureIfNeeded({ ...handle, sessionId: 'session-2' }, warnings)
  ).resolves.toBeNull();
  expect(warnings).toEqual(['stop failed']);
});
