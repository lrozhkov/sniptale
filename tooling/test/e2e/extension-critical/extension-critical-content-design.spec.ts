import { readFile, writeFile } from 'node:fs/promises';
import type { BrowserContext, Locator, Page, TestInfo, ViewportSize } from '@playwright/test';
import { expect, test } from '../support/extension-fixture';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { translate } from '../../../../apps/extension/src/platform/i18n';

type Locale = 'ru' | 'en';
type Theme = 'light' | 'dark';
type Composition = { locale: Locale; theme: Theme; viewport: ViewportSize };
const ui = (page: Page, id: string) => page.locator(`[data-ui="${id}"]`);

test.use({ actionTimeout: 10_000 });

async function settle(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => undefined))
    );
  });
}

async function screenshot(page: Page, info: TestInfo, name: string) {
  await settle(page);
  await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage: false });
}

async function activateHost(
  context: BrowserContext,
  extensionId: string,
  origin: string,
  composition: Composition
) {
  const popup = await context.newPage();
  await popup.goto(
    `chrome-extension://${extensionId}/apps/extension/src/settings/index.html?section=interface-browser&view=interface`
  );
  await expect(popup.locator('#settings-interface-language')).toBeEnabled();
  await expect
    .poll(() =>
      popup.evaluate(
        async () =>
          typeof (await chrome.storage.local.get('sniptale-locale-preference'))[
            'sniptale-locale-preference'
          ]
      )
    )
    .toBe('string');
  await popup.locator('#settings-interface-language').click();
  await popup
    .getByRole('option', {
      name: composition.locale === 'ru' ? /^(Russian|Русский)$/u : 'English',
      exact: true,
    })
    .click();
  await popup.evaluate(async ({ locale, theme }) => {
    await chrome.storage.local.set({
      'sniptale-locale-preference': locale,
      'sniptale-theme-preference': theme,
    });
  }, composition);
  await popup.goto(`chrome-extension://${extensionId}/apps/extension/src/popup/index.html`);
  const page = await context.newPage();
  await page.setViewportSize(composition.viewport);
  await page.goto(origin);
  const tabId = await popup.evaluate(async (hostOrigin) => {
    const tab = (await chrome.tabs.query({})).find(
      (candidate) => candidate.url === `${hostOrigin}/`
    );
    if (tab?.id === undefined) throw new Error('Host tab not found');
    return tab.id;
  }, origin);
  await popup.evaluate((hostOrigin) => {
    const grant = document.createElement('button');
    grant.textContent = 'Grant test origin';
    grant.onclick = async () => {
      grant.dataset['granted'] = String(
        await chrome.permissions.request({ origins: [`${hostOrigin}/*`] })
      );
    };
    document.body.append(grant);
  }, origin);
  await popup.getByRole('button', { name: 'Grant test origin' }).click();
  await expect(popup.getByRole('button', { name: 'Grant test origin' })).toHaveAttribute(
    'data-granted',
    'true'
  );
  await page.reload();
  const registered = await popup.evaluate(
    async (targetTabId) =>
      chrome.runtime.sendMessage({
        type: 'PAGE_ACCESS',
        operation: 'register-granted-site',
        tabId: targetTabId,
        __sniptaleRuntimeFreshness: { issuedAtEpochMs: Date.now(), nonce: crypto.randomUUID() },
      }),
    tabId
  );
  expect(registered).toMatchObject({ success: true, result: 'registered' });
  const enabled = await popup.evaluate(
    async (targetTabId) =>
      chrome.tabs.sendMessage(targetTabId, {
        type: 'ENABLE_SCREENSHOT_MODE',
        workingMode: 'highlighter',
      }),
    tabId
  );
  expect(enabled).toMatchObject({ success: true });
  await page.bringToFront();
  await expect(page.locator('[data-ui="content.toolbar.root"]')).toBeVisible();
  return { page, popup };
}

