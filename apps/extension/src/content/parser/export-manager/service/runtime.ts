import type { ExportOptions, ExportProgress } from '@sniptale/runtime-contracts/export';
import { translate } from '../../../../platform/i18n';
import type { ContentPrivilegedActionIntentSource } from '../../../platform/privileged-action-intent/client';
import {
  captureFullPageScreenshotAsset,
  startExportHarCapture,
  stopExportHarCapture,
} from '../diagnostics';
import type { ExportHarCaptureHandle, ExportHarCaptureResult } from '../diagnostics';
import type { ArchiveAsset } from '../archive';

export function getExportErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export async function captureOptionalArchiveAssets(args: {
  contentIntentSource?: ContentPrivilegedActionIntentSource | undefined;
  options: ExportOptions;
  updateProgress: (progress: Partial<ExportProgress>) => void;
  warnings: string[];
}): Promise<ArchiveAsset[]> {
  const assets: ArchiveAsset[] = [];
  if (!args.options.includeFullPageScreenshot) {
    return assets;
  }

  args.updateProgress({
    activeStepKey: 'fullPageScreenshot',
    phase: 'scanning',
    message: translate('content.runtime.captureFullPageScreenshot'),
    current: 0,
    total: 0,
  });

  try {
    assets.push(await captureFullPageScreenshotAsset(args.contentIntentSource));
  } catch (error) {
    args.warnings.push(
      getExportErrorMessage(error, translate('content.runtime.captureFullPageScreenshotFailed'))
    );
  }

  return assets;
}

export async function startHarCaptureIfNeeded(
  harSessionId: string | null,
  warnings: string[]
): Promise<ExportHarCaptureHandle | null> {
  if (!harSessionId) {
    return null;
  }

  try {
    return await startExportHarCapture(harSessionId);
  } catch (error) {
    warnings.push(getExportErrorMessage(error, translate('content.runtime.harUnavailable')));
    return null;
  }
}

export async function stopHarCaptureIfNeeded(
  handle: ExportHarCaptureHandle | null,
  warnings: string[]
): Promise<ExportHarCaptureResult | null> {
  if (!handle) {
    return null;
  }

  try {
    return await stopExportHarCapture(handle);
  } catch (error) {
    warnings.push(getExportErrorMessage(error, translate('content.runtime.harFinalizeFailed')));
    return null;
  }
}
