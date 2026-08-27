import { enableWebSnapshotsForSmoke } from './popup-driver.mjs';
import { verifyGallery } from './gallery-verification.mjs';
import { captureSmokeSource } from './source-capture.mjs';
import { verifySnapshotViewer } from './viewer-verification.mjs';

export function createSmokeCaseVerifier({ context, out, popupUi }) {
  const state = { setupDialogGeometry: null };
  async function verifyCase(extensionId, popup, spec) {
    const source = await captureSmokeSource({ context, out, popup, popupUi, spec, state });
    const viewerProof = await verifySnapshotViewer({
      assetId: source.saved.assetId,
      context,
      extensionId,
      out,
      sourceAfterCapturePath: source.sourceAfterCapturePath,
      sourceAfterCaptureViewportScreenshot: source.sourceAfterCaptureViewportScreenshot,
      sourceInfo: source.sourceInfo,
      specName: spec.name,
    });
    const { previewInfo, thumbnailInfo } = await verifyGallery({ context, extensionId });
    const result = {
      assetId: source.saved.assetId,
      consoleErrors: source.consoleErrors,
      name: spec.name,
      previewInfo,
      popupProof: source.saved.popupProof ?? null,
      sourceInfo: source.sourceInfo,
      sourceAfterFullScreenshotInfo: source.sourceAfterFullScreenshotInfo,
      thumbnailInfo,
      url: source.target.url(),
      ...viewerProof,
      warnings: source.saved.warnings ?? [],
    };
    await source.target.close();
    return result;
  }
  return { enableWebSnapshotsForSmoke, verifyCase };
}