async function geometry(page: Page) {
  return page.evaluate(() => {
    const roots = Array.from(document.querySelectorAll('*')).flatMap((element) =>
      element.shadowRoot ? [element.shadowRoot] : []
    );
    const find = (selector: string) =>
      roots.flatMap((root) => Array.from(root.querySelectorAll<HTMLElement>(selector)));
    const describe = (element: HTMLElement) => {
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      return {
        text: element.textContent?.trim().slice(0, 100),
        title: element.title,
        ui: element.dataset['ui'],
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
        font: style.fontFamily,
        size: style.fontSize,
        weight: style.fontWeight,
        lineHeight: style.lineHeight,
        radius: style.borderRadius,
        theme: element.closest('[data-theme]')?.getAttribute('data-theme'),
        rootHost: element.getRootNode() instanceof ShadowRoot,
        rootParent: element.parentElement?.className,
      };
    };
    const host = document.querySelector<HTMLElement>('[data-testid="host-page-title"]')!;
    return {
      viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
      host: describe(host),
      toolbar: find('[data-ui="content.toolbar.root"]').map(describe),
      toolbarButtons: find('[data-ui="content.toolbar.root"] button').map(describe),
      popovers: find('.sniptale-frame-settings-popover').map(describe),
      popoverControls: find(
        '.sniptale-frame-settings-popover button, .sniptale-frame-settings-popover input, .sniptale-frame-settings-popover label'
      ).map(describe),
      authored: find('.sniptale-callout [contenteditable], .sniptale-step-badge').map(describe),
      fontRules: roots.flatMap((root) =>
        Array.from(root.querySelectorAll('style')).flatMap((style) =>
          Array.from(style.sheet?.cssRules ?? [])
            .filter((rule) => rule instanceof CSSFontFaceRule)
            .map((rule) => rule.cssText)
        )
      ),
    };
  });
}

async function platformFonts(context: BrowserContext, page: Page) {
  const session = await context.newCDPSession(page);
  try {
    await session.send('DOM.enable');
    await session.send('CSS.enable');
    const response = await session.send('DOM.getFlattenedDocument', { depth: -1, pierce: true });
    const nodes: {
      nodeId: number;
      parentId?: number;
      nodeName: string;
      nodeValue: string;
      attributes?: string[];
    }[] = response.nodes;
    const byId = new Map(nodes.map((node) => [node.nodeId, node]));
    const inChrome = (nodeId: number | undefined) => {
      while (nodeId) {
        const node = byId.get(nodeId);
        if (!node) return false;
        if (
          node.attributes?.includes('content.toolbar.root') ||
          node.attributes?.includes('native.font-probe') ||
          node.attributes?.some((value) => value.includes('sniptale-frame-settings-popover'))
        )
          return true;
        nodeId = node.parentId;
      }
      return false;
    };
    const samples = nodes
      .filter(
        (node) => node.nodeName === '#text' && node.nodeValue.trim() && inChrome(node.parentId)
      )
      .sort(
        (a, b) =>
          Number(byId.get(b.parentId!)?.attributes?.includes('native.font-probe')) -
          Number(byId.get(a.parentId!)?.attributes?.includes('native.font-probe'))
      )
      .slice(0, 16);
    return await Promise.all(
      samples.map(async (node) => ({
        text: node.nodeValue.trim().slice(0, 80),
        fonts: (await session.send('CSS.getPlatformFontsForNode', { nodeId: node.parentId })).fonts,
      }))
    );
  } finally {
    await session.detach();
  }
}

type FontResponse = { url: string; status: number; bytes: number };

