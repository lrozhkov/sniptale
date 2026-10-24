import { expect, type Locator } from '@playwright/test';

export async function expectFittedFrame(player: Locator) {
  const viewport = player.locator('.tour-viewport');
  const stage = player.locator('.tour-stage');
  await expect(stage).toBeVisible();
  await expect(viewport).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(viewport).toHaveCSS('border-top-width', '0px');
  await expect(stage).toHaveCSS('border-top-width', '1px');
  await expect
    .poll(() =>
      stage.evaluate((node) => getComputedStyle(node.closest('#tour-player')!).backgroundColor)
    )
    .toBe('rgba(0, 0, 0, 0)');
  await expect
    .poll(async () => {
      const outer = await viewport.boundingBox();
      const frame = await stage.boundingBox();
      if (!outer || !frame) return false;
      return (
        Math.abs(frame.width / frame.height - 16 / 9) < 0.01 &&
        frame.width <= outer.width + 1 &&
        frame.height <= outer.height + 1 &&
        Math.abs(frame.width - outer.width) < 2 &&
        Math.abs(frame.height - outer.height) < 2
      );
    })
    .toBe(true);
  const toolbar = player.locator('.tour-toolbar');
  if (await toolbar.isVisible()) {
    const toolbarBox = await toolbar.boundingBox();
    const playerBox = (await player.locator('#tour-player').count())
      ? await player.locator('#tour-player').boundingBox()
      : await player.boundingBox();
    expect(toolbarBox!.y).toBeGreaterThanOrEqual(playerBox!.y);
    expect(toolbarBox!.y + toolbarBox!.height).toBeLessThanOrEqual(
      playerBox!.y + playerBox!.height + 1
    );
    expect(toolbarBox!.x).toBeGreaterThanOrEqual(playerBox!.x);
    expect(toolbarBox!.x + toolbarBox!.width).toBeLessThanOrEqual(
      playerBox!.x + playerBox!.width + 1
    );
    await expect(player.locator('.tour-title')).toBeHidden();
    await expect(player.locator('[data-tour-contents]')).toHaveText('');
    await expect(player.locator('[data-tour-contents] svg')).toBeVisible();
    await expect(player.locator('[data-tour-scene]')).toHaveCSS('opacity', '1');
  }
}
