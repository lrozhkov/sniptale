import { createScreenshotFilename as generateFilename } from '../../../workflows/file-naming/index';
import { loadSettings } from '../../../composition/persistence/settings';
import { downloadImageInServiceWorker } from '../download/index';
import { transitionCaptureJob } from '../jobs/state-machine';
import { readCaptureDeliveryPayload, type CaptureDeliveryPayload } from './payload';
import type { CaptureModeLabel, CompleteCapturePorts, DownloadCapturePorts } from './ports';

const defaultCompleteCapturePorts: CompleteCapturePorts = {
  transitionCaptureJob,
};

const defaultDownloadCapturePorts: DownloadCapturePorts = {
  downloadImageInServiceWorker,
  generateFilename,
  loadSettings,
};

export async function completeCaptureForCropUseCase(
  args: { capture: () => Promise<CaptureDeliveryPayload> },
  ports: CompleteCapturePorts = defaultCompleteCapturePorts
): Promise<{ dataUrl: string }> {
  const { dataUrl, jobId } = readCaptureDeliveryPayload(await args.capture());
  if (jobId) {
    await ports.transitionCaptureJob(jobId, 'completed');
  }
  return { dataUrl };
}

export async function downloadCapturedImageUseCase(
  args: {
    captureJobId?: string | undefined;
    dataUrl: string;
    mode: CaptureModeLabel;
  },
  ports: DownloadCapturePorts = defaultDownloadCapturePorts
): Promise<void> {
  const settings = await ports.loadSettings();
  const filename = await ports.generateFilename(args.mode, settings.imageFormat, settings);
  await ports.downloadImageInServiceWorker(args.dataUrl, filename, args.captureJobId);
}