async function withHost(
  context: BrowserContext,
  extensionId: string,
  composition: Composition,
  info: TestInfo,
  run: (page: Page, popup: Page, fonts: FontResponse[]) => Promise<void>
) {
  const origin = 'http://sniptale-content-design.test';
  const fixture = await readFile('tooling/test/e2e/fixtures/host-page.html', 'utf8');
  const body = fixture
    .replace(
      '</head>',
      `<style>
    html {font-size:23px;font-family:Georgia,serif;color-scheme:${composition.theme === 'light' ? 'dark' : 'light'}}
    body {font-family:Georgia,serif;background:#20303e;color:white;min-height:1600px}
    button {font:italic 700 25px Georgia,serif!important;border-radius:40px!important}
    #annotation-target {position:absolute;left:140px;top:310px;width:160px;height:50px}
  </style></head>`
    )
    .replace('</body>', '<button id="annotation-target">Host target</button></body>');
  await context.route(`${origin}/**`, (route) => route.fulfill({ contentType: 'text/html', body }));
  const fonts: FontResponse[] = [];
  const pending: Promise<void>[] = [];
  const observe = (page: Page) =>
    page.on('response', (response) => {
      if (page.url().startsWith(origin) && /inter-.*\.woff2/u.test(response.url()))
        pending.push(
          response.body().then((bytes) => {
            fonts.push({ url: response.url(), status: response.status(), bytes: bytes.byteLength });
          })
        );
    });
  context.on('page', observe);
  const { page, popup } = await activateHost(context, extensionId, origin, composition);
  try {
    expect(await page.evaluate(() => isSecureContext)).toBe(false);
    await settle(page);
    await Promise.all(pending);
    await run(page, popup, fonts);
  } catch (error) {
    await screenshot(page, info, 'failure-ui').catch(() => undefined);
    throw error;
  } finally {
    context.off('page', observe);
    await popup.close();
    await page.close();
    await context.unroute(`${origin}/**`);
  }
}

async function hostTypography(page: Page) {
  return page.locator('[data-testid="host-page-title"], #annotation-target').evaluateAll((nodes) =>
    nodes.map((node) => {
      const style = getComputedStyle(node);
      return {
        font: style.fontFamily,
        size: style.fontSize,
        weight: style.fontWeight,
        lineHeight: style.lineHeight,
        radius: style.borderRadius,
      };
    })
  );
}

async function assertBundledFont(
  context: BrowserContext,
  page: Page,
  fonts: FontResponse[],
  info: TestInfo
) {
  const faces = await page.evaluate(async () => {
    const registered = Array.from(document.fonts).filter((font) =>
      font.family.includes('Sniptale Interface')
    );
    const latin = await document.fonts.load('500 13px "Sniptale Interface"', 'Interface');
    const cyrillic = await document.fonts.load('500 13px "Sniptale Interface"', 'Интерфейс');
    return {
      registered: registered.map((font) => ({
        family: font.family,
        status: font.status,
        unicodeRange: font.unicodeRange,
      })),
      latin: latin.map((font) => ({ family: font.family, status: font.status })),
      cyrillic: cyrillic.map((font) => ({ family: font.family, status: font.status })),
    };
  });
  const painted = await platformFonts(context, page);
  await writeFile(
    info.outputPath('native-font-evidence.json'),
    JSON.stringify({ faces, painted, fonts }, null, 2)
  );
  expect
    .soft(faces.registered.length, 'Actual document FontFace registration is required')
    .toBeGreaterThanOrEqual(2);
  expect
    .soft(faces.latin.length, 'Latin face must load; check() alone is insufficient')
    .toBeGreaterThan(0);
  expect.soft(faces.cyrillic.length, 'Cyrillic face must load').toBeGreaterThan(0);
  expect
    .soft([...faces.latin, ...faces.cyrillic].every((font) => font.status === 'loaded'))
    .toBe(true);
  expect.soft(painted.length, 'Inspect actual painted label glyphs').toBeGreaterThan(0);
  expect
    .soft(
      painted.every((sample) =>
        sample.fonts.some(
          (font: { isCustomFont: boolean; familyName: string; glyphCount: number }) =>
            font.isCustomFont && /Inter/u.test(font.familyName) && font.glyphCount > 0
        )
      ),
      'Every sampled ordinary label must paint with bundled Inter'
    )
    .toBe(true);
  for (const subset of ['latin', 'cyrillic'])
    expect
      .soft(
        fonts.some(
          (font) =>
            font.url.includes(`inter-${subset}-wght-normal.woff2`) &&
            font.status === 200 &&
            font.bytes > 1000
        ),
        `Content document must receive actual ${subset} font bytes`
      )
      .toBe(true);
}

