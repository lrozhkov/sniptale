import type { Locator, Page, TestInfo, ViewportSize } from '@playwright/test';
import { expect, test as extensionTest } from '../support/extension-fixture';
import { launchExtensionBrowser, closeExtensionBrowser } from '../support/extension-browser-launch';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { openDesignReview } from './extension-critical-page-toolbar.helpers';

const test = extensionTest.extend({
  launchedExtension: [
    async ({}, use) => {
      const launched = await launchExtensionBrowser({ enableBackForwardCache: true });
      try {
        await use(launched);
      } finally {
        await closeExtensionBrowser(launched, { removeUserDataDir: true });
      }
    },
    { scope: 'worker' },
  ],
});

const COMMENT_A = 'Review page A: retain the accepted button feedback.';
const COMMENT_B = 'Review page B: retain this feedback when its target disappears.';

function reviewPage(name: 'A' | 'B'): string {
  const next = name === 'A' ? '/review-b' : '/';
  return `<!doctype html><html><head><meta charset="utf-8"><title>Review page ${name}</title>
    <style>body{margin:0;min-height:100vh;background:#f4f1e9;color:#202628;font:18px/1.5 sans-serif}
    h1{position:absolute;left:72px;top:28px;font-size:28px;font-weight:500}
    a{position:absolute;left:700px;top:130px;color:#164e80}
    button{position:absolute;left:700px;top:230px;width:250px;height:72px;border:1px solid #80878a;
    border-radius:4px;background:white;color:#202628;font:18px/1.5 sans-serif}</style></head>
    <body><h1>Review page ${name}</h1><a id="review-next" href="${next}">Open page ${name === 'A' ? 'B' : 'A'}</a>
    <button id="review-${name.toLowerCase()}-target">Accepted target on page ${name}</button></body></html>`;
}

async function savedSession(popup: Page, page: Page): Promise<string> {
  return popup.evaluate(async (url) => {
    const tab = (await chrome.tabs.query({})).find((candidate) => candidate.url === url);
    const ledger: unknown = (await chrome.storage.local.get('sniptale_design_review_sessions'))[
      'sniptale_design_review_sessions'
    ];
    const claims: unknown = (await chrome.storage.session.get('sniptale_design_review_bindings'))[
      'sniptale_design_review_bindings'
    ];
    const object = (value: unknown): value is Record<string, unknown> =>
      typeof value === 'object' && value !== null;
    if (
      !object(ledger) ||
      !Array.isArray(ledger['entries']) ||
      !object(claims) ||
      !Array.isArray(claims['tabs'])
    )
      return 'null';
    const binding: unknown = claims['tabs'].find(
      (value: unknown) => object(value) && value['tabId'] === tab?.id
    );
    if (!object(binding)) return 'null';
    const entry: unknown = ledger['entries'].find(
      (value: unknown) => object(value) && value['id'] === binding['id']
    );
    return object(entry) && typeof entry['payload'] === 'string' ? entry['payload'] : 'null';
  }, page.url());
}

