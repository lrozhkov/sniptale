import { readFile, writeFile } from 'node:fs/promises';
import type { BrowserContext, Locator, Page, TestInfo, ViewportSize } from '@playwright/test';
import { translate, type TranslationKey } from '../../../../apps/extension/src/platform/i18n';
import { expect, test } from '../support/extension-fixture';
import {
  authoredStyle,
  capture,
  title,
  viewerPath,
  withViewer,
  type Composition,
  type FontRequest,
  type SavedViewer,
} from './web-snapshot-viewer-design.fixture';

const interfaceBackingFace = 'Golos UI';
const ui = (page: Page, id: string) => page.locator(`[data-ui="${id}"]`);
const tr = (composition: Composition, key: TranslationKey) => translate(key, composition.locale);

test.use({ actionTimeout: 10_000 });
test.setTimeout(120_000);

async function connectedTab(tab: Locator, page: Page) {
  await expect(tab).toHaveAttribute('aria-selected', 'true');
  await expect(tab).toHaveAttribute('tabindex', '0');
  const panelId = await tab.getAttribute('aria-controls');
  const tabId = await tab.getAttribute('id');
  expect(panelId).toEqual(expect.any(String));
  expect(tabId).toEqual(expect.any(String));
  const panel = page.locator(`[id="${panelId}"]`);
  await expect(panel).toHaveAttribute('role', 'tabpanel');
  await expect(panel).toHaveAttribute('aria-labelledby', tabId!);
  await expect(panel).toBeVisible();
}

async function mode(
  page: Page,
  composition: Composition,
  key: 'staticDocumentMode' | 'assetsMode' | 'visualMode'
) {
  const tabs = ui(page, 'web-snapshot-viewer.mode-tabs');
  const tab = tabs.getByRole('tab', {
    name: tr(composition, `webSnapshotViewer.app.${key}`),
    exact: true,
  });
  await tab.click();
  await connectedTab(tab, page);
  await expect(tabs.locator('[role="tab"][tabindex="0"]')).toHaveCount(1);
}

async function chromeGeometry(page: Page, info: TestInfo) {
  const toolbar = ui(page, 'web-snapshot-viewer.toolbar');
  await expect(toolbar).toBeVisible();
  for (const control of await toolbar.locator('button,a[download]').all()) {
    await expect(control).toHaveCSS('height', '32px');
    await expect(control).toHaveCSS('border-radius', '4px');
    await expect(control).toHaveCSS('font-size', '13px');
    await expect(control).toHaveCSS('line-height', '18px');
    await expect.soft(control).toHaveCSS('font-weight', '400');
  }
  const heading = toolbar.getByText(title, { exact: true });
  await expect(heading).toHaveCSS('font-size', '14px');
  await expect(heading).toHaveCSS('line-height', '20px');
  await expect.soft(heading).toHaveCSS('font-weight', '500');
  if (await heading.evaluate((node) => node.scrollWidth > node.clientWidth))
    await expect(heading).toHaveAttribute('title', title);
  const metadata = page.getByTestId('snapshot-metadata');
  await expect(metadata).toHaveCSS('font-size', '12px');
  await expect(metadata).toHaveCSS('line-height', '16px');
  await expect(metadata).toHaveCSS('font-weight', '400');
  const overflow = await toolbar.evaluate((node) => {
    const root = node.getBoundingClientRect();
    return Array.from(node.querySelectorAll('button,a[download]')).map((control) => {
      const box = control.getBoundingClientRect();
      return Math.max(
        root.left - box.left,
        box.right - root.right,
        root.top - box.top,
        box.bottom - root.bottom
      );
    });
  });
  expect(Math.max(...overflow)).toBeLessThanOrEqual(1);
  await writeFile(info.outputPath('toolbar-geometry.json'), JSON.stringify(overflow));
}