async function assertChrome(panel: Locator, theme: Theme, info: TestInfo, name: string) {
  await expect(panel).toBeVisible();
  await expect.soft(panel).toHaveAttribute('data-theme', theme);
  expect
    .soft(
      await panel.evaluate((node) => node.getRootNode() instanceof ShadowRoot),
      'Detached chrome stays in its owned ShadowRoot'
    )
    .toBe(true);
  const observation = await panel.evaluate((node) => {
    const box = node.getBoundingClientRect();
    const style = getComputedStyle(node);
    const controls = Array.from(
      node.querySelectorAll<HTMLElement>('button, input, .sniptale-parameter-name')
    ).filter((control) => control.getClientRects().length > 0);
    return {
      box: { x: box.x, y: box.y, right: box.right, bottom: box.bottom },
      viewport: { width: innerWidth, height: innerHeight },
      overflow: node.scrollWidth - node.clientWidth,
      font: style.fontFamily,
      controls: controls.map((control) => {
        const rect = control.getBoundingClientRect();
        const computed = getComputedStyle(control);
        return {
          text: control.textContent?.trim(),
          title: control.title,
          left: rect.left,
          right: rect.right,
          top: rect.top,
          height: rect.height,
          font: computed.fontFamily,
          size: computed.fontSize,
          weight: computed.fontWeight,
          lineHeight: computed.lineHeight,
          radius: computed.borderRadius,
        };
      }),
    };
  });
  await writeFile(info.outputPath(`${name}-chrome.json`), JSON.stringify(observation, null, 2));
  expect.soft(observation.box.x).toBeGreaterThanOrEqual(-1);
  expect.soft(observation.box.y).toBeGreaterThanOrEqual(-1);
  expect.soft(observation.box.right).toBeLessThanOrEqual(observation.viewport.width + 1);
  expect.soft(observation.box.bottom).toBeLessThanOrEqual(observation.viewport.height + 1);
  expect
    .soft(observation.overflow, 'Embedded chrome must fit its own width')
    .toBeLessThanOrEqual(1);
  const captionOverflow = await panel.locator('button[data-command-tone]').evaluateAll((buttons) =>
    buttons.flatMap((button) => {
      const box = button.getBoundingClientRect();
      const walker = document.createTreeWalker(button, NodeFilter.SHOW_TEXT);
      const errors = [];
      for (let text = walker.nextNode(); text; text = walker.nextNode()) {
        if (!text.textContent?.trim() || text.parentElement?.closest('.sr-only')) continue;
        const range = document.createRange();
        range.selectNodeContents(text);
        const painted = range.getBoundingClientRect();
        if (painted.width && (painted.left < box.left - 1 || painted.right > box.right + 1))
          errors.push(text.textContent);
      }
      return errors;
    })
  );
  expect
    .soft(captionOverflow, 'Visible ordinary command captions fit their real hit target')
    .toEqual([]);
  const labels = panel.locator('.sniptale-parameter-name:visible');
  for (const label of await labels.all()) {
    await expect.soft(label).toHaveCSS('font-family', /Sniptale Interface/u);
    await expect.soft(label).toHaveCSS('font-size', '13px');
    await expect.soft(label).toHaveCSS('line-height', '18px');
    await expect.soft(label).toHaveCSS('font-weight', '500');
  }
}

