import { expect, test, type Page, type TestInfo } from '@playwright/test';
import {
  translate,
  type AppLocale,
  type TranslationKey,
} from '../../../../apps/extension/src/platform/i18n';
import { launchExtensionBrowser, closeExtensionBrowser } from '../support/extension-browser-launch';

const viewport = { width: 392, height: 560 };
const routes = ['menu', 'screenshots', 'video', 'tools', 'export'] as const;

async function inspectPopupTypography(
  page: Page,
  mode: 'root' | 'scrolling-panel' | 'floating-menu' = 'root'
) {
  const layout = await page.evaluate((surface) => {
    const root =
      surface === 'root'
        ? document.querySelector('[data-ui="popup.app.root"]')
        : surface === 'scrolling-panel'
          ? document.querySelector('[data-ui="popup.inline-curtain.header"]')?.parentElement
          : document.querySelector('[role="listbox"][data-floating-ui-root="true"]');
    if (!(root instanceof HTMLElement)) throw new Error('Popup root is unavailable');
    const bounds = root.getBoundingClientRect();
    const clipped: string[] = [];
    const contrast: { text: string; ratio: number }[] = [];
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Contrast color parser is unavailable');
    const parse = (color: string) => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data;
      return [r!, g!, b!, a! / 255];
    };
    const composite = (front: number[], back: number[]) => [
      ...front.slice(0, 3).map((channel, i) => channel * front[3]! + back[i]! * (1 - front[3]!)),
      1,
    ];
    const luminance = (color: number[]) =>
      color
        .slice(0, 3)
        .map((channel) => channel / 255)
        .map((channel) =>
          channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
        )
        .reduce((sum, channel, i) => sum + channel * [0.2126, 0.7152, 0.0722][i]!, 0);

    let index = 0;
    for (const element of root.querySelectorAll<HTMLElement>('*')) {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      if (
        !rect.width ||
        !rect.height ||
        style.visibility === 'hidden' ||
        element.closest('.sr-only')
      )
        continue;
      const text = [...element.childNodes]
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent ?? '')
        .join('')
        .trim();
      if (/\p{L}/u.test(text)) {
        element.dataset['popupFontProof'] = String(index++);
        if (!element.closest(':disabled, [aria-disabled="true"]')) {
          const ancestors: HTMLElement[] = [];
          for (
            let ancestor: HTMLElement | null = element;
            ancestor;
            ancestor = ancestor.parentElement
          ) {
            ancestors.unshift(ancestor);
          }
          let background = [255, 255, 255, 1];
          for (const ancestor of ancestors) {
            background = composite(parse(getComputedStyle(ancestor).backgroundColor), background);
          }
          const foreground = composite(parse(style.color), background);
          const light = luminance(foreground);
          const dark = luminance(background);
          contrast.push({
            text,
            ratio: (Math.max(light, dark) + 0.05) / (Math.min(light, dark) + 0.05),
          });
        }

        if (
          (/^(hidden|clip)$/u.test(style.overflowX) &&
            element.scrollWidth > element.clientWidth + 1) ||
          (/^(hidden|clip)$/u.test(style.overflowY) &&
            element.scrollHeight > element.clientHeight + 1)
        ) {
          clipped.push(text);
        }
      }
      if (
        element.matches('button, input, select, textarea') &&
        (rect.left < bounds.left - 1 ||
          rect.right > bounds.right + 1 ||
          rect.top < bounds.top - 1 ||
          rect.bottom > bounds.bottom + 1)
      ) {
        clipped.push(`Outside popup: ${element.getAttribute('aria-label') ?? text}`);
      }
    }
    return {
      clipped,
      contrast,
      horizontalOverflow: document.documentElement.scrollWidth > bounds.width + 1,
      family: getComputedStyle(root).fontFamily,
    };
  }, mode);
  expect(
    layout.contrast.filter(({ ratio }) => ratio < 4.5),
    'Enabled text contrast'
  ).toEqual([]);
  expect(layout.family).toContain('Sniptale Interface');
  if (mode !== 'root') {
    await page.locator('[data-popup-font-proof]').evaluateAll((elements) => {
      elements.forEach((element) => element.removeAttribute('data-popup-font-proof'));
    });
    return layout;
  }
  const session = await page.context().newCDPSession(page);
  try {
    await session.send('DOM.enable');
    await session.send('CSS.enable');
    const { root } = await session.send('DOM.getDocument');
    const { nodeIds } = await session.send('DOM.querySelectorAll', {
      nodeId: root.nodeId,
      selector: '[data-popup-font-proof]',
    });
    expect(nodeIds.length, 'Each route must contain painted interface text').toBeGreaterThan(0);
    const painted = await Promise.all(
      nodeIds.map(async (nodeId) => {
        const { fonts } = await session.send('CSS.getPlatformFontsForNode', { nodeId });
        return fonts;
      })
    );
    for (const fonts of painted) {
      expect(
        fonts.some(
          (font) =>
            font.isCustomFont && /^Golos UI(?: VF)?$/u.test(font.familyName) && font.glyphCount > 0
        ),
        `Expected bundled Golos UI paint: ${JSON.stringify(fonts)}`
      ).toBe(true);
      expect(fonts.some((font) => /Manrope/u.test(font.familyName))).toBe(false);
    }
    expect(layout.clipped, 'Visible labels and controls must fit the popup').toEqual([]);
    expect(layout.horizontalOverflow).toBe(false);
    return { ...layout, painted };
  } finally {
    await session.detach();
    await page.locator('[data-popup-font-proof]').evaluateAll((elements) => {
      elements.forEach((element) => element.removeAttribute('data-popup-font-proof'));
    });
  }
}