async function addComment(page: Page, target: string, value: string): Promise<void> {
  await page.locator('[data-ui="content.toolbar.review-tool.comment"]').click();
  const box = (await page.locator(target).boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  const popover = page.locator('[data-ui="content.design-review.popover"]');
  const comment = popover.getByRole('textbox', { name: /Element comment|Комментарий к элементу/u });
  await comment.fill(value);
  await comment.press('Enter');
  await expect(popover).toBeHidden();
}

async function proveFeedbackCommandAccess(
  page: Page,
  panel: Locator,
  rows: Locator,
  viewport: ViewportSize
): Promise<void> {
  const firstDelete = rows
    .first()
    .getByRole('button', { name: /Delete feedback|Удалить отзыв/u, includeHidden: true });
  await page.mouse.move(20, viewport.height - 20);
  await expect(firstDelete).toHaveCSS('opacity', '0');
  await expect(firstDelete).toBeEnabled();
  const syntheticDelete = await page.evaluate(() => {
    const roots: ParentNode[] = [document];
    for (let index = 0; index < roots.length; index += 1) {
      for (const element of roots[index]!.querySelectorAll('*')) {
        if (element.shadowRoot) roots.push(element.shadowRoot);
        if (
          element instanceof HTMLButtonElement &&
          element.querySelector('.lucide-trash-2') &&
          element.closest('[data-ui="content.design-review.feedback-item"]')
        ) {
          element.click();
          return true;
        }
      }
    }
    return false;
  });
  expect(syntheticDelete).toBe(true);
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText(COMMENT_A);

  await rows.first().hover();
  await expect(firstDelete).toHaveCSS('opacity', '1');
  await page.mouse.move(20, viewport.height - 20);
  await expect(firstDelete).toHaveCSS('opacity', '0');
  const firstOpen = rows.first().getByRole('button').first();
  await expect(firstOpen).toBeEnabled();
  await firstOpen.focus();
  await expect(firstDelete).toHaveCSS('opacity', '1');
  await panel.getByRole('button', { name: /Find feedback|Найти замечание/u }).focus();
}

async function proveAggregateReportExport(args: {
  page: Page;
  popup: Page;
  hostOrigin: string;
  viewport: ViewportSize;
  info: TestInfo;
}): Promise<void> {
  const { page, popup, hostOrigin, viewport, info } = args;
  const panel = page.locator('[data-ui="content.design-review.feedback-panel"]');
  const rows = panel.locator('[data-ui="content.design-review.feedback-item"]');
  await page.locator('[data-ui="content.toolbar.annotation-export-button"]').click();
  await page.locator('[data-ui="content.toolbar.annotation-export.copy"]').click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain(COMMENT_A);
  const report = await page.evaluate(() => navigator.clipboard.readText());
  expect(report).toContain(COMMENT_B);
  expect(report).toContain(`${hostOrigin}/`);
  expect(report).toContain(`${hostOrigin}/review-b`);

  const saved = await savedSession(popup, page);
  const capturedPixels = saved.match(/data:image\/png;base64,[A-Za-z0-9+/=]+/u)?.[0];
  expect(capturedPixels).toBeTruthy();
  await rows.filter({ hasText: COMMENT_A }).hover();
  const preview = page.locator('[data-ui="content.design-review.feedback-preview"]');
  const snapshotHost = preview.locator('[data-ui="content.design-review.feedback-snapshot"]');
  await expect(snapshotHost).toBeVisible();
  expect(await snapshotHost.evaluate((element) => element.shadowRoot)).toBeNull();
  await expect(snapshotHost.locator('img')).toHaveCount(0);
  const pageCanReadCapturedPixels = await page.evaluate((pixels) => {
    const roots: ParentNode[] = [document];
    for (let index = 0; index < roots.length; index += 1) {
      for (const element of roots[index]!.querySelectorAll('*')) {
        if (Array.from(element.attributes).some((attribute) => attribute.value.includes(pixels)))
          return true;
        if (element.shadowRoot) roots.push(element.shadowRoot);
      }
    }
    return false;
  }, capturedPixels!);
  expect(pageCanReadCapturedPixels).toBe(false);
  await page.screenshot({
    path: info.outputPath('retained-private-session.png'),
    fullPage: false,
  });
  const bounds = (await panel.boundingBox())!;
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height);
  await page.locator('[data-ui="content.toolbar.annotation-export-button"]').click();
  await page.locator('[data-ui="content.toolbar.annotation-export.pdf"]').click();
  await expect
    .poll(() => page.frames().filter((frame) => frame.url() === 'about:blank').length)
    .toBe(1);
  const reportFrame = page.frames().find((frame) => frame.url() === 'about:blank')!;
  await expect(reportFrame.locator('article')).toHaveCount(2);
  await expect(reportFrame.locator('.page-group')).toHaveCount(2);
  await expect(reportFrame.locator('body')).toContainText(COMMENT_A);
  await expect(reportFrame.locator('body')).toContainText(COMMENT_B);
  await expect(reportFrame.locator('img')).toHaveCount(2);
  await expect
    .poll(() =>
      reportFrame
        .locator('img')
        .evaluateAll((images) =>
          images.every(
            (image) => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0
          )
        )
    )
    .toBe(true);
}