async function mixedRowRhythm(
  panel: Locator,
  locale: Locale,
  kind: 'blur' | 'focus',
  info: TestInfo
) {
  const keys =
    kind === 'blur'
      ? ([
          'content.overlayControls.blurStrengthLabelPrefix',
          'content.overlayControls.blurTypeLabel',
          'content.overlayControls.showBorderTitle',
        ] as const)
      : ([
          'content.overlayControls.focusDimmingLabelPrefix',
          'content.overlayControls.focusBlurLabel',
          'content.overlayControls.showBorderTitle',
        ] as const);
  const labels = keys.map((key) => translate(key, locale));
  const rows = await panel.locator('.sniptale-parameter-row').evaluateAll(
    (nodes, names) =>
      nodes.flatMap((node) => {
        const label = node.querySelector<HTMLElement>('.sniptale-parameter-name');
        if (!label || !names.includes(label.textContent?.trim() ?? '')) return [];
        const box = node.getBoundingClientRect();
        const labelBox = label.getBoundingClientRect();
        const range = document.createRange();
        range.selectNodeContents(label);
        const textBox = range.getBoundingClientRect();
        const valueElement = node.querySelector(
          '.sniptale-parameter-value, [data-ui="shared.ui.compact-inspector.numeric-value-field"]'
        );
        if (!valueElement) throw new Error(`Missing value region for ${label.textContent}`);
        const value = valueElement.getBoundingClientRect();
        return [
          {
            label: label.textContent,
            top: box.top,
            height: box.height,
            labelTop: labelBox.top,
            labelHeight: labelBox.height,
            textHeight: textBox.height,
            valueTop: value.top,
            valueBottom: value.bottom,
            layout: node.getAttribute('data-layout'),
          },
        ];
      }),
    labels
  );
  await writeFile(info.outputPath(`${kind}-row-rhythm.json`), JSON.stringify(rows, null, 2));
  expect
    .soft(rows.length, 'Numeric, choice, and switch fields must all use the ordinary row contract')
    .toBe(3);
  if (rows.length !== 3) return;
  rows.sort((a, b) => a.top - b.top);
  for (const row of rows) {
    if (row.layout === 'inline' && row.textHeight <= 19)
      expect
        .soft(Math.abs(row.height - 32), `${row.label}: one-line control height`)
        .toBeLessThanOrEqual(1);
    else {
      expect.soft(row.height, 'Stacked or multiline fields may expand').toBeGreaterThanOrEqual(32);
      expect.soft(row.valueBottom).toBeLessThanOrEqual(row.top + row.height + 1);
      if (row.layout === 'stacked')
        expect.soft(row.valueTop).toBeGreaterThanOrEqual(row.labelTop + row.labelHeight + 3);
    }
  }
  for (let index = 1; index < rows.length; index++) {
    const current = rows[index]!;
    const previous = rows[index - 1]!;
    expect
      .soft(
        Math.abs(current.top - previous.top - previous.height - 4),
        'Mixed ordinary rows retain a four-pixel gap'
      )
      .toBeLessThanOrEqual(1);
    if (
      current.layout === 'inline' &&
      previous.layout === 'inline' &&
      current.textHeight <= 19 &&
      previous.textHeight <= 19
    )
      expect
        .soft(
          Math.abs(current.labelTop - previous.labelTop - 36),
          'Visible one-line label pitch is 32+4'
        )
        .toBeLessThanOrEqual(1);
  }
}

async function reenterHighlighter(page: Page) {
  for (const mode of ['design-review', 'highlighter']) {
    await ui(page, 'content.toolbar.mode-selector-button').click();
    await ui(page, `content.toolbar.mode-option.${mode}`).click();
  }
}

async function createAuthoredCallout(page: Page, locale: Locale) {
  await reenterHighlighter(page);
  const target = (await page.locator('#annotation-target').boundingBox())!;
  await page.mouse.click(target.x + target.width / 2, target.y + target.height / 2);
  await expect(page.locator('.sniptale-frame-container')).toHaveCount(1);
  const trigger = page.locator('.sniptale-frame-toolbar-trigger');
  await expect
    .poll(async () => {
      await page.mouse.move(target.x - 3, target.y + 10);
      return trigger.isVisible();
    })
    .toBe(true);
  await trigger.click();
  await page
    .getByRole('button', {
      name: translate('content.interactiveFrame.calloutAdd', locale),
      exact: true,
    })
    .first()
    .click();
  const comment = page.locator('.sniptale-callout [contenteditable="true"]').last();
  const text = locale === 'ru' ? 'Авторский комментарий' : 'Authored annotation';
  await comment.fill(text);
  await comment.press('Escape');
  await expect(page.locator('.sniptale-callout')).toContainText(text);
  return page.locator('.sniptale-callout [contenteditable]').last();
}

