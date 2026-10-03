import { test, expect } from '../support/extension-fixture';

for (const theme of ['light', 'dark'] as const) {
  test(`gallery storage menu stays readable over changing content in ${theme}`, async ({
    page,
    extensionId,
  }, testInfo) => {
    await page.setViewportSize({ width: 1024, height: 640 });
    await page.goto(`chrome-extension://${extensionId}/apps/extension/src/gallery/index.html`);
    await expect(page.locator('[data-ui="gallery.page.root"]')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(
      (value) =>
        chrome.storage.local.set({
          'sniptale-theme-preference': value,
          'sniptale-locale-preference': value === 'light' ? 'ru' : 'en',
        }),
      theme
    );
    await page.reload();
    await expect(page.locator('[data-ui="gallery.page.root"]')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await page.locator('[data-ui="gallery.header.storage"] > button').click();
    const menu = page.locator('[data-ui="gallery.header.storage-menu"]');
    await expect(menu).toBeVisible();
    const bounds = await menu.boundingBox();
    if (!bounds) throw new Error('Storage menu has no bounds');
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(1024);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(640);
    await menu.evaluate((element) => {
      const backdrop = document.createElement('div');
      backdrop.dataset.testBackdrop = 'true';
      Object.assign(backdrop.style, {
        position: 'absolute',
        inset: '0',
        zIndex: '-1',
        background: 'white',
        pointerEvents: 'none',
      });
      // Place the test content below the menu's own surface in the same parent stacking context.
      const rect = element.getBoundingClientRect();
      const parent = element.parentElement;
      if (!parent) throw new Error('Storage menu parent missing');
      parent.append(backdrop);
      const parentRect = parent.getBoundingClientRect();
      Object.assign(backdrop.style, {
        inset: 'auto',
        left: `${rect.left - parentRect.left}px`,
        top: `${rect.top - parentRect.top}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        zIndex: '49',
      });
    });
    const clip = {
      x: bounds.x + 12,
      y: bounds.y + 12,
      width: bounds.width - 24,
      height: bounds.height - 24,
    };
    const white = await page.screenshot({ clip, animations: 'disabled' });
    await page.locator('[data-test-backdrop]').evaluate((element) => {
      if (element instanceof HTMLElement)
        element.style.background =
          'repeating-linear-gradient(45deg, black 0 8px, #ff0088 8px 16px)';
    });
    const busy = await page.screenshot({ clip, animations: 'disabled' });
    await page.screenshot({ path: testInfo.outputPath(`gallery-menu-${theme}.png`) });
    expect(
      busy.equals(white),
      'menu interior must shield text and icons from underlying content'
    ).toBe(true);
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
  });
}

test('gallery cold and repeated startup show loading before the complete shell', async ({
  page,
  extensionId,
}) => {
  await page.addInitScript(() => {
    const states = new Set<string>();
    new MutationObserver(() => {
      const loading = document.querySelectorAll('[data-ui="gallery.loading"]').length;
      const sidebar = document.querySelectorAll('[data-ui="gallery.sidebar.shell"]').length;
      const header = document.querySelectorAll('[data-ui="gallery.header.storage"]').length;
      if (!loading && !sidebar && !header) return;
      states.add(`${loading}:${sidebar}:${header}`);
      document.documentElement.dataset.galleryLoadingProof = [...states].join(';');
    }).observe(document, { childList: true, subtree: true });
  });
  await page.goto(`chrome-extension://${extensionId}/apps/extension/src/gallery/index.html`);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await expect(page.locator('[data-ui="gallery.sidebar.shell"]')).toBeVisible();
    const states = await page.locator('html').getAttribute('data-gallery-loading-proof');
    expect(states?.split(';')).toEqual(['1:0:0', '0:1:1']);
    await expect(page.locator('[data-ui="gallery.loading"]')).toHaveCount(0);
    if (attempt === 0) await page.reload();
  }
});