async function proveResumedReview(page: Page, info: TestInfo): Promise<void> {
  const resumedPanel = page.locator('[data-ui="content.design-review.feedback-panel"]');
  if (!(await resumedPanel.isVisible())) {
    await page.locator('[data-ui="content.toolbar.design-review-panel-button"]').click();
  }
  await resumedPanel
    .getByRole('button', { name: /Resume last review|Продолжить последнюю проверку/u })
    .click();
  await expect(resumedPanel.locator('[data-ui="content.design-review.feedback-item"]')).toHaveCount(
    2
  );
  await expect(resumedPanel).toContainText(COMMENT_A);
  await expect(resumedPanel).toContainText(COMMENT_B);
  await expect(page.locator('#review-b-target')).toHaveCount(0);
  await resumedPanel
    .locator('[data-ui="content.design-review.feedback-item"]')
    .filter({ hasText: COMMENT_B })
    .hover();
  await expect(page.locator('[data-ui="content.design-review.feedback-preview"]')).toContainText(
    /Target unavailable on this page|Элемент недоступен на этой странице/u
  );
  await page.screenshot({
    path: info.outputPath('resumed-last-session.png'),
    fullPage: false,
  });
}

async function proveClearRestartsMarkers(
  page: Page,
  hostOrigin: string,
  info: TestInfo
): Promise<void> {
  await page.goto(`${hostOrigin}/`);
  const panel = page.locator('[data-ui="content.design-review.feedback-panel"]');
  const rows = panel.locator('[data-ui="content.design-review.feedback-item"]');
  await expect(rows).toHaveCount(2);
  const clearName = /Clear all feedback|Удалить все отзывы/u;
  await panel.getByRole('button', { name: clearName }).click();
  const confirmation = page.getByRole('alertdialog');
  await confirmation.getByRole('button', { name: clearName }).click();
  await expect(confirmation).toBeHidden();
  await expect(rows).toHaveCount(0);
  await addComment(page, '#review-a-target', 'First feedback after Clear');
  const marker = page.locator('[data-ui="content.annotation-marker-button"]');
  await expect(marker).toHaveCount(1);
  await expect(marker).toHaveAttribute('aria-label', /(?:Feedback|Замечание|Отзыв) 1:/u);
  await page.locator('[data-ui="content.toolbar.annotation-export-button"]').click();
  await page.locator('[data-ui="content.toolbar.annotation-export.copy"]').click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toContain('First feedback after Clear');
  const report = await page.evaluate(() => navigator.clipboard.readText());
  expect(report).toContain('## Design review feedback 1');
  expect(report).toContain('Feedback marker: 1');
  await page.reload();
  await expect(rows).toHaveCount(1);
  await expect(marker).toHaveAttribute('aria-label', /(?:Feedback|Замечание|Отзыв) 1:/u);
  await page.screenshot({ path: info.outputPath('clear-restarts-markers.png'), fullPage: false });
}