async function authoredTypography(comment: Locator) {
  return comment.evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      text: node.textContent,
      font: style.fontFamily,
      size: style.fontSize,
      weight: style.fontWeight,
      lineHeight: style.lineHeight,
      radius: style.borderRadius,
    };
  });
}

for (const locale of ['ru', 'en'] as const)
  for (const theme of ['light', 'dark'] as const)
    for (const viewport of PRIMARY_BROWSER_VIEWPORTS)
      test(`native content design ${locale} ${theme} ${viewport.name}`, async ({
        context,
        extensionId,
      }, info) => {
        test.setTimeout(120_000);
        await withHost(
          context,
          extensionId,
          { locale, theme, viewport: viewport.size },
          info,
          async (page, _popup, fonts) => {
            const hostBefore = await hostTypography(page);
            const comment = await createAuthoredCallout(page, locale);
            const authoredBefore = await authoredTypography(comment);
            expect(authoredBefore.size).toBe('14px');
            expect(authoredBefore.weight).toBe('400');
            await screenshot(page, info, 'toolbar-and-authored');
            const trigger = ui(page, 'content.toolbar.future-frame-style.menu');
            await trigger.click();
            const panel = page.locator('.sniptale-frame-settings-popover');
            await assertChrome(panel, theme, info, 'frame-templates');
            await screenshot(page, info, 'frame-templates');
            await assertBundledFont(context, page, fonts, info);
            for (const [mode, key] of [
              ['blur', 'content.interactiveFrame.effectBlur'],
              ['focus', 'content.interactiveFrame.effectFocus'],
            ] as const) {
              await panel
                .getByRole('button', { name: translate(key, locale), exact: true })
                .click();
              const accepted = panel.getByRole('button', {
                name: translate(key, locale),
                exact: true,
              });
              await expect.soft(accepted).toHaveAttribute('aria-pressed', 'true');
              await expect.soft(accepted).toHaveCSS('font-size', '13px');
              await expect.soft(accepted).toHaveCSS('line-height', '18px');
              await expect.soft(accepted).toHaveCSS('border-radius', '4px');
              await expect.soft(accepted).toHaveCSS('border-top-color', 'rgba(0, 0, 0, 0)');
              await expect.soft(accepted).toHaveCSS('box-shadow', 'none');
              await mixedRowRhythm(panel, locale, mode, info);
              await assertChrome(panel, theme, info, mode);
              await screenshot(page, info, `${mode}-mixed-properties`);
            }
            await trigger.click();
            await expect(panel).toHaveCount(0);
            for (const [id, panelId] of [
              [
                'content.toolbar.future-frame-callout.menu',
                'content.toolbar.future-callout-popover',
              ],
              [
                'content.toolbar.future-frame-step-badge.menu',
                'content.toolbar.future-step-badge-popover',
              ],
            ]) {
              const menu = ui(page, id!);
              await menu.click();
              const detached = ui(page, panelId!);
              await assertChrome(detached, theme, info, panelId!.split('.').at(-1)!);
              await screenshot(page, info, panelId!.split('.').at(-1)!);
              await menu.click();
              await expect(detached).toHaveCount(0);
            }
            expect(await hostTypography(page)).toEqual(hostBefore);
            expect(await authoredTypography(comment)).toEqual(authoredBefore);
            await writeFile(
              info.outputPath('composition-geometry.json'),
              JSON.stringify(await geometry(page), null, 2)
            );
          }
        );
      });

