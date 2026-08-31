import { verifyScreenshotSurface } from './viewer-screenshot-verification.mjs';
import { verifyStaticSurface } from './viewer-static-verification.mjs';

export async function verifySnapshotViewer({
  assetId,
  context,
  extensionId,
  out,
  sourceAfterCapturePath,
  sourceAfterCaptureViewportScreenshot,
  sourceInfo,
  specName,
}) {
  const viewer = await context.newPage();
  await viewer.setViewportSize({ width: 1280, height: 800 });
  const viewerRequests = [];
  viewer.on('request', (request) => viewerRequests.push(request.url()));
  const viewerUrl =
    'chrome-extension://' +
    extensionId +
    '/apps/extension/src/web-snapshot-viewer/index.html?snapshotId=' +
    encodeURIComponent(assetId);
  await viewer.goto(viewerUrl);
  const frame = viewer.locator('iframe');
  await frame.waitFor({ state: 'visible', timeout: 30_000 });
  const defaultStaticVisible = await frame.isVisible();
  const screenshotProof = await verifyScreenshotSurface({ out, sourceInfo, specName, viewer });
  const staticProof = await verifyStaticSurface({
    context,
    frame,
    out,
    retainedBytes: screenshotProof.retainedBytes,
    sourceAfterCapturePath,
    sourceAfterCaptureViewportScreenshot,
    specName,
    viewer,
  });
  await viewer.close();
  return {
    defaultStaticVisible,
    retainedSensitivePixel: screenshotProof.retainedSensitivePixel,
    viewerExternalRequests: viewerRequests.filter(
      (url) =>
        !url.startsWith('chrome-extension://' + extensionId + '/') && !url.startsWith('blob:')
    ),
    visualInfo: screenshotProof.visualInfo,
    visualSignal: screenshotProof.visualSignal,
    ...staticProof,
  };
}