async function proveCompactPanel(page: Page, popup: Page, info: TestInfo): Promise<void> {
  const panel = page.locator('[data-ui="content.design-review.feedback-panel"]');
  for (let index = 0; index < 2; index++) {
    await page.evaluate((number) => {
      const target = document.createElement('button');
      target.id = `compact-target-${number}`;
      target.textContent = `Compact target ${number}`;
      target.style.top = `${330 + number * 90}px`;
      document.body.append(target);
    }, index);
    await addComment(
      page,
      `#compact-target-${index}`,
      `Compact feedback ${index}: a long summary
with more detail kept in the preview.`
    );
  }
  const rows = panel.locator('[data-ui="content.design-review.feedback-item"]');
  await expect(rows).toHaveCount(3);
  await expect
    .poll(
      async () =>
        ((await savedSession(popup, page)).match(/data:image\/png;base64,/gu) ?? []).length
    )
    .toBe(3);
  await expect
    .poll(() =>
      panel.evaluate((element) => {
        let current: Element | null = element;
        while (current) {
          if (getComputedStyle(current).opacity !== '1') return false;
          const root = current.getRootNode();
          current = current.parentElement ?? (root instanceof ShadowRoot ? root.host : null);
        }
        return true;
      })
    )
    .toBe(true);
  await expect(panel.locator('input')).toHaveCount(0);
  const search = panel.getByRole('button', { name: /Find feedback|Найти замечание/u });
  await search.click();
  const input = panel.getByRole('textbox', { name: /Find feedback|Найти замечание/u });
  await expect(input).toBeFocused();
  await input.fill('Compact feedback 1');
  await expect(rows).toHaveCount(1);
  await page.screenshot({ path: info.outputPath('compact-panel-search.png'), fullPage: false });
  await input.press('Escape');
  await expect(input).toHaveCount(0);
  await expect(search).toBeFocused();
  await expect(rows).toHaveCount(3);
  await panel.getByRole('button', { name: /Filter by action|Фильтр по действию/u }).click();
  await panel.getByRole('menuitemradio', { name: /Refine|Доработать/u }).click();
  await expect(rows).toHaveCount(3);
  const resize = panel.getByRole('separator', {
    name: /Resize feedback panel height|Изменить высоту панели отзывов/u,
  });
  await resize.focus();
  await resize.press('Home');
  await expect(panel).toHaveCSS('height', '180px');
  const list = panel.locator('[data-ui="content.design-review.feedback-list"]');
  expect(await list.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  await list.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await rows.last().hover();
  const preview = page.locator('[data-ui="content.design-review.feedback-preview"]');
  await expect(preview).toContainText('with more detail kept in the preview.');
  await expect(preview).toContainText('Compact target 1');
  await page.screenshot({ path: info.outputPath('compact-panel-short.png'), fullPage: false });
  const before = (await panel.boundingBox())!;
  const handle = (await resize.boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2 + 72, {
    steps: 4,
  });
  await page.mouse.up();
  expect((await panel.boundingBox())!.height).toBeGreaterThan(before.height + 40);
  const clearName = /Clear all feedback|Удалить все отзывы/u;
  await panel.getByRole('button', { name: clearName }).click();
  const confirmation = page.getByRole('alertdialog');
  await expect(confirmation).toBeVisible();
  const modalBox = (await confirmation.boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(Math.abs(modalBox.x + modalBox.width / 2 - viewport.width / 2)).toBeLessThan(2);
  expect(Math.abs(modalBox.y + modalBox.height / 2 - viewport.height / 2)).toBeLessThan(2);
  expect(
    await confirmation.evaluate((element) => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1;
      const context = canvas.getContext('2d')!;
      context.fillStyle = getComputedStyle(element).backgroundColor;
      context.fillRect(0, 0, 1, 1);
      return context.getImageData(0, 0, 1, 1).data[3];
    })
  ).toBe(255);
  await expect(confirmation.locator('.sniptale-modal-header-sm')).toHaveCSS(
    'border-bottom-width',
    '0px'
  );
  await expect(confirmation.locator('.sniptale-modal-footer-sm')).toHaveCSS(
    'border-top-width',
    '0px'
  );
  await page.screenshot({ path: info.outputPath('clear-feedback-dialog.png'), fullPage: false });
  await confirmation.getByRole('button', { name: /Cancel|Отмена/u, exact: true }).click();
  await expect(rows).toHaveCount(3);
}

async function captureSessionFailure(args: {
  page: Page;
  popup: Page;
  hostOrigin: string;
  consoleMessages: string[];
  nativeHistory: unknown[];
  info: TestInfo;
}): Promise<void> {
  const { page, popup, hostOrigin, consoleMessages, nativeHistory, info } = args;
  const native = await popup.evaluate(async (origin) => {
    const tabs = await chrome.tabs.query({});
    const tab = tabs.find((candidate) => candidate.url?.startsWith(origin));
    const frames =
      tab?.id === undefined ? null : await chrome.webNavigation.getAllFrames({ tabId: tab.id });
    return {
      tab,
      frames,
      session: await chrome.storage.local.get('sniptale_design_review_sessions'),
      bindings: await chrome.storage.session.get('sniptale_design_review_bindings'),
    };
  }, hostOrigin);
  await info.attach('native-session-state', {
    body: JSON.stringify(native, null, 2),
    contentType: 'application/json',
  });
  await info.attach('native-console-errors', {
    body: consoleMessages.join('\n'),
    contentType: 'text/plain',
  });
  await info.attach('native-history-pageshow', {
    body: JSON.stringify(nativeHistory, null, 2),
    contentType: 'application/json',
  });
  await info.attach('feedback-ui-state', {
    body: page.isClosed()
      ? 'Review page closed before reopening completed'
      : await page
          .locator('[data-ui="content.design-review.feedback-panel"]')
          .allTextContents()
          .then((text) => text.join('\n')),
    contentType: 'text/plain',
  });
  if (!page.isClosed()) {
    await page.screenshot({
      path: info.outputPath('session-failure.png'),
      fullPage: false,
    });
  }
}

for (const viewport of PRIMARY_BROWSER_VIEWPORTS) {
  test(`Design Review retains a private two-page session through navigation and refresh ${viewport.name}`, async ({
    context,
    extensionId,
    hostOrigin,
  }, info) => {
    const small = viewport.name === '1280x560';
    const consoleMessages: string[] = [];
    const nativeHistory: unknown[] = [];
    await context.addInitScript(() => {
      window.addEventListener('pageshow', (event) => {
        Reflect.set(window, '__reviewSessionPageShow', {
          persisted: event.persisted,
          url: location.href,
        });
      });
    });
    context.on('console', (message) => {
      if (message.type() === 'warning' || message.type() === 'error')
        consoleMessages.push(message.text().slice(0, 2000));
    });
    const preferences = await context.newPage();
    await preferences.goto(`chrome-extension://${extensionId}/apps/extension/src/popup/index.html`);
    await preferences.evaluate(async (compact) => {
      await chrome.storage.local.set({
        'sniptale-locale-preference': compact ? 'ru' : 'en',
        'sniptale-theme-preference': compact ? 'dark' : 'light',
      });
    }, small);
    await preferences.close();
    await context.route(`${hostOrigin}/`, (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: reviewPage('A'),
      })
    );
    await context.route(`${hostOrigin}/review-b`, (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: reviewPage('B'),
      })
    );
    const { page, popup } = await openDesignReview(context, extensionId, hostOrigin, viewport.size);
    let resumedPage: Page | undefined;
    let resumedPopup: Page | undefined;
    try {
      await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: hostOrigin });
      const panel = page.locator('[data-ui="content.design-review.feedback-panel"]');
      const rows = panel.locator('[data-ui="content.design-review.feedback-item"]');
      const navigate = page.locator('[data-ui="content.toolbar.review-tool.navigate"]');
      await addComment(page, '#review-a-target', COMMENT_A);
      if (!(await panel.isVisible())) {
        await page.locator('[data-ui="content.toolbar.design-review-panel-button"]').click();
      }
      await expect(rows).toHaveCount(1);
      await expect(rows.first()).toContainText(COMMENT_A);
      await proveFeedbackCommandAccess(page, panel, rows, viewport.size);

      await expect.poll(() => savedSession(popup, page)).toContain(COMMENT_A);
      await expect.poll(() => savedSession(popup, page)).toContain('data:image/png;base64,');

      const handle = panel.locator('[data-ui="content.design-review.feedback-panel-drag-handle"]');
      const handleBox = (await handle.boundingBox())!;
      await page.mouse.move(handleBox.x + 20, handleBox.y + 16);
      await page.mouse.down();
      await page.mouse.move(handleBox.x + 170, handleBox.y + 76, { steps: 4 });
      await expect(
        panel.getByRole('status').filter({ hasText: /Saving review|Сохранение/u })
      ).toHaveCount(0);
      await page.mouse.up();
      await expect(
        panel.getByRole('status').filter({ hasText: /Saving review|Сохранение/u })
      ).toHaveCount(0);
      const position = await panel.evaluate((element) => ({
        left: (element as HTMLElement).style.left,
        top: (element as HTMLElement).style.top,
      }));
      expect(Number.parseFloat(position.left)).toBeGreaterThan(24);
      await navigate.click();
      await expect(navigate).toHaveAttribute('aria-pressed', 'true');
      await Promise.all([
        page.waitForURL(`${hostOrigin}/review-b`),
        page.locator('#review-next').click(),
      ]);
      await expect(navigate).toHaveAttribute('aria-pressed', 'true');
      await expect(panel).toBeVisible();
      await expect(panel).toHaveCSS('left', position.left);
      await expect(panel).toHaveCSS('top', position.top);
      await expect(rows).toHaveCount(1);
      await expect(rows.first()).toContainText(COMMENT_A);
      await addComment(page, '#review-b-target', COMMENT_B);
      await expect(rows).toHaveCount(2);
      await expect.poll(() => savedSession(popup, page)).toContain(COMMENT_B);
      await expect
        .poll(
          async () =>
            ((await savedSession(popup, page)).match(/data:image\/png;base64,/gu) ?? []).length
        )
        .toBe(2);
      await navigate.click();
      await expect(navigate).toHaveAttribute('aria-pressed', 'true');
      await page.goBack({ waitUntil: 'commit', timeout: 10000 });
      await expect(page).toHaveURL(`${hostOrigin}/`);
      nativeHistory.push(
        await page.evaluate(() => Reflect.get(window, '__reviewSessionPageShow') ?? null)
      );
      await expect(nativeHistory.at(-1)).toMatchObject({ persisted: true });
      await expect(navigate).toHaveAttribute('aria-pressed', 'true');
      await expect(panel).toBeVisible();
      await expect(rows).toHaveCount(2);
      await expect(panel).toContainText(COMMENT_A);
      await expect(panel).toContainText(COMMENT_B);

      await page.goForward({ waitUntil: 'commit', timeout: 10000 });
      await expect(page).toHaveURL(`${hostOrigin}/review-b`);
      nativeHistory.push(
        await page.evaluate(() => Reflect.get(window, '__reviewSessionPageShow') ?? null)
      );
      await expect(nativeHistory.at(-1)).toMatchObject({ persisted: true });
      await expect(navigate).toHaveAttribute('aria-pressed', 'true');
      await expect(panel).toBeVisible();
      await expect(rows).toHaveCount(2);
      await expect(panel).toContainText(COMMENT_A);
      await expect(panel).toContainText(COMMENT_B);

      console.log('Native history pageshow states', JSON.stringify(nativeHistory));
      await page.reload();
      await expect(navigate).toHaveAttribute('aria-pressed', 'true');
      await expect(panel).toBeVisible();
      await expect(panel).toHaveCSS('left', position.left);
      await expect(panel).toHaveCSS('top', position.top);
      await expect(rows).toHaveCount(2);
      await expect(panel).toContainText(COMMENT_A);
      await expect(panel).toContainText(COMMENT_B);

      // A selected tool is insufficient proof: the restored page must accept native link clicks.
      await Promise.all([
        page.waitForURL(`${hostOrigin}/`, { timeout: 10000 }),
        page.locator('#review-next').click({ timeout: 10000 }),
      ]);
      await expect(navigate).toHaveAttribute('aria-pressed', 'true');
      await Promise.all([
        page.waitForURL(`${hostOrigin}/review-b`, { timeout: 10000 }),
        page.locator('#review-next').click({ timeout: 10000 }),
      ]);
      await expect(navigate).toHaveAttribute('aria-pressed', 'true');
      await expect(rows).toHaveCount(2);

      await page.locator('#review-b-target').evaluate((element) => element.remove());
      const missing = rows.filter({ hasText: COMMENT_B });
      await missing.getByRole('button').first().click();
      await page.mouse.move(20, viewport.size.height - 20);
      await missing.hover();
      await expect(
        page.locator('[data-ui="content.design-review.feedback-preview"]')
      ).toContainText(/Target unavailable on this page|Элемент недоступен на этой странице/u);
      await missing.getByRole('button', { name: /Delete feedback|Удалить отзыв/u }).click();
      await expect(rows).toHaveCount(1);
      await expect(panel).not.toContainText(COMMENT_B);
      await panel.getByRole('button', { name: /Undo deletion|Отменить удаление/u }).click();
      await expect(rows).toHaveCount(2);
      await expect(missing).toContainText(COMMENT_B);

      const assertSession = async () => {
        await expect(panel).toBeVisible();
        await expect(rows).toHaveCount(2);
        await expect(panel).toContainText(COMMENT_A);
        await expect(panel).toContainText(COMMENT_B);
        await expect(navigate).toHaveAttribute('aria-pressed', 'true');
      };
      await page.evaluate(() => history.pushState({ review: true }, '', '?review-step=2'));
      await expect(page).toHaveURL(`${hostOrigin}/review-b?review-step=2`);
      await assertSession();
      await page.goBack();
      await expect(page).toHaveURL(`${hostOrigin}/review-b`);
      await assertSession();
      await page.goForward();
      await expect(page).toHaveURL(`${hostOrigin}/review-b?review-step=2`);
      await assertSession();
      await page.goBack();
      await page.evaluate(() => {
        location.hash = 'review-roundtrip';
      });
      await expect(page).toHaveURL(`${hostOrigin}/review-b#review-roundtrip`);
      await assertSession();
      await page.goBack();
      await expect(page).toHaveURL(`${hostOrigin}/review-b`);
      await page.locator('[data-ui="content.toolbar.review-tool.comment"]').click();
      await navigate.click();
      await assertSession();

      await proveAggregateReportExport({ page, popup, hostOrigin, viewport: viewport.size, info });
      if (small) {
        const originalTabId = await popup.evaluate(async (origin) => {
          const tabs = await chrome.tabs.query({});
          const tab = tabs.find((candidate) => candidate.url?.startsWith(origin));
          if (tab?.id === undefined) throw new Error('Original review tab was not found');
          return tab.id;
        }, hostOrigin);
        await page.close();
        await expect
          .poll(() =>
            popup.evaluate(async () =>
              JSON.stringify(
                (await chrome.storage.session.get('sniptale_design_review_bindings'))[
                  'sniptale_design_review_bindings'
                ] ?? null
              )
            )
          )
          .not.toContain(`"tabId":${originalTabId}`);
        const reopened = await openDesignReview(context, extensionId, hostOrigin, viewport.size);
        resumedPage = reopened.page;
        resumedPopup = reopened.popup;
        await proveResumedReview(resumedPage, info);
      }
      await proveClearRestartsMarkers(resumedPage ?? page, hostOrigin, info);
      await proveCompactPanel(resumedPage ?? page, resumedPopup ?? popup, info);
    } catch (error) {
      await captureSessionFailure({
        page: resumedPage ?? page,
        popup,
        hostOrigin,
        consoleMessages,
        nativeHistory,
        info,
      });
      throw error;
    } finally {
      await resumedPopup?.close();
      await resumedPage?.close();
      await popup.close();
      await page.close();
    }
  });
}
