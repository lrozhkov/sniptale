import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import {
  translate,
  type AppLocale,
  type TranslationKey,
} from '../../../../apps/extension/src/platform/i18n';
import { launchExtensionBrowser, closeExtensionBrowser } from '../support/extension-browser-launch';
import { startHostServer } from '../support/host-server';

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
      const ancestors: HTMLElement[] = [];
      for (
        let ancestor: HTMLElement | null = element;
        ancestor;
        ancestor = ancestor.parentElement
      ) {
        ancestors.unshift(ancestor);
      }
      if (
        !rect.width ||
        !rect.height ||
        style.visibility === 'hidden' ||
        ancestors.some((ancestor) => Number(getComputedStyle(ancestor).opacity) === 0) ||
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

async function inspectNeutralOptions(panel: Locator) {
  const options = panel.locator(
    '[role="option"][aria-selected="true"], button[aria-pressed="true"]'
  );
  for (const option of await options.all()) {
    const state = await option.evaluate((node) => {
      const style = getComputedStyle(node);
      const reference = document.createElement('span');
      node.append(reference);
      reference.style.color = 'var(--sniptale-color-text-primary)';
      reference.style.backgroundColor = 'var(--sniptale-color-surface-hover)';
      const neutral = getComputedStyle(reference);
      const result = {
        color: style.color,
        background: style.backgroundColor,
        expectedColor: neutral.color,
        expectedBackground: neutral.backgroundColor,
        fontSize: style.fontSize,
      };
      reference.remove();
      return result;
    });
    expect(state.color).toBe(state.expectedColor);
    expect(state.background).toBe(state.expectedBackground);
    expect(state.fontSize).toBe('12px');
  }
}

async function inspectMicrophone(page: Page, panel: Locator, locale: AppLocale, info: TestInfo) {
  const record = panel.getByRole('button', {
    name: translate('popup.video.microphoneTestRecord', locale),
    exact: true,
  });
  await expect(record).toBeEnabled();
  const processing = panel.getByRole('button', {
    name: new RegExp(translate('popup.video.microphoneEchoCancellation', locale), 'u'),
  });
  await expect(processing).toBeEnabled();
  await processing.scrollIntoViewIfNeeded();
  const before = await processing.boundingBox();
  const accepted = await processing.getAttribute('aria-pressed');
  await processing.click();
  await expect(processing).toHaveAttribute('aria-pressed', accepted === 'true' ? 'false' : 'true');
  const updating = await processing.boundingBox();
  expect(Math.abs(updating!.y - before!.y)).toBeLessThanOrEqual(1);
  await expect(record).toBeEnabled();
  const ready = await processing.boundingBox();
  expect(Math.abs(ready!.y - before!.y)).toBeLessThanOrEqual(1);
  await processing.click();
  await expect(processing).toHaveAttribute('aria-pressed', accepted!);
  await expect(record).toBeEnabled();
  await record.click();
  const stop = panel.getByRole('button', {
    name: translate('popup.video.microphoneTestStop', locale),
    exact: true,
  });
  await expect(stop).toBeEnabled();
  await page.waitForTimeout(1_000);
  await stop.click();
  const play = panel.getByRole('button', {
    name: translate('popup.video.microphoneTestPlay', locale),
    exact: true,
  });
  await expect(play).toBeEnabled();
  await play.click();
  const pause = panel.getByRole('button', {
    name: translate('popup.video.microphoneTestPause', locale),
    exact: true,
  });
  await expect(pause).toBeVisible();
  await expect(pause.locator('svg')).toHaveClass(/lucide-pause/u);
  await pause.click();
  await expect(play).toBeVisible();
  await expect(play.locator('svg')).toHaveClass(/lucide-play/u);
  await page.screenshot({
    path: info.outputPath('microphone-playback-paused.png'),
    fullPage: false,
  });
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
    await inspectNeutralOptions(panel);
    if (key === 'popup.video.microphoneSettingsActionAria') {
      await inspectMicrophone(page, panel, locale, info);
    }
    if (key === 'popup.video.webcamSettingsActionAria') {
      await page.screenshot({
        path: info.outputPath('webcam-settings-default.png'),
        fullPage: false,
      });
      const embedded = panel.getByRole('button', {
        name: translate('popup.video.webcamPresentationEmbedded', locale),
        exact: true,
      });
      if ((await embedded.getAttribute('aria-pressed')) !== 'true') await embedded.click();
      await expect(embedded).toHaveAttribute('aria-pressed', 'true');
      await expect(
        panel.getByRole('slider', {
          name: translate('popup.video.webcamPresentationSize', locale),
          exact: true,
        })
      ).toBeVisible();
    }
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
    expect(await trigger.evaluate((node) => node.matches(':focus-visible'))).toBe(false);
    await page.keyboard.press('Tab');
    expect(await page.locator(':focus').evaluate((node) => node.matches(':focus-visible'))).toBe(
      true
    );
  }
  if (route === 'screenshots') {
    await page
      .getByRole('button', {
        name: translate('popup.home.captureTabLabel', locale),
        exact: true,
      })
      .click();
    for (const key of [
      'popup.home.captureAreaLabel',
      'settings.quickActions.afterCaptureLabel',
      'popup.home.captureSizeLabel',
      'popup.home.captureQualityAria',
      'popup.home.captureCountdownLabel',
    ] as const)
      await inspect(key);
  }
  if (route === 'video') {
    await page
      .getByRole('button', {
        name: translate('popup.video.modeTabLabel', locale),
        exact: true,
      })
      .click();
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
    for (const destination of [
      {
        key: 'popup.export.packageDestinationDownload',
        action: 'popup.export.packageDestinationDownload',
      },
      { key: 'popup.export.packageDestinationLibrary', action: 'popup.export.saveToLibraryButton' },
      { key: 'popup.export.packageDestinationHtml', action: 'popup.export.packageDestinationHtml' },
    ] as const) {
      await page
        .getByRole('button', { name: translate(destination.key, locale), exact: true })
        .and(page.locator('[aria-pressed]'))
        .click();
      const action = page.locator('[data-ui="popup.export.export-button"]');
      await expect(action).toHaveText(translate(destination.action, locale));
      const selections = page.locator('[data-ui="popup.export.selection-trigger"]');
      for (
        let selectionIndex = 0;
        selectionIndex < (await selections.count());
        selectionIndex += 1
      ) {
        const selection = selections.nth(selectionIndex);
        await selection.click();
        const header = page.locator('[data-ui="popup.inline-curtain.header"]');
        await expect(header).toBeVisible();
        const checkboxes = header.locator('..').getByRole('checkbox');
        for (const checkbox of await checkboxes.all()) {
          await expect(checkbox).toHaveClass(/sniptale-checkbox/u);
        }
        const checkbox = checkboxes.first();
        if ((await checkbox.count()) && (await checkbox.isEnabled())) {
          const accepted = await checkbox.isChecked();
          await checkbox.click();
          await expect(checkbox).toBeChecked({ checked: !accepted });
          await checkbox.click();
          await expect(checkbox).toBeChecked({ checked: accepted });
        }
        await header.getByRole('button').click();
        await expect(header).toHaveCount(0);
      }
      const settingsKeys =
        destination.key === 'popup.export.packageDestinationHtml'
          ? (['popup.export.htmlResourceSettingsTitle', 'popup.export.pageSettingsTitle'] as const)
          : ([
              'popup.export.packageCaptureSettingsTitle',
              'popup.export.pageSettingsTitle',
            ] as const);
      for (const key of settingsKeys) {
        const label = translate(key, locale);
        const trigger = page.getByRole('button', { name: label, exact: true });
        await trigger.click();
        const header = page.locator('[data-ui="popup.inline-curtain.header"]');
        await expect(header).toBeVisible();
        await inspectPopupTypography(page, 'scrolling-panel');
        const checkbox = header.locator('..').getByRole('checkbox').first();
        if (await checkbox.count()) {
          await expect(checkbox).toHaveClass(/sniptale-checkbox/u);
          const accepted = await checkbox.isChecked();
          await checkbox.click();
          await expect(checkbox).toBeChecked({ checked: !accepted });
          if (key === 'popup.export.htmlResourceSettingsTitle') {
            await expect(checkbox).toBeEnabled();
          } else {
            await expect(checkbox).toBeFocused();
          }
          await checkbox.click();
          await expect(checkbox).toBeChecked({ checked: accepted });
          if (key === 'popup.export.htmlResourceSettingsTitle') {
            await expect(checkbox).toBeEnabled();
            const focusableCount = await header
              .locator('..')
              .locator('button:enabled, input:enabled')
              .count();
            for (let step = 0; step < focusableCount; step += 1) {
              await page.keyboard.press('Tab');
              if (await checkbox.evaluate((node) => node === document.activeElement)) break;
            }
            await expect(checkbox).toBeFocused();
            expect(await checkbox.evaluate((node) => node.matches(':focus-visible'))).toBe(true);
          } else {
            await expect(checkbox).toBeFocused();
          }
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
            path: info.outputPath(`${destination.key}-${key}-menu-${index}.png`),
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
          path: info.outputPath(`${destination.key}-${key}.png`),
          fullPage: false,
          animations: 'disabled',
        });
        await header.getByRole('button').click();
        await expect(header).toHaveCount(0);
        await expect(trigger).toBeFocused();
        expect(await trigger.evaluate((node) => node.matches(':focus-visible'))).toBe(false);
      }
    }
  }
}