async function openCalloutSettings(page: Page, locale: Locale) {
  const handle = page.locator('.sniptale-callout-settings-handle').last();
  await page.locator('.sniptale-callout').last().hover();
  await expect(handle).toBeVisible();
  await handle.click();
  const panel = ui(page, 'content.callout-settings.popover');
  await expect(panel).toBeVisible();
  const fork = panel.getByRole('button', {
    name: translate('content.templateFork.fork', locale),
    exact: true,
  });
  if (await fork.count()) await fork.first().click();
  await expect(ui(page, 'shared.callout-alignment')).toBeVisible();
  return panel;
}

test('native annotation property Undo and temporary draft recovery preserve authored text', async ({
  context,
  extensionId,
}, info) => {
  test.setTimeout(120_000);
  const locale = 'ru';
  await withHost(
    context,
    extensionId,
    { locale, theme: 'light', viewport: PRIMARY_BROWSER_VIEWPORTS[0].size },
    info,
    async (page) => {
      const hostBefore = await hostTypography(page);
      const comment = await createAuthoredCallout(page, locale);
      const authoredBefore = await authoredTypography(comment);
      let panel = await openCalloutSettings(page, locale);
      await assertChrome(panel, 'light', info, 'selected-callout');
      const alignmentBefore = await comment.evaluate((node) => getComputedStyle(node).textAlign);
      const alignment = ui(page, 'shared.callout-alignment');
      await alignment
        .getByRole('button', { name: translate('content.callout.alignRight', locale), exact: true })
        .click();
      await expect(comment).toHaveCSS('text-align', 'right');
      await screenshot(page, info, 'selected-callout-alignment');
      await panel
        .getByRole('button', {
          name: translate('content.callout.closeSettings', locale),
          exact: true,
        })
        .click();
      await expect(panel).toHaveCount(0);
      const undo = ui(page, 'content.toolbar.history-undo-button');
      await expect(undo).toBeEnabled();
      await undo.click();
      await expect(comment).toHaveCSS('text-align', alignmentBefore);
      panel = await openCalloutSettings(page, locale);
      await panel
        .getByRole('navigation')
        .getByRole('button', { name: translate('content.callout.manualCss', locale), exact: true })
        .click();
      const css = panel.locator('textarea');
      await css.fill('color: url(unsafe-value);');
      await expect(css).toHaveAttribute('aria-invalid', 'true');
      expect(await authoredTypography(comment)).toEqual(authoredBefore);
      await css.fill('opacity: 0.8;');
      await expect(css).toHaveAttribute('aria-invalid', 'false');
      await panel
        .getByRole('button', {
          name: translate('content.templateFork.backToTemplates', locale),
          exact: true,
        })
        .click();
      const guard = ui(page, 'content.template-fork.return-guard');
      await expect(guard).toBeVisible();
      const continueEditing = guard.getByRole('button', {
        name: translate('content.templateFork.continueEditing', locale),
        exact: true,
      });
      await continueEditing.scrollIntoViewIfNeeded();
      await expect(continueEditing).toBeInViewport({ ratio: 1 });
      await screenshot(page, info, 'temporary-draft-return-guard');
      await continueEditing.click();
      await panel
        .getByRole('navigation')
        .getByRole('button', { name: translate('content.callout.manualCss', locale), exact: true })
        .click();
      await expect(css).toHaveValue('opacity: 0.8;');
      await expect(css).toHaveAttribute('aria-invalid', 'false');
      await panel
        .getByRole('button', {
          name: translate('content.templateFork.backToTemplates', locale),
          exact: true,
        })
        .click();
      await guard
        .getByRole('button', {
          name: translate('content.templateFork.discard', locale),
          exact: true,
        })
        .click();
      await expect(css).toHaveCount(0);
      await expect(
        panel
          .getByRole('button', {
            name: translate('content.templateFork.fork', locale),
            exact: true,
          })
          .first()
      ).toBeVisible();
      expect(await authoredTypography(comment)).toEqual(authoredBefore);
      expect(await hostTypography(page)).toEqual(hostBefore);
      await screenshot(page, info, 'discard-restores-template');
    }
  );
});

