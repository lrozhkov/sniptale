import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { expect, type Locator, type Page } from '@playwright/test';
import { test } from '../support/extension-fixture';
import { SCENARIO_EDITOR_VISUAL_HARNESS_PATH } from '../extension-critical.helpers';
import { createTranslator } from '../../../../apps/extension/src/platform/i18n';
import { openVisualHarness, createPageIssueCollector } from './scenario-editor-visual.helpers';

async function choose(page: Page, scope: Locator, label: string, value: string) {
  const segment = scope.getByRole('button', { name: value, exact: true });
  if (await segment.isVisible()) await segment.click();
  else {
    await scope.getByRole('button', { name: label, exact: true }).click();
    await page.getByRole('option', { name: value, exact: true }).click();
  }
}

async function expectWindow(player: Locator) {
  const scene = player.locator('[data-tour-scene]');
  await expect(scene).toHaveCSS('opacity', '1');
  await expect(player.locator('.tour-motion-previous')).toHaveCount(0);
  const header = scene.locator('.tour-window-header');
  await expect(header).toBeVisible();
  await expect
    .poll(() =>
      header.evaluate(
        (node) => node instanceof HTMLImageElement && node.complete && node.naturalWidth > 0
      )
    )
    .toBe(true);
  const geometry = await scene.locator('.tour-image-viewport').evaluate((node) => {
    const outer = node.getBoundingClientRect();
    const header = node
      .parentElement!.querySelector('.tour-window-header')!
      .getBoundingClientRect();
    const values = getComputedStyle(node).clipPath.slice(6, -1).split(/\s+/).map(parseFloat);
    const top = values[0]!;
    const right = values[1] ?? top;
    const left = values[3] ?? right;
    return {
      gap: outer.top + top - header.bottom,
      left: outer.left + left - header.left,
      width: outer.width - left - right - header.width,
    };
  });
  expect(Math.abs(geometry.gap)).toBeLessThanOrEqual(1);
  expect(Math.abs(geometry.left)).toBeLessThanOrEqual(1);
  expect(Math.abs(geometry.width)).toBeLessThanOrEqual(1);
}

async function captureSavedHtml(page: Page, saveLabel: string, output: string) {
  await page.evaluate(() => {
    const chunks: Uint8Array[] = [];
    let complete = false;
    Object.defineProperty(window, 'showSaveFilePicker', {
      configurable: true,
      value: async () => ({
        createWritable: async () =>
          new WritableStream<Uint8Array>({
            write(chunk) {
              chunks.push(chunk);
            },
            close() {
              complete = true;
            },
          }),
      }),
    });
    Object.defineProperty(window, 'savedWindowHtmlComplete', {
      configurable: true,
      get: () => complete,
    });
    Object.defineProperty(window, 'savedWindowHtml', {
      configurable: true,
      get: () => {
        const decoder = new TextDecoder();
        return (
          chunks.map((chunk) => decoder.decode(chunk, { stream: true })).join('') + decoder.decode()
        );
      },
    });
  });
  await page.getByRole('button', { name: saveLabel, exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => Reflect.get(window, 'savedWindowHtmlComplete')))
    .toBe(true);
  const html = await page.evaluate(() => String(Reflect.get(window, 'savedWindowHtml')));
  expect(html).toContain('</html>');
  await writeFile(output, html);
}

