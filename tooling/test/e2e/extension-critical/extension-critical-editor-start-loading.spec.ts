import { test, expect } from '../support/extension-fixture';

test('image intake keeps the legacy empty canvas hidden during delayed loading and retry', async ({
  context,
  extensionId,
}, info) => {
  const page = await context.newPage();
  const url = `chrome-extension://${extensionId}/apps/extension/src/editor/index.html`;
  await page.goto(url);
  const start = page.locator('[data-ui="editor.page.start"]');
  await expect(start).toBeVisible();
  const image = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 90;
    canvas.getContext('2d')!.fillRect(0, 0, 160, 90);
    return canvas.toDataURL('image/png').split(',')[1]!;
  });
  await page.evaluate(() => {
    const original = FileReader.prototype.readAsDataURL;
    FileReader.prototype.readAsDataURL = function (blob) {
      document.addEventListener('release-image-read', () => original.call(this, blob), {
        once: true,
      });
    };
  });
  await start.locator('input[type="file"]').setInputFiles({
    name: 'delayed.png',
    mimeType: 'image/png',
    buffer: Buffer.from(image, 'base64'),
  });
  await expect(page.locator('[data-ui="editor.page.open-loading"]')).toBeVisible();
  await page.screenshot({ path: info.outputPath('delayed-image-loading.png') });
  await expect(page.locator('[data-ui="editor.canvas.empty-dropzone"]')).toBeHidden();
  await expect(page.locator('[data-ui="editor.canvas.layer"] canvas').first()).toBeAttached();
  await page.evaluate(() => document.dispatchEvent(new Event('release-image-read')));
  await expect(page.locator('[data-ui="editor.page.open-loading"]')).toBeHidden();
  await expect(start).toBeHidden();
  await expect(page.locator('[data-ui="editor.canvas.layer"]')).toBeVisible();
  await page.goto(url);
  await expect(start).toBeVisible();
  await expect(page.locator('[data-ui="editor.canvas.empty-dropzone"]')).toBeHidden();
  await start.locator('input[type="file"]').setInputFiles({
    name: 'broken.png',
    mimeType: 'image/png',
    buffer: Buffer.from('invalid image'),
  });
  await expect(page.locator('[data-ui="editor.page.open-error"]')).toBeVisible();
  await expect(start).toBeVisible();
  await expect(page.locator('[data-ui="editor.canvas.empty-dropzone"]')).toBeHidden();
  await start.locator('input[type="file"]').setInputFiles({
    name: 'retry.png',
    mimeType: 'image/png',
    buffer: Buffer.from(image, 'base64'),
  });
  await expect(start).toBeHidden();
  await expect(page.locator('[data-ui="editor.page.open-error"]')).toBeHidden();
  await expect(page.locator('[data-ui="editor.canvas.layer"]')).toBeVisible();
});

for (const editor of ['video-editor', 'scenario-editor']) {
  test(`${editor} has one current start on cold entry and reload`, async ({
    context,
    extensionId,
  }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/apps/extension/src/${editor}/index.html`);
    await expect(page.locator('[data-ui="editor.start"]')).toHaveCount(1);
    await expect(page.locator('[data-ui="editor.start"]')).toBeVisible();
    await page.reload();
    await expect(page.locator('[data-ui="editor.start"]')).toHaveCount(1);
    await expect(page.locator('[data-ui="editor.start"]')).toBeVisible();
  });
}
