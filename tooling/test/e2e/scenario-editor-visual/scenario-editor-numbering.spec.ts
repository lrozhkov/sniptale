import { expect } from '@playwright/test';
import { test } from '../support/extension-fixture';
import { SCENARIO_EDITOR_VISUAL_HARNESS_PATH } from '../extension-critical.helpers';
import { openVisualHarness, SCENARIO_VISUAL_THEMES } from './scenario-editor-visual.helpers';

for (const theme of SCENARIO_VISUAL_THEMES) {
  test(`guide numbering stays consistent through custom labels, undo and reload in ${theme}`, async ({
    page,
    hostOrigin,
  }, testInfo) => {
    await openVisualHarness(page, hostOrigin, theme, 'en', { width: 1920, height: 900 });
    const url = new URL(`${hostOrigin}${SCENARIO_EDITOR_VISUAL_HARNESS_PATH}`);
    url.searchParams.set('projectId', `numbering-${crypto.randomUUID()}`);
    url.searchParams.set('theme', theme);
    url.searchParams.set('locale', 'en');
    url.searchParams.set('stepId', 'compare');
    await page.goto(url.toString());
    await page.getByRole('button', { name: 'Show all settings', exact: true }).click();
    const first = page.locator('article#compare');
    const second = page.locator('article#text-only');
    const firstNumber = first.locator('header > span:not(.guide-voice-field)');
    const secondNumber = second.locator('header > span:not(.guide-voice-field)');
    const outline = page.locator('.guide-outline-number');
    await expect(firstNumber).toHaveText('1');
    await page.getByRole('switch', { name: 'Show step number', exact: true }).uncheck();
    await expect(firstNumber).toHaveCount(0);
    await expect(secondNumber).toHaveText('1');
    await expect(outline.nth(1)).toHaveText('');
    await expect(outline.nth(2)).toHaveText('1');
    await page.getByRole('switch', { name: 'Show step number', exact: true }).check();
    await second.getByRole('textbox', { name: 'Step title', exact: true }).focus();
    await page.getByRole('switch', { name: 'Restart numbering', exact: true }).check();
    await expect(secondNumber).toHaveText('1');
    await page.getByRole('textbox', { name: 'Start at', exact: true }).fill('7');
    await page.getByRole('textbox', { name: 'Start at', exact: true }).press('Enter');
    await expect(secondNumber).toHaveText('7');
    await page.getByRole('textbox', { name: 'Custom number', exact: true }).fill('A.1');
    await expect(secondNumber).toHaveText('A.1');
    await expect(outline.nth(2)).toHaveText('A.1');
    await expect(page.getByLabel('Next automatic number', { exact: true })).toHaveText('7');
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(secondNumber).toHaveText('7');
    await page.getByRole('button', { name: 'Redo', exact: true }).click();
    await expect(secondNumber).toHaveText('A.1');
    await testInfo.attach(`numbering-${theme}`, {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
    await page.getByRole('link', { name: 'Introduction', exact: true }).click();
    await page.getByRole('switch', { name: 'Restart numbering', exact: true }).check();
    await page.getByRole('textbox', { name: 'Start at', exact: true }).fill('3');
    await page.getByRole('textbox', { name: 'Start at', exact: true }).press('Enter');
    await expect(firstNumber).toHaveText('3');
    await expect(secondNumber).toHaveText('A.1');
    await expect(page.getByRole('status').first()).toHaveText('Saved');
    await page.goto(url.toString());
    await page.getByRole('button', { name: 'Show all settings', exact: true }).click();
    await expect(firstNumber).toHaveText('3');
    await expect(secondNumber).toHaveText('A.1');
    await expect(outline.nth(1)).toHaveText('3');
    await expect(outline.nth(2)).toHaveText('A.1');
    await page.getByRole('textbox', { name: 'Custom number', exact: true }).fill('W'.repeat(32));
    await page.setViewportSize({ width: 1280, height: 560 });
    await first.locator('header').scrollIntoViewIfNeeded();
    const headerWidth = (await first.locator('header').boundingBox())!.width;
    expect((await firstNumber.boundingBox())!.width).toBeLessThanOrEqual(headerWidth * 0.41);
    await expect(firstNumber).toHaveText('W'.repeat(32));
    await page.setViewportSize({ width: 1920, height: 900 });
    await page.getByRole('textbox', { name: 'Custom number', exact: true }).fill('');
    await expect(firstNumber).toHaveText('3');
    await second.getByRole('textbox', { name: 'Step title', exact: true }).focus();
    await page.getByRole('switch', { name: 'Restart numbering', exact: true }).uncheck();
    await expect(secondNumber).toHaveText('A.1');
    await page.getByRole('textbox', { name: 'Custom number', exact: true }).fill('');
    await expect(secondNumber).toHaveText('4');
    await page.getByRole('link', { name: 'Introduction', exact: true }).click();
    await page.getByRole('switch', { name: 'Restart numbering', exact: true }).uncheck();
    await expect(firstNumber).toHaveText('1');
    await expect(secondNumber).toHaveText('2');
    await expect(page.getByRole('status').first()).toHaveText('Saved');
    await page.goto(url.toString());
    await page.getByRole('button', { name: 'Show all settings', exact: true }).click();
    await expect(firstNumber).toHaveText('1');
    await expect(secondNumber).toHaveText('2');
  });
}

for (const theme of SCENARIO_VISUAL_THEMES) {
  test(`insertion focus uses app color independently of document accent in ${theme}`, async ({
    page,
    hostOrigin,
  }) => {
    await openVisualHarness(page, hostOrigin, theme, 'en', { width: 1280, height: 560 });
    await page
      .locator('.guide-page-header')
      .getByRole('button', { name: 'Appearance', exact: true })
      .click();
    const accent = page.locator('#guide-inspector-panel .guide-style-accent');
    await accent.locator('[data-ui="shared.ui.color-selector.value-trigger"]').click();
    await accent.getByRole('textbox').fill('#2367ab');
    await accent.getByRole('textbox').press('Enter');
    await page.keyboard.press('Tab');
    const insertion = page.locator('article#compare .guide-insertion-block button').first();
    await insertion.focus();
    await expect(insertion).toBeFocused();
    const colors = await insertion.evaluate((node) => {
      const probe = document.createElement('span');
      probe.style.color = 'var(--sniptale-color-accent)';
      node.append(probe);
      const focus = getComputedStyle(probe).color;
      probe.remove();
      return { outline: getComputedStyle(node).outlineColor, focus };
    });
    await expect(insertion).toHaveCSS('outline-color', colors.focus);
    expect(colors.outline).not.toBe('rgb(35, 103, 171)');
    await page.setViewportSize({ width: 1024, height: 560 });
    expect(
      await page.locator('.guide-editor-viewport').evaluate((node) => node.scrollWidth)
    ).toBeGreaterThanOrEqual(1280);
    expect(await page.locator('.guide-editor-viewport').evaluate((node) => node.clientWidth)).toBe(
      1024
    );
  });
}

for (const theme of SCENARIO_VISUAL_THEMES) {
  test(`accent colors its document consumers through reader print and HTML in ${theme}`, async ({
    page,
    hostOrigin,
  }, info) => {
    await openVisualHarness(
      page,
      hostOrigin,
      theme,
      'en',
      theme === 'light' ? { width: 1280, height: 560 } : { width: 1920, height: 900 },
      'compare',
      { accentFixture: '1' }
    );
    const reopen = new URL(page.url());
    reopen.pathname = SCENARIO_EDITOR_VISUAL_HARNESS_PATH;
    reopen.searchParams.set('theme', theme);
    reopen.searchParams.set('locale', 'en');
    const number = page.locator('article#compare > header > span:not(.guide-voice-field)');
    const badgeColor = await number.evaluate((node) => getComputedStyle(node).color);
    await page
      .locator('.guide-page-header')
      .getByRole('button', { name: 'Appearance', exact: true })
      .click();
    const inspector = page.locator('#guide-inspector-panel');
    const fieldLabel = inspector.getByText('Numbers and links', { exact: true });
    await expect(fieldLabel).toBeVisible();
    const accent = inspector.locator('.guide-style-accent');
    await accent.locator('[data-ui="shared.ui.color-selector.value-trigger"]').click();
    await accent.getByRole('textbox').fill('#2367ab');
    await accent.getByRole('textbox').press('Enter');
    await expect(number).toHaveCSS('color', badgeColor);
    await inspector
      .getByRole('group', { name: 'Number style', exact: true })
      .getByRole('button', { name: 'Plain', exact: true })
      .click();
    await expect(number).toHaveCSS('color', 'rgb(35, 103, 171)');
    await accent.locator(':scope > button').click();
    await expect(number).not.toHaveCSS('color', 'rgb(35, 103, 171)');
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(number).toHaveCSS('color', 'rgb(35, 103, 171)');
    await fieldLabel.scrollIntoViewIfNeeded();
    await expect(fieldLabel).toBeInViewport();
    await info.attach(`accent-${theme}`, {
      body: await page.screenshot({
        path: `.tmp/backlog7/b18-accent-${theme}.png`,
        fullPage: false,
      }),
      contentType: 'image/png',
    });
    await expect(page.getByRole('status').first()).toHaveText('Saved');
    await page.goto(reopen.toString());
    await expect(number).toHaveCSS('color', 'rgb(35, 103, 171)');
    await expect(
      page.locator('article#text-only > header > span:not(.guide-voice-field)')
    ).toHaveCSS('color', 'rgb(35, 103, 171)');
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    await expect(page.locator('.guide-reader article#compare > header > span')).toHaveCSS(
      'color',
      'rgb(35, 103, 171)'
    );
    await expect(page.getByRole('link', { name: 'Accent link', exact: true })).toHaveCSS(
      'color',
      'rgb(35, 103, 171)'
    );
    await page.getByRole('button', { name: 'Print / PDF', exact: true }).click();
    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('.guide-print article#compare > header > span')).toHaveCSS(
      'color',
      'rgb(35, 103, 171)'
    );
    await expect(page.getByRole('link', { name: 'Accent link', exact: true })).toHaveCSS(
      'color',
      'rgb(35, 103, 171)'
    );
    await page.emulateMedia({ media: 'screen' });
    await page.goto(reopen.toString());
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    await page.evaluate(() => {
      const chunks: Uint8Array[] = [];
      Object.defineProperty(window, 'showSaveFilePicker', {
        configurable: true,
        value: async () => ({
          createWritable: async () =>
            new WritableStream<Uint8Array>({
              write: (chunk) => {
                chunks.push(chunk);
              },
            }),
        }),
      });
      Object.defineProperty(window, 'accentExportHtml', {
        configurable: true,
        get: () => chunks.map((chunk) => new TextDecoder().decode(chunk)).join(''),
      });
    });
    await page.getByRole('button', { name: 'Save standalone HTML', exact: true }).click();
    await page.getByRole('button', { name: 'Calculate size', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save HTML', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Save HTML', exact: true }).click();
    await expect(page.locator('.guide-export-status')).toHaveText('HTML saved');
    const html = await page.evaluate(() => {
      const value: unknown = Reflect.get(window, 'accentExportHtml');
      if (typeof value !== 'string') throw new Error('Missing exported HTML');
      return value;
    });
    const exportedUrl = `${hostOrigin}/accent-export.html`;
    await page.route(exportedUrl, (route) =>
      route.fulfill({ body: html, contentType: 'text/html' })
    );
    await page.goto(exportedUrl);
    await expect(page.locator('article > header > span').first()).toHaveCSS(
      'color',
      'rgb(35, 103, 171)'
    );
    await expect(page.getByRole('link', { name: 'Accent link', exact: true })).toHaveCSS(
      'color',
      'rgb(35, 103, 171)'
    );
    await page.emulateMedia({ media: 'print' });
    await expect(page.getByRole('link', { name: 'Accent link', exact: true })).toHaveCSS(
      'color',
      'rgb(35, 103, 171)'
    );
    await page.emulateMedia({ media: 'screen' });
    await page.setViewportSize({ width: 1280, height: 560 });
    reopen.searchParams.set('locale', 'ru');
    await page.goto(reopen.toString());
    await page
      .locator('.guide-page-header')
      .getByRole('button', { name: 'Оформление', exact: true })
      .click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    const russianLabel = inspector.getByText('Номера и ссылки', { exact: true });
    await russianLabel.scrollIntoViewIfNeeded();
    await expect(russianLabel).toBeInViewport();
    await expect(inspector.locator('.guide-style-fields > p')).toHaveCount(0);
    await info.attach(`accent-ru-${theme}`, {
      body: await page.screenshot({
        path: `.tmp/backlog7/b18-accent-ru-${theme}.png`,
        fullPage: false,
      }),
      contentType: 'image/png',
    });
  });
}
