import { openGuideImageLibrary } from './scenario-editor-visual.state-steps';
import { expect } from '@playwright/test';
import { test } from '../support/extension-fixture';
import { openVisualHarness, SCENARIO_VISUAL_THEMES } from './scenario-editor-visual.helpers';

for (const theme of SCENARIO_VISUAL_THEMES) {
  test(`video rows and draft controls in ${theme}`, async ({ page, hostOrigin }, testInfo) => {
    await openVisualHarness(
      page,
      hostOrigin,
      theme,
      'en',
      { width: theme === 'light' ? 1280 : 1920, height: theme === 'light' ? 560 : 900 },
      'compare',
      { videoFixture: '1', actionFixture: '1' }
    );
    await page.getByRole('button', { name: 'Resources', exact: true }).click();
    await openGuideImageLibrary(page);
    const drawer = page.locator('#guide-resource-drawer');
    await drawer.getByRole('button', { name: 'Video', exact: true }).click();
    const row = drawer.getByRole('button', { name: 'Library motion.webm', exact: true });
    await row.click();
    await expect(row).toHaveAttribute('aria-pressed', 'true');
    await drawer.getByRole('button', { name: '0.20 · Ctrl + K', exact: true }).click();
    await expect
      .poll(() =>
        drawer
          .locator('video')
          .evaluate((video) => !video.seeking && Math.abs(video.currentTime - 0.2) < 0.01)
      )
      .toBe(true);
    const action = drawer.getByRole('button', { name: '1.20 · Open settings', exact: true });
    await action.click();
    await expect
      .poll(() =>
        drawer
          .locator('video')
          .evaluate((video) => !video.seeking && Math.abs(video.currentTime - 1.2) < 0.01)
      )
      .toBe(true);
    await action.hover();
    await expect(drawer.locator('.guide-video-click-point')).toBeVisible();
    await drawer.getByRole('button', { name: 'Edit step details', exact: true }).click();
    await expect(drawer.getByRole('button', { name: 'Start dictation', exact: true })).toHaveCount(
      2
    );
    const fields = drawer.locator('.guide-video-field input, .guide-video-field textarea');
    await expect(fields).toHaveCount(2);
    for (let index = 0; index < 2; index++) {
      const field = fields.nth(index);
      await field.fill('Temporary draft');
      await drawer
        .locator('.guide-video-field')
        .nth(index)
        .getByRole('button', { name: 'Clear text', exact: true })
        .click();
      await expect(field).toHaveValue('');
      await expect(field).toBeFocused();
    }
    await fields.nth(0).fill('Captured title');
    await fields.nth(1).fill('Captured description');
    const capture = drawer.getByRole('button', { name: 'Use this frame', exact: true });
    await expect(capture).toBeEnabled();
    await capture.scrollIntoViewIfNeeded();
    await expect(capture).toBeInViewport();
    await testInfo.attach(`video-controls-${theme}`, {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
    await capture.click();
    await expect(page.locator('main article')).toHaveCount(3);
    await drawer.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(
      page.locator('main article').last().locator('textarea.guide-step-title')
    ).toHaveValue('Captured title');
  });
}

for (const theme of SCENARIO_VISUAL_THEMES) {
  test(`frameless composer preserves video and works in fullscreen in ${theme}`, async ({
    page,
    hostOrigin,
  }) => {
    await openVisualHarness(
      page,
      hostOrigin,
      theme,
      'en',
      { width: theme === 'light' ? 1280 : 1920, height: theme === 'light' ? 560 : 900 },
      'compare',
      { videoFixture: '1', actionFixture: '1' }
    );
    await page.getByRole('button', { name: 'Resources', exact: true }).click();
    await openGuideImageLibrary(page);
    const drawer = page.locator('#guide-resource-drawer');
    await drawer.getByRole('button', { name: 'Video', exact: true }).click();
    await drawer.getByRole('button', { name: 'Library motion.webm', exact: true }).click();
    const player = drawer.locator('[data-ui="library-media-player"]');
    const video = player.locator('video');
    await expect.poll(() => video.evaluate((node) => node.readyState)).toBeGreaterThanOrEqual(2);
    await drawer.getByRole('button', { name: '0.20 · Ctrl + K', exact: true }).click();
    await expect
      .poll(() =>
        video.evaluate((node) => !node.seeking && Math.abs(node.currentTime - 0.2) < 0.01)
      )
      .toBe(true);
    for (const button of await player
      .locator('[data-ui="library-media-transport"] > button')
      .all()) {
      expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(28);
    }
    const actionLabel = player
      .getByRole('button', { name: '1.20 · Open settings', exact: true })
      .locator('span');
    expect((await actionLabel.boundingBox())!.width).toBeGreaterThan(20);
    const source = await video.getAttribute('src');
    const plane = player.locator('.guide-video-time-plane');
    const planeBounds = (await plane.boundingBox())!;
    await plane.hover({ position: { x: planeBounds.width * 0.75, y: 15 } });
    await expect(player.locator('.guide-video-hover-guide')).toBeVisible();
    expect(await plane.evaluate((node) => getComputedStyle(node).cursor)).toBe('default');
    expect(await video.evaluate((node) => node.currentTime)).toBeCloseTo(0.2, 2);
    const positions = await player.evaluate((node) => ({
      hover: node.querySelector<HTMLElement>('.guide-video-hover-guide')!.style.left,
      playhead: node.querySelector<HTMLElement>('.guide-video-playhead')!.style.left,
    }));
    expect(positions.hover).not.toBe(positions.playhead);
    await page.mouse.move(0, 0);
    await expect(player.locator('.guide-video-hover-guide')).toHaveCount(0);
    for (const fullscreen of [false, true]) {
      if (fullscreen) {
        await player.getByRole('button', { name: 'Enter fullscreen', exact: true }).click();
        await expect
          .poll(() => player.evaluate((node) => document.fullscreenElement === node))
          .toBe(true);
      }
      const trigger = player.getByRole('button', { name: 'Add step without frame', exact: true });
      await trigger.scrollIntoViewIfNeeded();
      await expect(trigger).toBeInViewport({ ratio: 1 });
      await trigger.click();
      const form = player.getByRole('form', { name: 'Add step without frame', exact: true });
      const title = form.getByRole('textbox', { name: 'Step title', exact: true });
      const body = form.getByRole('textbox', { name: 'Text', exact: true });
      const name = fullscreen ? 'Fullscreen text step' : 'Ordinary text step';
      await title.fill(name);
      await body.fill('Text without a captured image.');
      const cancel = form.getByRole('button', { name: 'Cancel', exact: true });
      await cancel.scrollIntoViewIfNeeded();
      await expect(cancel).toBeInViewport({ ratio: 1 });
      await cancel.focus();
      await page.keyboard.press('Space');
      await expect(form).toHaveCount(0);
      await expect(trigger).toBeFocused();
      expect(await video.evaluate((node) => node.paused)).toBe(true);
      await expect(page.locator('main article')).toHaveCount(fullscreen ? 3 : 2);
      await trigger.click();
      await expect(title).toHaveValue(name);
      const add = form.getByRole('button', { name: 'Save', exact: true });
      await add.scrollIntoViewIfNeeded();
      await expect(add).toBeInViewport({ ratio: 1 });
      if (fullscreen)
        expect(await form.evaluate((node) => document.fullscreenElement?.contains(node))).toBe(
          true
        );
      await page.screenshot({
        path: `.tmp/backlog7/b17-form-${theme}-${fullscreen ? 'fullscreen' : 'normal'}.png`,
        fullPage: false,
      });
      await add.focus();
      await page.keyboard.press('Space');
      await expect(form).toHaveCount(0);
      await expect(page.locator('main article')).toHaveCount(fullscreen ? 4 : 3);
      await expect(page.locator('main article').last().locator('.guide-step-title')).toHaveValue(
        name
      );
      await expect(page.locator('main article').last().locator('img')).toHaveCount(0);
      await expect(video).toHaveAttribute('src', source!);
      expect(await video.evaluate((node) => node.currentTime)).toBeCloseTo(0.2, 2);
    }
    await player.getByRole('button', { name: 'Exit fullscreen', exact: true }).click();
    await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
    await drawer.getByRole('button', { name: 'Back to materials', exact: true }).click();
    await expect(drawer.locator('.guide-library-preview')).toHaveCount(0);
  });
}