async function exerciseStageBackground(
  page: Page,
  panel: Locator,
  player: Locator,
  t: ReturnType<typeof createTranslator>
) {
  const picker = panel.locator('[data-ui="background.image.picker"]');
  await expect(picker).toBeVisible();
  const stageBackground = () =>
    player.locator('[data-tour-stage]').evaluate((node) => getComputedStyle(node).backgroundImage);
  const initialBackground = await stageBackground();
  await picker.locator('[role="group"] > button').first().click();
  await expect.poll(stageBackground).not.toBe(initialBackground);
  await page.getByRole('button', { name: t('scenario.editor.guideUndo'), exact: true }).click();
  await expect.poll(stageBackground).toBe(initialBackground);
  await page.getByRole('button', { name: t('scenario.editor.guideRedo'), exact: true }).click();
  await expect.poll(stageBackground).not.toBe(initialBackground);
  const library = picker.getByRole('button', {
    name: t('settings.editor.backgrounds.library'),
    exact: true,
  });
  await library.click();
  const drawer = page.locator('[data-ui="background.library.drawer"]');
  await expect(drawer).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(drawer).toHaveCount(0);
  await expect(library).toBeFocused();
  await library.click();
  await drawer
    .getByRole('button', { name: /Scenario image/ })
    .first()
    .click();
  await expect(drawer).toHaveCount(0);
  await expect.poll(stageBackground).toContain('url(');
  const acceptedBackground = await stageBackground();
  await picker.locator('input[type="file"]').setInputFiles({
    name: 'broken.png',
    mimeType: 'image/png',
    buffer: Buffer.from('invalid image bytes'),
  });
  await expect(picker.getByRole('alert')).toContainText(t('settings.editor.backgrounds.failed'));
  expect(await stageBackground()).toBe(acceptedBackground);
  await picker.locator('input[type="file"]').setInputFiles({
    name: 'Custom background.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="300"><rect width="480" height="300" fill="#903bd1"/></svg>'
    ),
  });
  await expect.poll(stageBackground).not.toBe(acceptedBackground);
  await expect(picker.getByRole('alert')).toHaveCount(0);
}

async function exerciseWindowHeader(
  page: Page,
  panel: Locator,
  player: Locator,
  t: ReturnType<typeof createTranslator>
) {
  const settings = panel.locator('[data-ui="window-header-settings"]');
  await choose(page, settings, t('windowHeader.type'), t('windowHeader.browser'));
  await expectWindow(player);
  const title = settings.getByRole('textbox', { name: t('windowHeader.tabTitle'), exact: true });
  await title.fill('Window proof');
  await title.press('Enter');
  await choose(page, settings, t('windowHeader.style'), 'macOS');
  await choose(page, settings, t('windowHeader.theme'), t('windowHeader.dark'));
  await expectWindow(player);
  const browserHeader = await player.locator('.tour-window-header').getAttribute('src');
  await choose(page, settings, t('windowHeader.type'), t('windowHeader.application'));
  await expectWindow(player);
  await expect(player.locator('.tour-window-header')).not.toHaveAttribute('src', browserHeader!);
  await expect(
    settings.getByRole('textbox', { name: t('windowHeader.address'), exact: true })
  ).toHaveCount(0);
  await page.getByRole('button', { name: t('scenario.editor.guideUndo'), exact: true }).click();
  await expect(
    settings.getByRole('textbox', { name: t('windowHeader.address'), exact: true })
  ).toBeVisible();
  await page.getByRole('button', { name: t('scenario.editor.guideRedo'), exact: true }).click();
  await expect(
    settings.getByRole('textbox', { name: t('windowHeader.windowTitle'), exact: true })
  ).toHaveValue('Window proof');

  await choose(page, settings, t('windowHeader.type'), t('windowHeader.none'));
  await expect(player.locator('.tour-window-header')).toHaveCount(0);
  await choose(page, settings, t('windowHeader.type'), t('windowHeader.browser'));
  await choose(page, settings, t('windowHeader.style'), 'Windows');
  await expectWindow(player);
  await choose(page, settings, t('windowHeader.style'), 'Linux');
  await expectWindow(player);
  await choose(page, settings, t('windowHeader.type'), t('windowHeader.application'));
}

