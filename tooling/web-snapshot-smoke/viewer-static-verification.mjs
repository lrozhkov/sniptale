import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { inspectDocument, inspectFrameBodyCascade } from './document-inspection.mjs';
import { compareScreenshots, cropScreenshot } from './pixel-comparison.mjs';

export async function verifyStaticSurface({
  context,
  frame,
  out,
  retainedBytes,
  sourceAfterCapturePath,
  sourceAfterCaptureViewportScreenshot,
  specName,
  viewer,
}) {
  const staticButton = viewer.getByRole('button', {
    name: /Static document|Статический документ/i,
  });
  await staticButton.click();
  await frame.waitFor({ state: 'visible', timeout: 30_000 });
  await viewer.waitForTimeout(750);
  const frameHandle = await frame.elementHandle();
  const contentFrame = await frameHandle?.contentFrame();
  if (!contentFrame) throw new Error('Static document frame is unavailable');
  await contentFrame.evaluate(() =>
    Promise.race([
      globalThis.document.fonts.ready,
      new Promise((resolve) => setTimeout(resolve, 5000)),
    ])
  );
  const staticInfo = await inspectDocument(contentFrame);
  const projectedLink = contentFrame.locator('a[data-sniptale-external-href]').first();
  let externalLinkProof = null;
  if ((await projectedLink.count()) > 0) {
    const projectedHref = await projectedLink.getAttribute('data-sniptale-external-href');
    const executableHref = await projectedLink.getAttribute('href');
    const openedPagePromise = context.waitForEvent('page');
    await projectedLink.click();
    const openedPage = await openedPagePromise;
    await openedPage.waitForLoadState('domcontentloaded').catch(() => undefined);
    externalLinkProof = {
      executableHref,
      openedUrl: openedPage.url(),
      projectedHref,
    };
    await openedPage.close();
  }
  staticInfo.bodyCascade = await inspectFrameBodyCascade(context, viewer);
  staticInfo.framePresentation = await frame.evaluate((iframe) => {
    const style = globalThis.getComputedStyle(iframe);
    const rect = iframe.getBoundingClientRect();
    return {
      height: rect.height,
      width: rect.width,
      transform: style.transform,
      zoom: style.zoom,
    };
  });
  const staticViewportScreenshot = await frame.screenshot({ animations: 'disabled' });
  await writeFile(join(out, `${specName}-static-viewport.png`), staticViewportScreenshot);
  const viewportPixel = await compareScreenshots(
    context,
    sourceAfterCaptureViewportScreenshot,
    staticViewportScreenshot
  );
  const staticDocumentHtml = await frame.getAttribute('srcdoc');
  const staticFrameUrl = await frame.getAttribute('src');
  if (!staticDocumentHtml && !staticFrameUrl)
    throw new Error('Static document source is unavailable');
  await writeFile(join(out, `${specName}-static.html`), await contentFrame.content(), 'utf8');
  const scrollStep = Math.max(1, Math.floor(staticInfo.viewportHeight * 0.8));
  for (let top = 0; top < staticInfo.documentHeight; top += scrollStep) {
    await contentFrame.evaluate((nextTop) => globalThis.scrollTo(0, nextTop), top);
    await viewer.waitForTimeout(25);
  }
  await contentFrame.evaluate(() => globalThis.scrollTo(0, 0));
  await viewer.waitForTimeout(25);
  const preserveVerticalScrollbar = staticInfo.documentWidth < staticInfo.viewportWidth;
  if (preserveVerticalScrollbar) {
    await contentFrame.evaluate(() =>
      globalThis.document.documentElement.style.setProperty('overflow-y', 'scroll', 'important')
    );
  }
  await frame.evaluate((iframe, height) => {
    iframe.style.height = `${height}px`;
    iframe.style.maxHeight = 'none';
  }, staticInfo.documentHeight);
  await viewer.setViewportSize({
    width: staticInfo.viewportWidth,
    height: staticInfo.documentHeight + 400,
  });
  await viewer.waitForTimeout(250);
  const staticFullFrameScreenshot = await frame.screenshot({ animations: 'disabled' });
  const staticFullScreenshot = preserveVerticalScrollbar
    ? await cropScreenshot(
        context,
        staticFullFrameScreenshot,
        staticInfo.documentWidth,
        staticInfo.documentHeight
      )
    : staticFullFrameScreenshot;
  await writeFile(join(out, `${specName}-static-full.png`), staticFullScreenshot);
  const sourceFullScreenshot = await readFile(sourceAfterCapturePath);
  const sourceFullPagePixel = await compareScreenshots(
    context,
    sourceFullScreenshot,
    staticFullScreenshot
  );
  const fullPagePixel = await compareScreenshots(context, retainedBytes, staticFullScreenshot);

  await viewer.getByRole('button', { name: /^(Attachments|Вложения)$/i }).click();
  const assetCatalog = viewer.getByTestId('snapshot-asset-catalog');
  await assetCatalog.waitFor({ state: 'visible', timeout: 30_000 });
  const assetCatalogInfo = {
    cards: await assetCatalog.locator('article').count(),
    images: await assetCatalog.locator('article img').count(),
  };

  return {
    assetCatalogInfo,
    externalLinkProof,
    fullPagePixel,
    sourceFullPagePixel,
    staticInfo,
    viewportPixel,
  };
}