async function paintedInterfaceFont(
  context: BrowserContext,
  page: Page,
  info: TestInfo,
  fontRequests: FontRequest[]
) {
  await page.evaluate(() => document.fonts.ready);
  const role = await ui(page, 'web-snapshot-viewer.toolbar').evaluate((node) => {
    const probe = node.ownerDocument.createElement('span');
    probe.style.fontFamily = 'var(--sniptale-font-interface)';
    node.append(probe);
    const family = getComputedStyle(probe).fontFamily;
    probe.remove();
    return family;
  });
  await expect(ui(page, 'web-snapshot-viewer.toolbar')).toHaveCSS('font-family', role);
  const registered = await page.evaluate(
    (family) =>
      Array.from(document.fonts).some(
        (font) =>
          font.family.replaceAll(/["']/gu, '') ===
            family.split(',')[0]!.replaceAll(/["']/gu, '').trim() && font.status === 'loaded'
      ),
    role
  );
  expect(registered).toBe(true);
  const faceSources = await page.evaluate((family) => {
    const alias = family.split(',')[0]!.replaceAll(/["']/gu, '').trim();
    return Array.from(document.styleSheets).flatMap((sheet) =>
      Array.from(sheet.cssRules).flatMap((rule) => {
        if (
          !(rule instanceof CSSFontFaceRule) ||
          rule.style.getPropertyValue('font-family').replaceAll(/["']/gu, '').trim() !== alias
        )
          return [];
        return Array.from(
          rule.style.getPropertyValue('src').matchAll(/url\(["']?([^"')]+)["']?\)/gu)
        ).map((match) => new URL(match[1]!, sheet.href ?? document.baseURI).href);
      })
    );
  }, role);
  await writeFile(
    info.outputPath('interface-font-role.json'),
    JSON.stringify({ role, faceSources, fontRequests }, null, 2)
  );
  expect(
    fontRequests.some(
      (request) => faceSources.includes(request.url) && request.status === 200 && request.bytes > 0
    )
  ).toBe(true);
  const session = await context.newCDPSession(page);
  try {
    await session.send('DOM.enable');
    await session.send('CSS.enable');
    const { nodes } = await session.send('DOM.getFlattenedDocument', { depth: -1, pierce: true });
    const byId = new Map(nodes.map((node) => [node.nodeId, node]));
    const inToolbar = (id: number | undefined): boolean => {
      while (id) {
        const node = byId.get(id);
        if (!node) return false;
        if (node.attributes?.includes('web-snapshot-viewer.toolbar')) return true;
        id = node.parentId;
      }
      return false;
    };
    const samples = nodes
      .filter(
        (node) => node.nodeName === '#text' && node.nodeValue.trim() && inToolbar(node.parentId)
      )
      .slice(0, 12);
    const fonts = await Promise.all(
      samples.map(async (node) => ({
        text: node.nodeValue,
        fonts: (await session.send('CSS.getPlatformFontsForNode', { nodeId: node.parentId! }))
          .fonts,
      }))
    );
    await writeFile(info.outputPath('painted-fonts.json'), JSON.stringify(fonts, null, 2));
    expect(
      fonts.some((sample) =>
        sample.fonts.some(
          (font) =>
            font.isCustomFont &&
            font.familyName.includes(interfaceBackingFace) &&
            font.glyphCount > 0
        )
      )
    ).toBe(true);
  } finally {
    await session.detach();
  }
}

async function preserveAuthored(state: SavedViewer) {
  const authored = state.viewer.frameLocator('iframe').first().locator('#authored-text');
  await expect(authored).toBeVisible();
  expect(await authoredStyle(authored)).toEqual(state.authored);
  await authored.selectText();
  expect(await authored.evaluate((node) => node.ownerDocument.getSelection()?.toString())).toBe(
    state.authored.renderedText
  );
}

async function catalogSection(
  page: Page,
  composition: Composition,
  key: 'exportedImages' | 'downloadedAttachments' | 'pageResources'
) {
  const tabs = ui(page, 'web-snapshot-viewer.catalog-tabs');
  const tab = tabs
    .getByRole('tab')
    .filter({ hasText: tr(composition, `webSnapshotViewer.app.${key}`) });
  await tab.click();
  await connectedTab(tab, page);
  await expect(tabs.locator('[role="tab"][tabindex="0"]')).toHaveCount(1);
}

async function catalogComposition(state: SavedViewer, composition: Composition, info: TestInfo) {
  const page = state.viewer;
  await mode(page, composition, 'assetsMode');
  const catalog = page.getByTestId('snapshot-asset-catalog');
  const families: { family: string; text: string }[] = [];
  for (const key of ['exportedImages', 'downloadedAttachments', 'pageResources'] as const) {
    await catalogSection(page, composition, key);
    families.push({ family: key, text: await catalog.innerText() });
    for (const heading of await catalog.locator('h2,h3').all())
      await expect.soft(heading).toHaveCSS('font-weight', '500');
    for (const name of await catalog.locator('article p:first-child').all())
      await expect.soft(name).toHaveCSS('font-weight', '400');
    await capture(page, info, `files-${key}`);
    if (key !== 'pageResources') {
      const row = catalog.locator('article').first();
      expect((await row.boundingBox())!.height).toBeGreaterThanOrEqual(55);
      const name = await row.locator('p').first().boundingBox();
      const action = await row.getByRole('button').first().boundingBox();
      expect.soft(name!.x + name!.width).toBeLessThanOrEqual(action!.x + 1);
    }
  }
  const groupGaps = await catalog
    .locator('[role="tabpanel"] > section')
    .evaluateAll((groups) =>
      groups
        .slice(1)
        .map(
          (group, index) =>
            group.getBoundingClientRect().top - groups[index]!.getBoundingClientRect().bottom
        )
    );
  expect(groupGaps).toHaveLength(2);
  for (const gap of groupGaps) expect.soft(gap).toBeGreaterThanOrEqual(15);
  await expect(catalog).toContainText('image/png');
  await expect(catalog).toContainText('font/woff2');
  await expect(catalog).toContainText('text/css');
  const surface = page.getByTestId('snapshot-viewer-surface');
  const last = catalog.locator('article').last();
  await last.scrollIntoViewIfNeeded();
  await expect(last).toBeInViewport({ ratio: 1 });
  const scroll = await surface.evaluate((node) => ({
    clientHeight: node.clientHeight,
    scrollHeight: node.scrollHeight,
    scrollTop: node.scrollTop,
  }));
  if (scroll.scrollHeight > scroll.clientHeight + 1) expect(scroll.scrollTop).toBeGreaterThan(0);
  await writeFile(
    info.outputPath('catalog-families.json'),
    JSON.stringify({ families, scroll }, null, 2)
  );
  const previewLabel = tr(composition, 'webSnapshotViewer.app.previewAsset');
  for (const kind of ['image', 'style']) {
    const card =
      kind === 'image'
        ? catalog
            .locator('article')
            .filter({ has: page.locator('img') })
            .first()
        : catalog.locator('article').filter({ hasText: 'text/css' });
    const trigger = card.getByRole('button', { name: new RegExp(`^${previewLabel}:`) });
    await expect(trigger).toHaveAttribute('aria-label', new RegExp(`^${previewLabel}:`));
    await trigger.scrollIntoViewIfNeeded();
    await trigger.click();
    const preview = page.getByTestId('snapshot-asset-preview');
    await expect(preview).toBeVisible();
    await expect.soft(preview.getByRole('heading')).toHaveCSS('font-weight', '500');
    if (kind === 'image')
      await expect.soft(preview.getByText('100%', { exact: true })).toHaveCSS('font-weight', '400');
    const back = preview.getByRole('button', {
      name: tr(composition, 'webSnapshotViewer.app.closeAssetPreview'),
      exact: true,
    });
    await expect(back).toBeFocused();
    await expect(preview.locator('img')).toHaveCount(kind === 'image' ? 1 : 0);
    if (kind === 'image') {
      await expect(preview.locator('img')).toHaveJSProperty('naturalWidth', 240);
      const zoom = preview.getByRole('group', {
        name: tr(composition, 'webSnapshotViewer.app.previewZoom'),
      });
      await zoom
        .getByRole('button', { name: tr(composition, 'webSnapshotViewer.app.zoomIn'), exact: true })
        .click();
      await expect(zoom.getByText('125%', { exact: true })).toBeVisible();
      await zoom
        .getByRole('button', {
          name: tr(composition, 'webSnapshotViewer.app.zoomOut'),
          exact: true,
        })
        .click();
      await expect(zoom.getByText('100%', { exact: true })).toBeVisible();
    }
    await capture(page, info, `inline-preview-${kind}`);
    await back.press('Escape');
    await expect(preview).toHaveCount(0);
    await expect(trigger).toBeFocused();
  }
}

async function keyboardTabPaint(tab: Locator) {
  await expect(tab).toBeFocused();
  expect(await tab.evaluate((node) => node.matches(':focus-visible'))).toBe(true);
  const colors = await tab.evaluate((node) => {
    const probe = node.ownerDocument.createElement('span');
    node.append(probe);
    probe.style.color = 'var(--sniptale-color-accent)';
    const focus = getComputedStyle(probe).color;
    probe.style.color = 'var(--sniptale-color-text-primary)';
    const selected = getComputedStyle(probe).color;
    probe.remove();
    return { focus, selected };
  });
  await expect(tab).toHaveCSS('outline-style', 'solid');
  await expect(tab).toHaveCSS('outline-width', '2px');
  await expect(tab).toHaveCSS('outline-color', colors.focus);
  await expect(tab).toHaveCSS('border-bottom-width', '2px');
  await expect(tab).toHaveCSS('border-bottom-color', colors.selected);
}

async function pointerTabPaint(tab: Locator) {
  await tab.click();
  await expect(tab).toBeFocused();
  expect(await tab.evaluate((node) => node.matches(':focus-visible'))).toBe(false);
  await expect(tab).toHaveCSS('outline-style', 'none');
}

async function nativeTabTraversal(page: Page, composition: Composition, info: TestInfo) {
  const modes = ui(page, 'web-snapshot-viewer.mode-tabs');
  const first = modes.getByRole('tab').first();
  await pointerTabPaint(first);
  await expect(modes.locator('[role="tab"][tabindex="0"]')).toHaveCount(1);
  await capture(page, info, 'mode-tab-pointer-focus');
  await page.keyboard.press('Shift+Tab');
  expect(await modes.evaluate((node) => node.contains(node.ownerDocument.activeElement))).toBe(
    false
  );
  await page.keyboard.press('Tab');
  await keyboardTabPaint(first);
  await capture(page, info, 'mode-tab-keyboard-focus');
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('button', {
      name: tr(composition, 'webSnapshotViewer.app.collapseToolbar'),
      exact: true,
    })
  ).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(first).toBeFocused();
  await first.press('ArrowRight');
  await connectedTab(modes.getByRole('tab').nth(1), page);
  await modes.getByRole('tab').nth(1).press('End');
  await connectedTab(modes.getByRole('tab').last(), page);
  await modes.getByRole('tab').last().press('Home');
  await connectedTab(first, page);
  await first.press('ArrowRight');
  const catalog = ui(page, 'web-snapshot-viewer.catalog-tabs');
  const catalogFirst = catalog.getByRole('tab').first();
  await pointerTabPaint(catalogFirst);
  await expect(catalog.locator('[role="tab"][tabindex="0"]')).toHaveCount(1);
  await capture(page, info, 'catalog-tab-pointer-focus');
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByTestId('snapshot-viewer-surface')).toBeFocused();
  await page.keyboard.press('Tab');
  await keyboardTabPaint(catalogFirst);
  await capture(page, info, 'catalog-tab-keyboard-focus');
  const associatedPanelId = await catalogFirst.getAttribute('aria-controls');
  await page.keyboard.press('Tab');
  await expect(page.locator(`[id="${associatedPanelId}"]`)).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(catalogFirst).toBeFocused();
  await catalogFirst.press('ArrowRight');
  await connectedTab(catalog.getByRole('tab').nth(1), page);
  await catalog.getByRole('tab').nth(1).press('End');
  await connectedTab(catalog.getByRole('tab').last(), page);
  await catalog.getByRole('tab').last().press('Home');
  await connectedTab(catalogFirst, page);
  await mode(page, composition, 'staticDocumentMode');
}

const primary: ViewportSize[] = [
  { width: 1280, height: 560 },
  { width: 1920, height: 900 },
];
for (const locale of ['ru', 'en'] as const)
  for (const theme of ['light', 'dark'] as const)
    for (const viewport of primary) {
      const composition = { locale, theme, viewport };
      test(`native viewer design ${locale} ${theme} ${viewport.width}`, async ({
        context,
        extensionId,
        hostOrigin,
      }, info) => {
        await withViewer(context, extensionId, hostOrigin, composition, info, async (state) => {
          await chromeGeometry(state.viewer, info);
          await paintedInterfaceFont(context, state.viewer, info, state.fontRequests);
          await preserveAuthored(state);
          await capture(state.viewer, info, 'static-document');
          await catalogComposition(state, composition, info);
          await mode(state.viewer, composition, 'visualMode');
          await expect(state.viewer.getByTestId('snapshot-visual-image')).toHaveJSProperty(
            'naturalWidth',
            1280
          );
          await capture(state.viewer, info, 'screenshot');
          await mode(state.viewer, composition, 'staticDocumentMode');
          await preserveAuthored(state);
        });
      });
    }

test('native viewer commands, navigation and original download', async ({
  context,
  extensionId,
  hostOrigin,
}, info) => {
  const composition: Composition = { locale: 'en', theme: 'light', viewport: primary[0]! };
  await withViewer(context, extensionId, hostOrigin, composition, info, async (state) => {
    const page = state.viewer;
    await nativeTabTraversal(page, composition, info);
    await page.evaluate(() =>
      document.documentElement.style.setProperty('--sniptale-font-interface', 'Georgia, serif')
    );
    await preserveAuthored(state);
    await page.evaluate(() =>
      document.documentElement.style.removeProperty('--sniptale-font-interface')
    );
    const toolbar = ui(page, 'web-snapshot-viewer.toolbar');
    const enable = tr(composition, 'webSnapshotViewer.app.enableExternalLinks');
    const disable = tr(composition, 'webSnapshotViewer.app.disableExternalLinks');
    const links = toolbar
      .getByRole('button')
      .filter({ hasText: tr(composition, 'webSnapshotViewer.app.externalLinks') });
    await expect(links).toHaveAttribute('aria-label', enable);
    const box = (await links.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await expect(links).toHaveAttribute('aria-pressed', 'false');
    await page.mouse.move(5, 500);
    await page.mouse.up();
    await expect(links).toHaveAttribute('aria-pressed', 'false');
    await links.click();
    await expect(links).toHaveAttribute('aria-label', disable);
    await links.press('Space');
    await expect(links).toHaveAttribute('aria-label', enable);
    await toolbar
      .getByRole('button', {
        name: tr(composition, 'webSnapshotViewer.app.collapseToolbar'),
        exact: true,
      })
      .click();
    await expect(toolbar).toHaveCount(0);
    await expect(
      page.getByRole('tabpanel', {
        name: tr(composition, 'webSnapshotViewer.app.staticDocumentMode'),
        exact: true,
      })
    ).toBeVisible();
    await page
      .getByRole('button', {
        name: tr(composition, 'webSnapshotViewer.app.expandToolbar'),
        exact: true,
      })
      .click();
    await expect(toolbar).toBeVisible();
    await mode(page, composition, 'visualMode');
    const actual = toolbar.getByRole('button', {
      name: tr(composition, 'webSnapshotViewer.app.actualSize'),
      exact: true,
    });
    await toolbar
      .getByRole('button', { name: tr(composition, 'webSnapshotViewer.app.zoomIn'), exact: true })
      .click();
    await expect(actual).toHaveText('110%');
    await actual.click();
    await expect(actual).toHaveText('100%');
    const fit = toolbar.getByRole('button', {
      name: tr(composition, 'webSnapshotViewer.app.fitToWidth'),
      exact: true,
    });
    await fit.click();
    await expect(fit).toHaveAttribute('aria-pressed', 'true');
    await mode(page, composition, 'assetsMode');
    await catalogSection(page, composition, 'pageResources');
    const card = page
      .getByTestId('snapshot-asset-catalog')
      .locator('article')
      .filter({ has: page.locator('img') })
      .first();
    const original = card.getByRole('link', { name: /^Download original:/u });
    await expect(original).toHaveAttribute('download', /source-image\.png$/u);
    const waiting = page.waitForEvent('download');
    await original.click();
    const download = await waiting;
    expect(await download.failure()).toBeNull();
    const path = await download.path();
    if (!path) throw new Error('Native original download unavailable');
    expect((await readFile(path)).equals(state.image)).toBe(true);
    await capture(page, info, 'download-completed');
  });
});

test('native viewer desktop boundary, browser zoom and actual error routes', async ({
  context,
  extensionId,
  hostOrigin,
}, info) => {
  const composition: Composition = { locale: 'ru', theme: 'dark', viewport: primary[0]! };
  await withViewer(context, extensionId, hostOrigin, composition, info, async (state) => {
    const page = state.viewer;
    const outer = ui(page, 'web-snapshot-viewer.chrome');
    const measurements = [];
    for (const width of [1279, 1280, 1281, 1100]) {
      await page.setViewportSize({ width, height: 560 });
      const metrics = await outer.evaluate((node) => ({
        client: node.clientWidth,
        scroll: node.scrollWidth,
      }));
      measurements.push({ width, ...metrics });
      expect(metrics.scroll).toBeGreaterThanOrEqual(1280);
      if (width >= 1280) expect(metrics.scroll).toBeLessThanOrEqual(metrics.client + 1);
      if (width === 1100) {
        expect(metrics.scroll).toBeGreaterThan(metrics.client);
        await outer.evaluate((node) => {
          node.scrollLeft = node.scrollWidth;
        });
        expect(await outer.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);
      }
      await capture(page, info, `boundary-${width}`);
    }
    await page.setViewportSize(primary[0]!);
    const tabId = await state.popup.evaluate(async (url) => {
      const tab = (await chrome.tabs.query({})).find((entry) => entry.url === url);
      if (tab?.id === undefined) throw new Error('Viewer tab unavailable');
      return tab.id;
    }, page.url());
    await state.popup.evaluate((id) => chrome.tabs.setZoom(id, 1.25), tabId);
    expect(await state.popup.evaluate((id) => chrome.tabs.getZoom(id), tabId)).toBe(1.25);
    await capture(page, info, 'browser-zoom125');
    await state.popup.evaluate((id) => chrome.tabs.setZoom(id, 1), tabId);
    await mode(page, composition, 'visualMode');
    await expect(page.getByTestId('snapshot-visual-image')).toBeVisible();
    await capture(page, info, 'screenshot-after-browser-zoom');
    await writeFile(
      info.outputPath('desktop-boundaries.json'),
      JSON.stringify(measurements, null, 2)
    );
    const base = `chrome-extension://${extensionId}/${viewerPath}`;
    await page.goto(base);
    await expect(
      page.getByText(tr(composition, 'webSnapshotViewer.app.missingSnapshotId'), { exact: true })
    ).toBeVisible();
    await capture(page, info, 'missing-id');
    await page.goto(`${base}?snapshotId=unavailable-native-fixture`);
    await expect(
      page.getByText(tr(composition, 'common.errors.loadFailed'), { exact: false })
    ).toBeVisible();
    await capture(page, info, 'unavailable-package');
  });
});