async function inspectPopupPanels(page: Page, locale: AppLocale, route: string, info: TestInfo) {
  async function inspect(key: TranslationKey) {
    const trigger = page.getByRole('button', { name: translate(key, locale), exact: true });
    await expect(trigger).toBeEnabled();
    await trigger.click();
    const header = page.locator('[data-ui="popup.inline-curtain.header"]');
    await expect(header).toBeVisible();
    const panel = header.locator('..');
    await panel.evaluate(async (node) => {
      await Promise.allSettled(
        node
          .getAnimations({ subtree: true })
          .filter((animation) => Number.isFinite(animation.effect?.getComputedTiming().endTime))
          .map((animation) => animation.finished)
      );
    });
    const layout = await inspectPopupTypography(page, 'scrolling-panel');
    const geometry = await panel.evaluate((node) => ({
      width: node.clientWidth,
      scrollWidth: node.scrollWidth,
      height: node.clientHeight,
      scrollHeight: node.scrollHeight,
    }));
    expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.width + 1);
    await page.screenshot({
      path: info.outputPath(`${key}.png`),
      fullPage: false,
      animations: 'disabled',
    });
    if (geometry.scrollHeight > geometry.height + 1) {
      const last = panel.locator('button:enabled, input:enabled, select:enabled').last();
      await last.scrollIntoViewIfNeeded();
      const end = (await last.boundingBox())!;
      const bounds = (await panel.boundingBox())!;
      expect(end.y + end.height).toBeLessThanOrEqual(bounds.y + bounds.height + 1);
      await page.screenshot({
        path: info.outputPath(`${key}-bottom.png`),
        fullPage: false,
        animations: 'disabled',
      });
    }
    await info.attach(`${key}-readability`, {
      body: JSON.stringify({ layout, geometry }),
      contentType: 'application/json',
    });
    await header.getByRole('button').click();
    await expect(header).toHaveCount(0);
    await expect(trigger).toBeFocused();
  }
  if (route === 'video') {
    for (const key of [
      'popup.video.presetRowAria',
      'popup.video.qualityAria',
      'popup.video.outputSettingsActionAria',
      'popup.video.countdownLabel',
    ] as const)
      await inspect(key);
    for (const key of [
      'popup.video.microphoneToggleLabel',
      'popup.video.webcamToggleLabel',
    ] as const) {
      const toggle = page
        .locator('[data-ui="popup.icon-state-button"]')
        .and(page.getByRole('button', { name: translate(key, locale), exact: true }));
      if ((await toggle.getAttribute('aria-pressed')) !== 'true') await toggle.click();
      await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    }
    for (const key of [
      'popup.video.microphoneAria',
      'popup.video.microphoneSettingsActionAria',
      'popup.video.webcamAria',
      'popup.video.webcamSettingsActionAria',
    ] as const)
      await inspect(key);
  }
  if (route === 'export') {
    for (const label of ['Настройки снимка', 'Настройки захвата страниц']) {
      const trigger = page.getByRole('button', { name: label, exact: true });
      await trigger.click();
      const header = page.locator('[data-ui="popup.inline-curtain.header"]');
      await expect(header).toBeVisible();
      await inspectPopupTypography(page, 'scrolling-panel');
      const checkbox = header.locator('..').getByRole('checkbox').first();
      if (await checkbox.count()) {
        const accepted = await checkbox.isChecked();
        await checkbox.click();
        await expect(checkbox).toBeChecked({ checked: !accepted });
        await expect(checkbox).toBeFocused();
        await checkbox.click();
        await expect(checkbox).toBeChecked({ checked: accepted });
        await expect(checkbox).toBeFocused();
      }
      const selects = header.locator('..').locator('[aria-haspopup="listbox"]');
      for (let index = 0; index < (await selects.count()); index += 1) {
        const select = selects.nth(index);
        const accepted = await select.innerText();
        await select.click();
        const menu = page.getByRole('listbox');
        await expect(menu).toBeVisible();
        await inspectPopupTypography(page, 'floating-menu');
        const bounds = (await menu.boundingBox())!;
        expect(bounds.x).toBeGreaterThanOrEqual(-1);
        expect(bounds.y).toBeGreaterThanOrEqual(-1);
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width + 1);
        expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height + 1);
        await page.screenshot({
          path: info.outputPath(`${label}-menu-${index}.png`),
          fullPage: false,
          animations: 'disabled',
        });
        await page.keyboard.press('Escape');
        await expect(menu).toHaveCount(0);
        await expect(header).toBeVisible();
        await expect(select).toBeFocused();
        await expect(select).toHaveText(accepted);
        if (index === 0) {
          await select.click();
          const next = menu
            .locator('[role="option"][aria-selected="false"]:not(:disabled)')
            .first();
          const nextLabel = await next.locator('.sniptale-select-value-label-menu').innerText();
          await next.click();
          await expect(menu).toHaveCount(0);
          await expect(header).toBeVisible();
          await expect(select).toBeFocused();
          await expect(select).toContainText(nextLabel);
        }
      }
      await page.screenshot({
        path: info.outputPath(`${label}.png`),
        fullPage: false,
        animations: 'disabled',
      });
      await header.getByRole('button').click();
      await expect(header).toHaveCount(0);
      await expect(trigger).toBeFocused();
    }
  }
}

