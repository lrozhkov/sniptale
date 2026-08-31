export async function verifyGallery({ context, extensionId }) {
  const gallery = await context.newPage();
  await gallery.setViewportSize({ width: 1280, height: 800 });
  await gallery.goto(
    `chrome-extension://${extensionId}/apps/extension/src/gallery/index.html?folder=web-snapshot`
  );
  await gallery
    .locator('[data-ui="gallery.page.root"]')
    .waitFor({ state: 'visible', timeout: 30_000 });
  const cardButton = gallery
    .locator('[data-ui="gallery.grid.thumbnail-viewport"] > button')
    .first();
  await cardButton.waitFor({ state: 'visible', timeout: 30_000 });
  const card = cardButton.locator('..');
  const thumbnail = card.locator('img').first();
  await thumbnail.waitFor({ state: 'visible', timeout: 30_000 });
  const thumbnailInfo = await thumbnail.evaluate((image) => ({
    naturalHeight: image.naturalHeight,
    naturalWidth: image.naturalWidth,
    src: image.src.slice(0, 5),
  }));
  await cardButton.click();
  const preview = gallery.locator('[data-ui="gallery.preview.surface"] img').first();
  await preview.waitFor({ state: 'visible', timeout: 30_000 });
  const previewInfo = await preview.evaluate((image) => ({
    naturalHeight: image.naturalHeight,
    naturalWidth: image.naturalWidth,
    src: image.src.slice(0, 5),
  }));

  await gallery.close();
  return { previewInfo, thumbnailInfo };
}
