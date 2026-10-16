import { readFile, writeFile } from 'node:fs/promises';
import type { BrowserContext, Locator, Page, TestInfo, ViewportSize } from '@playwright/test';
import type { AppLocale } from '../../../../apps/extension/src/platform/i18n';
import { expect } from '../support/extension-fixture';
import {
  EMPTY_EXPORT_OPTIONS,
  sendRuntimeMessage,
  waitForPagePackageSave,
} from '../security/support';

export type Composition = { locale: AppLocale; theme: 'light' | 'dark'; viewport: ViewportSize };
export const viewerPath = 'apps/extension/src/web-snapshot-viewer/index.html';
export const title = [
  'Saved reference — source typography, downloadable resources and an intentionally long',
  'document title for compact desktop layout and localization proof',
].join(' ');
const sourcePath = [
  '/reference/source-typography-and-downloadable-resources',
  '?collection=an-intentionally-long-reference-name-for-narrow-desktop-layout-proof',
].join('');
const attachmentName =
  'reference-notes-with-an-intentionally-long-file-name-for-localization-and-layout-proof.txt';

export async function capture(page: Page, info: TestInfo, name: string) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    );
  });
  await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage: false });
}

async function admitSource(context: BrowserContext, extensionId: string, origin: string) {
  const source = await context.newPage();
  await source.setViewportSize({ width: 1280, height: 560 });
  await source.goto(`${origin}${sourcePath}`);
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/apps/extension/src/popup/index.html`);
  await popup.evaluate((hostOrigin) => {
    const button = document.createElement('button');
    button.textContent = 'Grant viewer fixture origin';
    button.onclick = async () => {
      button.dataset['granted'] = String(
        await chrome.permissions.request({ origins: [`${hostOrigin}/*`] })
      );
    };
    document.body.append(button);
  }, origin);
  const permission = popup.getByRole('button', {
    name: 'Grant viewer fixture origin',
    exact: true,
  });
  await permission.click();
  await expect(permission).toHaveAttribute('data-granted', 'true');
  const tabId = await popup.evaluate(async (url) => {
    const tab = (await chrome.tabs.query({})).find((candidate) => candidate.url === url);
    if (tab?.id === undefined) throw new Error('Native source tab missing');
    return tab.id;
  }, source.url());
  await source.reload();
  expect(
    await sendRuntimeMessage(popup, {
      type: 'PAGE_ACCESS',
      operation: 'register-granted-site',
      tabId,
    })
  ).toMatchObject({ success: true, result: 'registered' });
  await source.bringToFront();
  const browser = context.browser();
  if (!browser) throw new Error('Native extension browser unavailable');
  const cdp = await browser.newBrowserCDPSession();
  try {
    const targets = await cdp.send('Target.getTargets', {
      filter: [{ type: 'tab', exclude: false }, { exclude: true }],
    });
    const target = targets.targetInfos.find((candidate) => candidate.url === source.url());
    if (!target) throw new Error('Native source browser target missing');
    await cdp.send('Extensions.triggerAction', { id: extensionId, targetId: target.targetId });
  } finally {
    await cdp.detach();
  }
  const enabled = await popup.evaluate(
    (id) =>
      chrome.tabs.sendMessage(id, {
        type: 'ENABLE_SCREENSHOT_MODE',
        workingMode: 'highlighter',
      }),
    tabId
  );
  expect(enabled).toMatchObject({ success: true });
  await source.bringToFront();
  await expect(source.locator('[data-ui="content.toolbar.root"]')).toBeVisible();
  return { source, popup, tabId };
}

async function installRichSource(context: BrowserContext, origin: string) {
  const font = await readFile('apps/extension/public/fonts/manrope-latin-wght-normal.woff2');
  const image = Buffer.from(
    [
      'iVBORw0KGgoAAAANSUhEUgAAAPAAAACQCAIAAAC5w3GfAAACaUlEQVR42u3SQU0DABQFwWezIamICsACx0qoDKyBjv2T',
      'rIOdfX3/KNzv+3mqWU4z0KIZaNEMtGgGmmagRTPQohlo0Qy0aAaaZqBFM9CiGWjRDLRoBppmoEUz0KIZaNEMNM0Cmmag',
      'RTPQohlo0Qw0zQKaZqBFM9CiGWiaBTTNAppmoEUz0KIZ6DN9Xo//KAS6o5lpoGuamQa6pplpoGuamQa6pplpoGuamQa6',
      'pplpoGuamQa6pplpoGuamQa6pplpoGuamQa6pplpoGuamQa6pplpoGuamQa6pplpoGuamQa6pplpoGuamQa6pplpoGua',
      'mQa6pplpoGuamQa6pplpoGuamQa6pplpoGuaj5sGOqj5smmgm5rPmgY6q/mmaaDLmg+aBjqu+ZppoPuaT5kG+oTmO6aB',
      'vqL5iGmgD2m+YBroW5rzpoE+p7ltGuiLmsOmgT6quWp6NB8PaJqZBppmpoGmmWmgaT5tejSrZHo0q2R6NKtkejSrZHo0',
      'q2R6NKtkejSrZHo0q2R6NKtkejSrZHo0q2R6NKtkejSrZHo0q2R6NKtkejSrZHo0q2R6NKtkejSrZHo0q2R6NKtkejSr',
      'ZHo0q2R6NKtkejSrZHo0q2R6NKtkejSrZHo0q2R6NKtkejSrZHo0q2R6NKtkejSrZHo0q2R6NKtkejSrZHo0q2R6NKtk',
      'ejSrZHo0q2R6NKtkejSrZHo0q2R6NKtkejSrZHo0q2R6NKtkejSrZHo0q2R6NKtkejSrZHo0q2R6NKtkejSrZHo0q2R6',
      'NKtkejSrZHo0q2R6NKtkejSrZHo0q2R6NKtkejSrZPoPFSOrV5uf7aAAAAAASUVORK5CYII=',
    ].join(''),
    'base64'
  );
  await context.route(`${origin}/**`, (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/source-font.woff2')
      return route.fulfill({ contentType: 'font/woff2', body: font });
    if (path === '/source-image.png')
      return route.fulfill({ contentType: 'image/png', body: image });
    if (path === `/${attachmentName}`)
      return route.fulfill({
        contentType: 'text/plain',
        headers: { 'content-disposition': `attachment; filename="${attachmentName}"` },
        body: 'Synthetic saved attachment. Preserve these original bytes.\n',
      });
    if (path === '/source-style.css')
      return route.fulfill({
        contentType: 'text/css',
        body: `
      @font-face{font-family:SavedFixture;src:url('/source-font.woff2') format('woff2');font-weight:100 900}
      body{margin:0;background:#f1e9dd;color:#263747;font:18px Georgia,serif}
      main{max-width:880px;padding:36px 48px}h1{font:600 30px SavedFixture,serif;margin:0 0 18px}
      #authored-text{font:400 18px/28px SavedFixture,serif;max-width:620px}
      img{width:240px;height:144px;background:#b18466;border:1px solid #9c765a;object-fit:contain}
      a{display:block;margin-top:16px;color:#234e76}section{display:flex;gap:28px;margin-top:28px}
    `,
      });
    return route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><html><head>
      <meta charset="utf-8"><title>${title}</title>
      <link rel="stylesheet" href="/source-style.css"></head><body><main>
      <h1>Saved reference document</h1><p id="authored-text">Authored source text keeps its own font,
      dimensions and selectable content while the viewer controls change.</p><section>
      <img src="/source-image.png" alt="Synthetic source image"><div><h2>Original resources</h2>
      <p>Deterministic image, stylesheet, document font and attachment.</p>
      <a href="/${attachmentName}" download="${attachmentName}">Download reference notes</a></div>
      </section></main></body></html>`,
    });
  });
  return image;
}

async function configure(context: BrowserContext, extensionId: string, composition: Composition) {
  const settings = await context.newPage();
  try {
    await settings.goto(
      `chrome-extension://${extensionId}/apps/extension/src/settings/index.html` +
        '?section=interface-browser&view=interface'
    );
    await expect(settings.locator('#settings-interface-language')).toBeEnabled();
    await expect
      .poll(() =>
        settings.evaluate(
          async () =>
            typeof (await chrome.storage.local.get('sniptale-locale-preference'))[
              'sniptale-locale-preference'
            ]
        )
      )
      .toBe('string');
    await settings.locator('#settings-interface-language').click();
    await settings
      .getByRole('option', {
        name: composition.locale === 'en' ? 'English' : /^(Russian|Русский)$/u,
        exact: true,
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
      .toBe(composition.locale);
    await settings.evaluate(async (theme) => {
      await chrome.storage.local.set({ 'sniptale-theme-preference': theme });
      localStorage.setItem('sniptale-theme-preference', theme);
    }, composition.theme);
  } finally {
    await settings.close();
  }
}

export async function authoredStyle(target: Locator) {
  return target.evaluate((node) => {
    const css = getComputedStyle(node);
    const box = node.getBoundingClientRect();
    return {
      text: node.textContent,
      renderedText: node instanceof HTMLElement ? node.innerText : node.textContent,
      font: css.fontFamily,
      size: css.fontSize,
      line: css.lineHeight,
      width: box.width,
      height: box.height,
    };
  });
}

export type FontRequest = { url: string; status: number; bytes: number };

export type SavedViewer = {
  viewer: Page;
  popup: Page;
  snapshotId: string;
  image: Buffer;
  fontRequests: FontRequest[];
  authored: Awaited<ReturnType<typeof authoredStyle>>;
};

export async function withViewer(
  context: BrowserContext,
  extensionId: string,
  origin: string,
  composition: Composition,
  info: TestInfo,
  run: (state: SavedViewer) => Promise<void>
) {
  await configure(context, extensionId, composition);
  const image = await installRichSource(context, origin);
  const { source, popup, tabId } = await admitSource(context, extensionId, origin);
  let viewer: Page | undefined;
  try {
    await source.evaluate(() => document.fonts.ready);
    await expect(source.locator('img')).toHaveJSProperty('naturalWidth', 240);
    const authored = await authoredStyle(source.locator('#authored-text'));
    await source.bringToFront();
    await popup.evaluate((id) => chrome.tabs.update(id, { active: true }), tabId);
    const jobId = crypto.randomUUID();
    expect(
      await sendRuntimeMessage(popup, {
        type: 'START_PAGE_PACKAGE_JOB',
        jobId,
        intent: 'save',
        includeWebCopy: true,
        locale: composition.locale,
        captureTiming: { loadTimeoutMs: 30_000, settleDelayMs: 200 },
        sources: [{ kind: 'tab', tabId, title }],
        options: {
          ...EMPTY_EXPORT_OPTIONS,
          includeFiles: true,
          includeImages: true,
          includeFullPageScreenshot: true,
        },
        warnings: [],
      })
    ).toMatchObject({ success: true });
    const saved = await waitForPagePackageSave(popup, jobId);
    await writeFile(info.outputPath('saved-package-result.json'), JSON.stringify(saved, null, 2));
    if (
      typeof saved !== 'object' ||
      saved === null ||
      !('success' in saved) ||
      saved.success !== true ||
      !('assetId' in saved) ||
      typeof saved.assetId !== 'string'
    )
      throw new Error(`Real package save failed: ${JSON.stringify(saved)}`);
    viewer = await context.newPage();
    const fontRequests: FontRequest[] = [];
    const fontBodies: Promise<void>[] = [];
    viewer.on('response', (response) => {
      if (
        !response.url().startsWith(`chrome-extension://${extensionId}/`) ||
        !response.url().includes('.woff2')
      )
        return;
      const record = { url: response.url(), status: response.status(), bytes: 0 };
      fontRequests.push(record);
      fontBodies.push(
        response
          .body()
          .then((body) => {
            record.bytes = body.byteLength;
          })
          .catch(() => undefined)
      );
    });
    await viewer.setViewportSize(composition.viewport);
    await viewer.goto(
      `chrome-extension://${extensionId}/${viewerPath}?snapshotId=${saved.assetId}`
    );
    await expect(viewer.frameLocator('iframe').first().locator('#authored-text')).toBeVisible();
    await expect(viewer.locator('html')).toHaveAttribute('data-theme', composition.theme);
    await viewer.evaluate(() => document.fonts.ready);
    await Promise.all(fontBodies);
    await run({ viewer, popup, snapshotId: saved.assetId, image, fontRequests, authored });
  } catch (error) {
    const failed = viewer ?? source;
    if (!failed.isClosed()) await capture(failed, info, 'failure-ui').catch(() => undefined);
    throw error;
  } finally {
    await viewer?.close();
    await popup.close();
    await source.close();
    await context.unroute(`${origin}/**`);
  }
}