for (const locale of ['ru', 'en'] as const) {
  for (const theme of ['light', 'dark'] as const) {
    test(`popup stylesheet isolation ${locale} ${theme}`, async ({}, info) => {
      test.setTimeout(60_000);
      const launched = await launchExtensionBrowser({ viewport, fakeMediaDevices: true });
      try {
        const settings = await launched.context.newPage();
        await settings.setViewportSize({ width: 1280, height: 560 });
        await settings.goto(
          `chrome-extension://${launched.extensionId}/apps/extension/src/settings/index.html` +
            '?section=interface-browser&view=interface'
        );
        const language = settings.locator('#settings-interface-language');
        await expect(language).toBeEnabled();
        await language.click();
        await settings
          .getByRole('option', {
            name: locale === 'en' ? 'English' : /^(Russian|Русский)$/u,
          })
          .click();
        await expect
          .poll(() =>
            settings.evaluate(
              async () =>
                (await chrome.storage.local.get('sniptale-locale-preference'))[
                  'sniptale-locale-preference'
                ]
            )
          )
          .toBe(locale);
        await settings.evaluate(async (theme) => {
          localStorage.setItem('sniptale-theme-preference', theme);
          await chrome.storage.local.set({ 'sniptale-theme-preference': theme });
        }, theme);
        await settings.close();
        const page = await launched.context.newPage();
        await page.setViewportSize(viewport);
        await page.goto(
          `chrome-extension://${launched.extensionId}/apps/extension/src/popup/index.html`
        );
        const root = page.locator('[data-ui="popup.app.root"]');
        await expect(root).toBeVisible();
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        for (const route of routes) {
          const navigation = page.locator(
            `[data-ui="popup.app.tabs"] button[data-page="${route}"]`
          );
          await navigation.click();
          await expect(navigation).toHaveAttribute('data-active', 'true');
          await expect(page.locator('[data-ui="popup.app.content"]')).not.toHaveAttribute(
            'aria-busy',
            'true'
          );
          await page.evaluate(async () => {
            await document.fonts.ready;
            await Promise.allSettled(
              document
                .getAnimations()
                .filter((animation) =>
                  Number.isFinite(animation.effect?.getComputedTiming().endTime)
                )
                .map((animation) => animation.finished)
            );
          });
          await expect(root).toHaveCSS('width', '392px');
          await expect(root).toHaveCSS('height', '560px');
          await expect(root.locator('[class~="p-3"]').first()).toHaveCSS('padding', '12px');
          await expect(root.locator('button[data-command-press]')).toHaveCount(0);
          if (route === 'menu') {
            await expect(root.locator('[class~="text-sm"]').first()).toHaveCSS('font-size', '14px');
            await expect(root.locator('h1')).toHaveCSS('font-weight', '500');
            await expect(root.locator('header p')).toHaveCSS('font-weight', '400');
            await expect(root.locator('[class~="font-medium"]').first()).toHaveCSS(
              'font-weight',
              '450'
            );
            await expect(root.locator('h1')).toHaveCSS(
              'color',
              theme === 'dark' ? 'rgb(222, 222, 227)' : 'rgb(63, 63, 70)'
            );
            await expect(root.locator('h1')).toHaveText(translate('popup.home.menuTitle', locale));
            const capture = root.getByRole('button', {
              name: translate('popup.home.captureVisibleLabel', locale),
              exact: true,
            });
            await expect(capture.locator('span')).toHaveCSS('font-size', '10px');
            await expect(capture.locator('span')).toHaveCSS('line-height', '12px');
            await expect(capture.locator('span')).toHaveCSS('font-weight', '450');
            await expect(capture.locator('svg')).toHaveCSS('width', '24px');
            await expect(capture.locator('svg')).toHaveCSS('stroke-width', '1.75px');
            const tool = root.locator('[data-ui="popup.menu.tool-action.drawing"]');
            await expect(tool.locator('span')).toHaveCSS('font-size', '10px');
            await expect(tool.locator('span')).toHaveCSS('line-height', '12px');
            await expect(tool.locator('svg')).toHaveCSS('width', '18px');
            await expect(tool.locator('svg')).toHaveCSS('stroke-width', '1.75px');
          }
          const typography = await inspectPopupTypography(page);
          await info.attach(`popup-${route}-typography`, {
            body: JSON.stringify(typography, null, 2),
            contentType: 'application/json',
          });
          await page.screenshot({
            path: info.outputPath(`popup-${route}.png`),
            fullPage: false,
            animations: 'disabled',
          });
          if (locale === 'ru') await inspectPopupPanels(page, locale, route, info);
        }
      } finally {
        await closeExtensionBrowser(launched, { removeUserDataDir: true });
      }
    });
  }
}
