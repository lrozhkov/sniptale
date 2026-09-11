import { expect, type Page } from '@playwright/test';

export async function assertVisualAcceptance(page: Page): Promise<void> {
  await expect(page.locator('main section#intro')).toContainText('Introduction');
  await expect(page.locator('article#compare figure')).toHaveCount(2);
  await expect(page.locator('article#text-only figure')).toHaveCount(0);
  await expect(page.locator('main img')).toHaveCount(2);
  await expect
    .poll(() =>
      page
        .locator('main img')
        .evaluateAll((images) =>
          images.every(
            (image) => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0
          )
        )
    )
    .toBe(true);
  const dimensions = await page.evaluate(() => ({
    overflow:
      Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth,
    images: [...document.querySelectorAll('main img')].map((image) => ({
      width: image.getBoundingClientRect().width,
      height: image.getBoundingClientRect().height,
    })),
  }));
  expect(dimensions.overflow).toBeLessThanOrEqual(1);
  for (const image of dimensions.images) {
    expect(image.width).toBeGreaterThan(100);
    expect(image.height).toBeGreaterThan(50);
  }
}
