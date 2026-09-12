import { expect, type Locator, type Page } from '@playwright/test';
import { test } from '../support/extension-fixture';
import { openVisualHarness, SCENARIO_VISUAL_THEMES } from './scenario-editor-visual.helpers';

async function pointAt(page: Page, target: Locator) {
  const box = await target.boundingBox();
  if (!box) throw new Error('Missing hover target');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
}

for (const theme of SCENARIO_VISUAL_THEMES) {
  test(`context tools reveal on intent and preserve active controls in ${theme}`, async ({
    page,
    hostOrigin,
  }, testInfo) => {
    await openVisualHarness(page, hostOrigin, theme, 'ru', { width: 1280, height: 900 });
    await page.clock.install({ time: new Date('2026-09-12T12:00:00Z') });
    await page.clock.pauseAt(new Date('2026-09-12T12:00:01Z'));
    const image = page.locator('article#compare .guide-image-surface').first();
    const block = page.locator('article#compare .guide-block:has(.guide-image-surface)').first();
    const tools = image.locator('.guide-image-tools');
    await pointAt(page, image);
    await expect(tools).toHaveCSS('pointer-events', 'none');
    await page.clock.runFor(60);
    await page.mouse.move(2, 2);
    await page.clock.runFor(100);
    await expect(tools).toHaveCSS('pointer-events', 'none');
    await pointAt(page, image);
    await page.clock.runFor(99);
    await expect(tools).toHaveCSS('pointer-events', 'none');
    await page.clock.runFor(1);
    await expect(tools).toHaveCSS('pointer-events', 'auto');
    const grip = block.locator('.guide-block-grip');
    await pointAt(page, grip);
    await expect(grip).toHaveCSS('pointer-events', 'auto');
    await expect(grip).toHaveCSS('opacity', '1');
    await pointAt(page, image);
    await page.clock.runFor(100);
    const pane = page.locator('.guide-document-scroll');
    await pane.evaluate((node) => node.dispatchEvent(new Event('scroll')));
    await expect(tools).toHaveCSS('pointer-events', 'none');
    await page.clock.runFor(80);
    await pane.evaluate((node) => node.dispatchEvent(new Event('scroll')));
    await page.clock.runFor(99);
    await expect(tools).toHaveCSS('pointer-events', 'none');
    await page.clock.runFor(1);
    await expect(tools).toHaveCSS('pointer-events', 'auto');
    await page.mouse.move(2, 2);
    const menu = block.locator('.guide-block-actions .guide-action-menu-anchor > button');
    await menu.focus();
    await expect(menu.locator('..')).toBeVisible();
    await expect(block.locator('.guide-block-actions')).toHaveCSS('opacity', '1');
    await page.keyboard.press('ArrowDown');
    await expect(menu).toHaveAttribute('aria-expanded', 'true');
    await pane.evaluate((node) => node.dispatchEvent(new Event('scroll')));
    await expect(block.locator('.guide-block-actions')).toHaveCSS('opacity', '1');
    await page.keyboard.press('Escape');
    await expect(menu).toBeFocused();
    for (const control of [grip, block.locator('.guide-block-width'), menu]) {
      const box = await control.boundingBox();
      expect(box?.width).toBe(24);
      expect(box?.height).toBe(24);
      await expect(control).toHaveCSS('border-radius', '50%');
    }
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(tools).toHaveCSS('transition-duration', '0s');
    await pointAt(page, image);
    await page.clock.runFor(100);
    await page.clock.resume();
    await testInfo.attach(`hover-${theme}`, {
      body: await page.screenshot({ path: `tasks/scenario-hover-intent/hover-${theme}.png` }),
      contentType: 'image/png',
    });
  });
}

test('touch exposes contextual controls without waiting for pointer intent', async ({
  page,
  hostOrigin,
}) => {
  await openVisualHarness(page, hostOrigin, 'dark', 'en', { width: 1280, height: 900 });
  const session = await page.context().newCDPSession(page);
  await session.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
  await expect.poll(() => page.evaluate(() => matchMedia('(hover: none)').matches)).toBe(true);
  for (const selector of [
    '.guide-block-grip',
    '.guide-block-width',
    '.guide-image-tools',
    '.guide-voice-control',
  ]) {
    const control = page.locator(`.guide-document ${selector}`).first();
    await expect(control).toHaveCSS('opacity', '1');
    await expect(control).toHaveCSS('pointer-events', 'auto');
  }
  await session.detach();
});