test('native content zoom and embedded widths preserve owned chrome reachability', async ({
  context,
  extensionId,
}, info) => {
  test.setTimeout(120_000);
  await withHost(
    context,
    extensionId,
    { locale: 'en', theme: 'dark', viewport: PRIMARY_BROWSER_VIEWPORTS[0].size },
    info,
    async (page, popup) => {
      const tabId = await popup.evaluate(async (url) => {
        const tab = (await chrome.tabs.query({})).find((tab) => tab.url === url);
        if (tab?.id === undefined) throw new Error('Host tab not found');
        return tab.id;
      }, page.url());
      const snapshots = [];
      for (const zoom of [0.8, 1, 1.25, 2]) {
        await popup.evaluate(async ({ tabId, zoom }) => chrome.tabs.setZoom(tabId, zoom), {
          tabId,
          zoom,
        });
        await expect
          .poll(() => popup.evaluate(async (id) => chrome.tabs.getZoom(id), tabId))
          .toBe(zoom);
        await page.bringToFront();
        const trigger = ui(page, 'content.toolbar.future-frame-style.menu');
        await expect(trigger).toBeInViewport({ ratio: 1 });
        await trigger.click();
        const panel = page.locator('.sniptale-frame-settings-popover');
        await assertChrome(panel, 'dark', info, `zoom-${zoom}`);
        await screenshot(page, info, `zoom-${zoom}`);
        snapshots.push({ zoom, geometry: await geometry(page) });
        await trigger.click();
        await expect(panel).toHaveCount(0);
      }
      await popup.evaluate(async (id) => chrome.tabs.setZoom(id, 1), tabId);
      await page.setViewportSize({ width: 960, height: 560 });
      const toolbar = ui(page, 'content.toolbar.root');
      await expect(toolbar).toBeInViewport({ ratio: 1 });
      await ui(page, 'content.toolbar.settings-button').click();
      await page
        .getByRole('button', {
          name: translate('content.toolbar.panelFreePlacement', 'en'),
          exact: false,
        })
        .click();
      await page
        .getByRole('button', {
          name: translate('content.toolbar.panelVertical', 'en'),
          exact: false,
        })
        .click();
      await expect(toolbar).toHaveAttribute('data-display-mode', 'vertical');
      await expect(toolbar).toBeInViewport({ ratio: 1 });
      await info.attach('vertical-toolbar-fit.json', {
        body: JSON.stringify(
          await toolbar.evaluate((element) => ({
            viewport: { width: innerWidth, height: innerHeight },
            root: element.getBoundingClientRect().toJSON(),
            gap: getComputedStyle(element).gap,
            children: [...element.children].map((child) => child.getBoundingClientRect().toJSON()),
          }))
        ),
        contentType: 'application/json',
      });
      const handle = ui(page, 'shared.ui.content-toolbar-drag-handle');
      const box = (await handle.boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(20, 40, { steps: 8 });
      await page.mouse.up();
      await expect(toolbar).toBeInViewport({ ratio: 1 });
      await ui(page, 'content.toolbar.future-frame-style.menu').click();
      const panel = page.locator('.sniptale-frame-settings-popover');
      await assertChrome(panel, 'dark', info, 'narrow-vertical-edge');
      await screenshot(page, info, 'narrow-vertical-edge');
      await page.keyboard.press('Escape');
      await expect(panel).toHaveCount(0);
      await page.mouse.move(600, 450);
      await page.mouse.wheel(0, 400);
      await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0);
      await expect(toolbar).toBeInViewport({ ratio: 1 });
      snapshots.push({ zoom: 1, geometry: await geometry(page) });
      await writeFile(
        info.outputPath('native-zoom-embedded-geometry.json'),
        JSON.stringify(snapshots, null, 2)
      );
    }
  );
});