for (const locale of ['ru', 'en'] as const) {
  for (const theme of ['light', 'dark'] as const) {
    test(`popup stylesheet isolation ${locale} ${theme}`, async ({}, info) => {
      test.setTimeout(120_000);
      const launched = await launchExtensionBrowser({ viewport, fakeMediaDevices: true });
      const host = await startHostServer();
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
        const source = await launched.context.newPage();
        await source.goto(host.origin);
        const page = await launched.context.newPage();
        await page.setViewportSize(viewport);
        await source.bringToFront();
        await page.goto(
          `chrome-extension://${launched.extensionId}/apps/extension/src/popup/index.html`
        );
        const root = page.locator('[data-ui="popup.app.root"]');
        await expect(root).toBeVisible();
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await expect(page.locator('html')).toHaveAttribute('data-locale', locale);
        await expect
          .poll(() =>
            page.evaluate(async () => {
              const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
              return tab?.url;
            })
          )
          .toBe(`${host.origin}/`);
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
          await inspectPopupPanels(page, locale, route, info);
        }
      } finally {
        await closeExtensionBrowser(launched, { removeUserDataDir: true });
        await new Promise<void>((resolve, reject) =>
          host.server.close((error) => (error ? reject(error) : resolve()))
        );
      }
    });
  }
}
