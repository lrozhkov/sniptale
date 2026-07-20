import { downloadCapturedImageUseCase } from '../application/complete-capture-use-case';

export async function downloadVisibleCapture(
  dataUrl: string,
  captureJobId?: string | undefined
): Promise<void> {
  await downloadCapturedImageUseCase({ captureJobId, dataUrl, mode: 'visible' });
}

export async function downloadFullPageCapture(
  dataUrl: string,
  captureJobId?: string | undefined
): Promise<void> {
  await downloadCapturedImageUseCase({ captureJobId, dataUrl, mode: 'full' });
}