for (const [locale, theme, size] of [
  ['ru', 'light', { width: 1280, height: 560 }],
  ['en', 'dark', { width: 1920, height: 900 }],
] as const) {
  test(`tour window, background and image placement workflow ${locale}`, async ({
    page,
    hostOrigin,
  }, info) => {
    test.setTimeout(180_000);
    const t = createTranslator(locale);
    const issues = createPageIssueCollector(page);
    await openVisualHarness(page, hostOrigin, theme, locale, size, 'compare', { tourFixture: '1' });
    await page.getByRole('button', { name: t('scenario.editor.tourMode'), exact: true }).click();
    const panel = page.locator('#guide-inspector-panel');
    const player = page.locator('.tour-canvas .tour-stage-host');
    const category = (label: string) =>
      panel.getByRole('navigation').getByRole('button', { name: label, exact: true });
    const appearance = page
      .locator('.guide-page-header')
      .getByRole('button', { name: t('scenario.editor.appearance'), exact: true });
    await appearance.click();
    await exerciseStageBackground(page, panel, player, t);
    await exerciseWindowHeader(page, panel, player, t);
    await page.locator('.tour-slide-select').first().click();
    await category(t('scenario.editor.tourObjects')).click();
    await panel
      .getByRole('button', { name: t('scenario.editor.tourHotspot'), exact: true })
      .click();
    await panel
      .getByRole('textbox', { name: t('scenario.editor.textLabel'), exact: true })
      .fill('Follow this target');
    await panel
      .getByRole('button', { name: t('scenario.editor.tourBackToSlide'), exact: true })
      .click();
    await category(t('scenario.editor.tourSlide')).click();
    await expect(
      panel.getByRole('button', { name: t('scenario.editor.guideEditImage'), exact: true })
    ).toHaveCount(0);
    await expect(
      panel.getByRole('button', { name: t('scenario.editor.guideReplaceImage'), exact: true })
    ).toHaveCount(0);
    const controls = page.locator('.tour-header-controls');
    await expect(controls.locator('[data-tour-edit-image]')).toBeEnabled();
    const replace = controls.getByRole('button', {
      name: t('scenario.editor.guideReplaceImage'),
      exact: true,
    });
    await replace.click();
    await expect(page.locator('#guide-resource-drawer')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#guide-resource-drawer')).toHaveCount(0);
    await expect(replace).toBeFocused();
    const framing = panel.locator('[data-ui="tour.image.framing"]');
    const scale = framing.getByRole('textbox', {
      name: t('scenario.editor.tourImageScale'),
      exact: true,
    });
    const position = framing.getByRole('textbox', {
      name: t('scenario.editor.tourImagePositionX'),
      exact: true,
    });
    await choose(page, panel, t('scenario.editor.tourFit'), t('scenario.editor.tourContain'));
    const fittedImage = (await player.locator('.tour-image').boundingBox())!;
    await choose(page, panel, t('scenario.editor.tourFit'), t('scenario.editor.tourCover'));
    await expect
      .poll(async () => {
        const filledImage = (await player.locator('.tour-image').boundingBox())!;
        return (
          Math.abs(filledImage.height - fittedImage.height) +
          Math.abs(filledImage.width - fittedImage.width)
        );
      })
      .toBeGreaterThan(1);
    const headerWidth = (await player.locator('.tour-window-header').boundingBox())!.width;
    await scale.fill('150');
    await scale.press('Enter');
    const miniStage = framing.locator('.tour-image-viewport');
    const miniBox = (await miniStage.boundingBox())!;
    const start = { x: miniBox.x + miniBox.width / 2, y: miniBox.y + miniBox.height * 0.65 };
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 20, start.y, { steps: 4 });
    await page.keyboard.press('Escape');
    await page.mouse.up();
    await expect(position).toHaveValue('50');
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 20, start.y, { steps: 4 });
    const focusControl = await page.context().newCDPSession(page);
    await focusControl.send('Emulation.setFocusEmulationEnabled', { enabled: false });
    const otherTab = await page.context().newPage();
    await otherTab.bringToFront();
    await expect.poll(() => page.evaluate(() => document.hasFocus())).toBe(false);
    await page.bringToFront();
    await focusControl.send('Emulation.setFocusEmulationEnabled', { enabled: true });
    await page.mouse.up();
    await otherTab.close();
    await focusControl.detach();
    await expect(position).toHaveValue('50');
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 20, start.y, { steps: 4 });
    await page.mouse.up();
    await expect(position).not.toHaveValue('50');
    await page.getByRole('button', { name: t('scenario.editor.guideUndo'), exact: true }).click();
    await expect(position).toHaveValue('50');
    await position.fill('60');
    await position.press('Enter');
    await expectWindow(player);
    expect(
      Math.abs((await player.locator('.tour-window-header').boundingBox())!.width - headerWidth)
    ).toBeLessThanOrEqual(1);
    const projection = await player.locator('.tour-image').evaluate((node) => {
      const image = node.getBoundingClientRect();
      const target = node
        .closest('[data-tour-stage]')!
        .querySelector('.tour-hotspot')!
        .getBoundingClientRect();
      return {
        x: target.x + target.width / 2 - image.x - image.width / 2,
        y: target.y + target.height / 2 - image.y - image.height / 2,
      };
    });
    expect(Math.abs(projection.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(projection.y)).toBeLessThanOrEqual(1);
    await page.getByRole('button', { name: t('scenario.editor.guideUndo'), exact: true }).click();
    await expect(position).toHaveValue('50');
    await page.getByRole('button', { name: t('scenario.editor.guideRedo'), exact: true }).click();
    await expect(position).toHaveValue('60');
    await page.screenshot({ path: info.outputPath('window-image-placement.png'), fullPage: false });
    await expect(page.getByRole('status').first()).toHaveText(t('scenario.editor.guideSaved'));
    const reopen = new URL(page.url());
    reopen.pathname = SCENARIO_EDITOR_VISUAL_HARNESS_PATH;
    reopen.searchParams.set('theme', theme);
    reopen.searchParams.set('locale', locale);
    await page.goto(reopen.toString(), { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: t('scenario.editor.tourMode'), exact: true }).click();
    await page.locator('.tour-slide-select').first().click();
    await category(t('scenario.editor.tourSlide')).click();
    await expect(position).toHaveValue('60');
    await expect(scale).toHaveValue('150');
    await expectWindow(player);
    await appearance.click();
    await choose(page, panel, t('scenario.editor.tourAspect'), '9:16');
    await expectWindow(player);
    await page.screenshot({ path: info.outputPath('window-portrait.png'), fullPage: false });
    await page.locator('.tour-slide-select').first().click();
    await page
      .locator('.tour-header-controls')
      .getByRole('button', { name: t('scenario.editor.tourPreviewSlide'), exact: true })
      .click();
    await expectWindow(player);
    await page.getByRole('button', { name: t('scenario.editor.export'), exact: true }).click();
    await page
      .locator('.guide-export-stage')
      .getByRole('button', { name: t('scenario.editor.tourHtmlPrepare'), exact: true })
      .click();
    const exported = page
      .frameLocator('.tour-export-frame iframe')
      .frameLocator('iframe')
      .locator('#tour-player');
    await expectWindow(exported);
    await page.screenshot({ path: info.outputPath('window-export-preview.png'), fullPage: false });
    const output = info.outputPath('window-tour.html');
    await captureSavedHtml(page, t('scenario.editor.htmlSave'), output);
    const offline = await page.context().newPage();
    await offline.setViewportSize(size);
    await page.context().setOffline(true);
    try {
      await offline.goto(pathToFileURL(output).href);
      await expectWindow(offline.locator('#tour-player'));
      if (locale === 'ru') {
        for (const width of [479, 480, 481]) {
          await offline.setViewportSize({ width, height: 700 });
          await expectWindow(offline.locator('#tour-player'));
          expect(
            await offline.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
          ).toBe(true);
        }
        await offline.screenshot({ path: info.outputPath('window-narrow.png'), fullPage: false });
        await offline.setViewportSize(size);
      }
      await offline.screenshot({
        path: info.outputPath('window-tour-offline.png'),
        fullPage: false,
      });
    } finally {
      await page.context().setOffline(false);
      await offline.close();
    }
    issues.assertClean();
  });
}
