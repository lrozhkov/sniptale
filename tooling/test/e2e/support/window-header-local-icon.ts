import { writeFile } from 'node:fs/promises';
import { betaV1Fixture } from '../../../../apps/extension/src/composition/persistence/infrastructure/indexed-db/fixtures/beta-v1';
import { parseVideoWorkspace } from '../../../../apps/extension/src/composition/persistence/review-workspaces/parser';
import { expect, type Locator, type Page } from '@playwright/test';
import { translate } from '../../../../apps/extension/src/platform/i18n';

/** Exercises the real native chooser and decoder shared by all three editors. Leaves a file icon selected. */
export async function checkLocalWindowIcon(page: Page, settings: Locator, locale: 'en' | 'ru') {
  const label = (key: Parameters<typeof translate>[0]) => translate(key, locale);
  const folder = settings.getByRole('button', {
    name: label('windowHeader.fileIcon'),
    exact: true,
  });
  const site = settings.getByRole('button', { name: label('windowHeader.favicon'), exact: true });
  const input = settings.locator('input[type="file"]');
  await folder.scrollIntoViewIfNeeded();
  await expect(folder).toHaveAttribute('aria-pressed', 'false');
  const chooserPromise = page.waitForEvent('filechooser');
  await folder.click();
  const chooser = await chooserPromise;
  expect(chooser.isMultiple()).toBe(false);
  await chooser.setFiles({
    name: 'custom.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 80"><rect width="40" height="80" fill="#e02070"/></svg>'
    ),
  });
  await expect(folder).toHaveAttribute('aria-pressed', 'true');
  await expect(site).toHaveAttribute('aria-pressed', 'false');
  const address = settings.getByRole('textbox', {
    name: label('windowHeader.address'),
    exact: true,
  });
  await address.fill('custom-icon.example');
  await address.press('Enter');
  await expect(folder).toHaveAttribute('aria-pressed', 'true');
  const geometry = await Promise.all([folder.boundingBox(), site.boundingBox()]);
  expect(geometry[0]!.height).toBe(geometry[1]!.height);
  expect(geometry[0]!.width).toBe(geometry[1]!.width);
  expect(geometry[0]!.y).toBe(geometry[1]!.y);
  expect(geometry[0]!.x).toBeGreaterThan(geometry[1]!.x);
  await folder.click();
  await expect(folder).toHaveAttribute('aria-pressed', 'false');
  await input.setInputFiles({
    name: 'broken.png',
    mimeType: 'image/png',
    buffer: Buffer.from('not an image'),
  });
  await expect(settings.getByRole('alert')).toBeVisible();
  await expect(folder).toHaveAttribute('aria-pressed', 'false');
  // ICO containing a PNG is decoded by the browser, independently of the SVG path above.
  const encoded = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 32;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#e02070';
    context.fillRect(0, 0, 32, 32);
    context.fillStyle = 'white';
    context.fillRect(7, 6, 5, 21);
    context.fillRect(7, 6, 19, 5);
    context.fillRect(7, 15, 14, 5);
    return canvas.toDataURL('image/png').split(',')[1]!;
  });
  const png = Buffer.from(encoded, 'base64');
  const directory = Buffer.alloc(22);
  directory.writeUInt16LE(1, 2);
  directory.writeUInt16LE(1, 4);
  directory[6] = 32;
  directory[7] = 32;
  directory.writeUInt16LE(1, 10);
  directory.writeUInt16LE(32, 12);
  directory.writeUInt32LE(png.length, 14);
  directory.writeUInt32LE(22, 18);
  await input.setInputFiles({
    name: 'custom.ico',
    mimeType: 'image/x-icon',
    buffer: Buffer.concat([directory, png]),
  });
  await expect(folder).toHaveAttribute('aria-pressed', 'true');
  await expect(settings.getByRole('alert')).toHaveCount(0);
  await expect
    .poll(() => settings.evaluate((node) => node.scrollWidth - node.clientWidth))
    .toBeLessThanOrEqual(1);
}

/** Reads the committed quick-editor history rather than assuming how consecutive edits coalesce. */
export async function persistedQuickHeader(page: Page) {
  const raw = await page.evaluate(
    async ({ databaseName, aggregateId }) => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(databaseName);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        return await new Promise<unknown>((resolve, reject) => {
          const request = database
            .transaction('video_workspaces')
            .objectStore('video_workspaces')
            .get(aggregateId);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
      } finally {
        database.close();
      }
    },
    {
      databaseName: betaV1Fixture.databaseName,
      aggregateId: `recording:${betaV1Fixture.records.recordings[0].id}`,
    }
  );
  const workspace = parseVideoWorkspace(raw);
  const operation = workspace?.history
    .slice(0, workspace.cursor)
    .findLast((entry) => entry.target === 'advancedContent');
  return operation?.target === 'advancedContent' ? (operation.after.windowHeader ?? null) : null;
}

/** Checks actual composited preview pixels, excluding inspector controls and retained source metadata. */
export async function checkRenderedWindowIcon(
  page: Page,
  surface: Locator,
  outputPath: string,
  topFraction = 0.2
) {
  let pixels = '';
  await expect
    .poll(
      async () => {
        const screenshot = await surface.screenshot();
        const result = await page.evaluate(
          async ({ encoded, topFraction }) => {
            const image = new Image();
            image.src = `data:image/png;base64,${encoded}`;
            await image.decode();
            const canvas = document.createElement('canvas');
            canvas.width = image.width;
            canvas.height = image.height;
            const context = canvas.getContext('2d')!;
            context.drawImage(image, 0, 0);
            const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
            let count = 0,
              left = canvas.width,
              top = canvas.height,
              right = 0,
              bottom = 0;
            for (let i = 0; i < data.length * topFraction; i += 4) {
              const red = data[i]!,
                green = data[i + 1]!,
                blue = data[i + 2]!;
              // Fitted favicons blend with the pale tab; identify the pink hue after antialiasing.
              if (red < 160 || red - green < 50 || blue - green < 25 || red - blue < 25) continue;
              const x = (i / 4) % canvas.width,
                y = Math.floor(i / 4 / canvas.width);
              count++;
              left = Math.min(left, x);
              right = Math.max(right, x);
              top = Math.min(top, y);
              bottom = Math.max(bottom, y);
            }
            if (count < 4 || right - left > 80 || bottom - top > 80) return { count: 0, crop: '' };
            const x = Math.max(0, left - 20),
              y = Math.max(0, top - 10);
            const width = Math.min(canvas.width - x, 300),
              height = Math.min(canvas.height - y, 70);
            const crop = document.createElement('canvas');
            crop.width = width * 3;
            crop.height = height * 3;
            const zoom = crop.getContext('2d')!;
            zoom.imageSmoothingEnabled = false;
            zoom.drawImage(canvas, x, y, width, height, 0, 0, crop.width, crop.height);
            return { count, crop: crop.toDataURL('image/png').split(',')[1]! };
          },
          { encoded: screenshot.toString('base64'), topFraction }
        );
        pixels = result.crop;
        return result.count;
      },
      { message: 'Custom pink F must be visible in the actual rendered header' }
    )
    .toBeGreaterThanOrEqual(4);
  await writeFile(outputPath, Buffer.from(pixels, 'base64'));
}
