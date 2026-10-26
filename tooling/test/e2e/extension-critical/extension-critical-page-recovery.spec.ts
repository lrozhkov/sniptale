import type { Page } from '@playwright/test';
import { expect, test, terminateExtensionServiceWorker } from '../support/extension-fixture';
import { launchExtensionBrowser, closeExtensionBrowser } from '../support/extension-browser-launch';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { openDesignReview } from './extension-critical-page-toolbar.helpers';

const restore = '[data-ui="content.toolbar.history-restore-button"]';
async function activate(page: Page, popup: Page, mode = 'cursor', knownTabId?: number) {
  const target =
    knownTabId ??
    (await popup.evaluate(
      async (url) => (await chrome.tabs.query({})).find((tab) => tab.url === url)?.id,
      page.url()
    ));
  if (target === undefined) throw new Error('Recovery target tab is missing');
  const registered = await popup.evaluate(
    async (tabId) =>
      chrome.runtime.sendMessage({
        type: 'PAGE_ACCESS',
        operation: 'register-granted-site',
        tabId,
        __sniptaleRuntimeFreshness: { issuedAtEpochMs: Date.now(), nonce: crypto.randomUUID() },
      }),
    target
  );
  expect(registered).toMatchObject({ success: true });
  const result = await popup.evaluate(
    async ({ tabId, workingMode }) =>
      chrome.tabs.sendMessage(tabId, {
        type: 'ENABLE_SCREENSHOT_MODE',
        workingMode,
      }),
    { tabId: target, workingMode: mode }
  );
  expect(result).toMatchObject({ success: true });
  await page.bringToFront();
  await expect(page.locator('[data-ui="content.toolbar.mode-selector-button"]')).toBeVisible();
}
async function editTitle(page: Page, value: string, commit: boolean) {
  const title = page.getByTestId('host-page-title');
  const bounds = await title.boundingBox();
  if (!bounds) throw new Error('Page title is not visible');
  await page.mouse.click(bounds.x + 12, bounds.y + 12);
  const popover = page.locator('[data-ui="content.design-review.popover"]');
  await expect(popover).toBeVisible();
  await popover
    .getByRole('button', { name: /^(Edit element text|Изменить текст элемента)$/u })
    .click();
  await expect(title).toHaveAttribute('contenteditable', 'true');
  await title.fill(value);
  if (commit) await title.press('Enter');
}
async function sourceContains(popup: Page, value: string) {
  return popup.evaluate(async (expected) => {
    const values = await chrome.storage.local.get('sniptale_page_recovery');
    return JSON.stringify(values).includes(expected);
  }, value);
}
for (const { name, size } of PRIMARY_BROWSER_VIEWPORTS) {
  test(`recovers the last pending page text after reload and explicitly clears it ${name}`, async ({
    context,
    extensionId,
    hostOrigin,
  }, info) => {
    test.setTimeout(120000);
    const { page, popup } = await openDesignReview(context, extensionId, hostOrigin, size);
    try {
      await editTitle(page, 'Recovered pending page title', false);
      await page.reload();
      await activate(page, popup);
      await expect(page.getByTestId('host-page-title')).toHaveText('Sniptale E2E Host');
      await expect(page.locator(restore)).toBeVisible();
      await page.screenshot({ path: info.outputPath('restore-available.png'), fullPage: false });
      await page.locator(restore).click();
      await expect(page.getByTestId('host-page-title')).toHaveText('Recovered pending page title');
      await expect(page.locator(restore)).toHaveCount(0);
      await page.screenshot({ path: info.outputPath('restored-text.png'), fullPage: false });
      await page.locator('[data-ui="content.toolbar.reset-all-button"]').click();
      const confirm = page.getByRole('alertdialog');
      await expect(confirm).toBeVisible();
      await confirm.getByRole('button', { name: /^(Reset all|Сбросить всё)$/u }).click();
      await expect(page.getByTestId('host-page-title')).toHaveText('Sniptale E2E Host');
      await expect.poll(() => sourceContains(popup, 'Recovered pending page title')).toBe(false);
      await page.reload();
      await activate(page, popup);
      await expect(page.locator(restore)).toHaveCount(0);
      const hostStorage = await page.evaluate(() =>
        JSON.stringify([Object.values(sessionStorage), Object.values(localStorage)])
      );
      expect(hostStorage).not.toContain('Recovered pending page title');
      await page.setViewportSize({ width: 1000, height: size.height });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true
      );
    } finally {
      await popup.close();
      await page.close();
    }
  });
}
test('does not offer another tab the source set and explicit panel Close deletes it', async ({
  context,
  extensionId,
  hostOrigin,
}, info) => {
  test.setTimeout(120000);
  const { page, popup } = await openDesignReview(context, extensionId, hostOrigin, {
    width: 1280,
    height: 560,
  });
  let duplicate: Page | null = null;
  try {
    await editTitle(page, 'Source tab edits', true);
    await expect.poll(() => sourceContains(popup, 'Source tab edits')).toBe(true);
    const duplicatePage = context.waitForEvent('page');
    const duplicateId = await popup.evaluate(async (url) => {
      const tab = (await chrome.tabs.query({})).find((tab) => tab.url === url);
      if (tab?.id === undefined) throw new Error('Original tab missing');
      return (await chrome.tabs.duplicate(tab.id)).id;
    }, page.url());
    duplicate = await duplicatePage;
    await duplicate.waitForLoadState();
    await activate(duplicate, popup, 'cursor', duplicateId);
    await expect(duplicate.locator(restore)).toHaveCount(0);
    await page.reload();
    await activate(page, popup);
    await expect(page.locator(restore)).toBeVisible();
    await page.screenshot({ path: info.outputPath('original-only-restore.png'), fullPage: false });
    await page.locator('[data-ui="content.toolbar.navigation.collapse"]').click();
    await expect.poll(() => sourceContains(popup, 'Source tab edits')).toBe(false);
    await page.reload();
    await activate(page, popup);
    await expect(page.locator(restore)).toHaveCount(0);
  } finally {
    await duplicate?.close();
    await popup.close();
    await page.close();
  }
});

async function mode(page: Page, value: string) {
  await page.locator('[data-ui="content.toolbar.mode-selector-button"]').click();
  await page.locator(`[data-ui="content.toolbar.mode-option.${value}"]`).click();
}

test('recovers pending drawing text through canonical Undo and Redo after reload', async ({
  context,
  extensionId,
  hostOrigin,
}, info) => {
  const { page, popup } = await openDesignReview(context, extensionId, hostOrigin, {
    width: 1280,
    height: 560,
  });
  try {
    await mode(page, 'drawing');
    await page.locator('[data-ui="content.toolbar.drawing.text"]').click();
    await page.mouse.click(400, 230);
    await page.locator('[data-ui="content.drawing.text-input"]').fill('Recovered drawing text');
    await page.reload();
    await activate(page, popup);
    await expect(page.locator(restore)).toBeVisible();
    await page.locator(restore).click();
    await mode(page, 'drawing');
    const text = page.locator('[data-ui="content.drawing.text-object"]');
    await expect(text).toContainText('Recovered drawing text');
    await page.locator('[data-ui="content.toolbar.history-undo-button"]').click();
    await expect(text).toHaveCount(0);
    await page.locator('[data-ui="content.toolbar.history-redo-button"]').click();
    await expect(text).toContainText('Recovered drawing text');
    await page.screenshot({ path: info.outputPath('restored-drawing.png'), fullPage: false });
  } finally {
    await popup.close();
    await page.close();
  }
});

test('keeps ownership after worker restart and refuses old data after browser restart', async ({
  hostOrigin,
}, info) => {
  test.setTimeout(120000);
  const original = await launchExtensionBrowser({ viewport: { width: 1280, height: 560 } });
  let restarted: Awaited<ReturnType<typeof launchExtensionBrowser>> | undefined;
  try {
    const { page, popup } = await openDesignReview(
      original.context,
      original.extensionId,
      hostOrigin,
      { width: 1280, height: 560 }
    );
    await editTitle(page, 'Private session recovery', true);
    await expect.poll(() => sourceContains(popup, 'Private session recovery')).toBe(true);
    await terminateExtensionServiceWorker(original.context);
    await page.reload();
    await activate(page, popup);
    await expect(page.locator(restore)).toBeVisible();
    await original.context.close();
    restarted = await launchExtensionBrowser({
      userDataDir: original.userDataDir,
      viewport: { width: 1280, height: 560 },
    });
    const next = await openDesignReview(restarted.context, restarted.extensionId, hostOrigin, {
      width: 1280,
      height: 560,
    });
    await activate(next.page, next.popup);
    await expect(next.page.locator(restore)).toHaveCount(0);
    expect(await sourceContains(next.popup, 'Private session recovery')).toBe(true);
    await next.page.screenshot({
      path: info.outputPath('unproven-ownership-refused.png'),
      fullPage: false,
    });
  } finally {
    if (restarted) await closeExtensionBrowser(restarted);
    await closeExtensionBrowser(original, { removeUserDataDir: true });
  }
});

test('restores a page frame and Design Review note in the dark vertical toolbar', async ({
  context,
  extensionId,
  hostOrigin,
}, info) => {
  const { page, popup } = await openDesignReview(context, extensionId, hostOrigin, {
    width: 1280,
    height: 560,
  });
  try {
    await popup.evaluate(async () =>
      chrome.storage.local.set({ 'sniptale-theme-preference': 'dark' })
    );
    const title = (await page.getByTestId('host-page-title').boundingBox())!;
    await page.mouse.click(title.x + 12, title.y + 12);
    const comment = page
      .locator('[data-ui="content.design-review.popover"]')
      .getByRole('textbox', { name: /Element comment|Комментарий к элементу/u });
    await comment.fill('Restore this design note');
    await comment.press('Enter');
    await expect(page.locator('[data-ui="content.annotation-marker-button"]')).toHaveCount(1);
    await mode(page, 'highlighter');
    const target = (await page
      .getByRole('button', { name: 'Host action', exact: true })
      .boundingBox())!;
    await page.mouse.click(target.x + 8, target.y + 8);
    await expect(page.locator('.sniptale-frame-container')).toHaveCount(1);
    await page.reload();
    await activate(page, popup);
    await expect(page.locator(restore)).toBeVisible();
    await page.locator('[data-ui="content.toolbar.settings-button"]').click();
    const vertical = page.getByRole('button', { name: /Vertical view|Вертикальный вид/u });
    if (!(await vertical.isVisible()))
      await page
        .getByRole('button', { name: /Free toolbar placement|Свободное размещение/u })
        .click();
    await vertical.click();
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-ui="content.toolbar.root"]')).toHaveAttribute(
      'data-display-mode',
      'vertical'
    );
    await page.locator(restore).click();
    await mode(page, 'highlighter');
    await expect(page.locator('.sniptale-frame-container')).toHaveCount(1);
    await mode(page, 'design-review');
    await expect(page.locator('[data-ui="content.annotation-marker-button"]')).toHaveCount(1);
    await page.locator('[data-ui="content.annotation-marker-button"]').click();
    await expect(
      page.getByRole('textbox', { name: /Element comment|Комментарий к элементу/u })
    ).toHaveValue('Restore this design note');
    await page.screenshot({
      path: info.outputPath('restored-frame-note-dark-vertical.png'),
      fullPage: false,
    });
  } finally {
    await popup.close();
    await page.close();
  }
});

test('refuses note-only Restore when the page target has disappeared and retains the source', async ({
  context,
  extensionId,
  hostOrigin,
}, info) => {
  const { page, popup } = await openDesignReview(context, extensionId, hostOrigin, {
    width: 1280,
    height: 560,
  });
  try {
    const bounds = (await page.getByTestId('host-page-title').boundingBox())!;
    await page.mouse.click(bounds.x + 12, bounds.y + 12);
    const comment = page
      .locator('[data-ui="content.design-review.popover"]')
      .getByRole('textbox', { name: /Element comment|Комментарий к элементу/u });
    await comment.fill('Preserve missing-target note');
    await comment.press('Enter');
    await expect.poll(() => sourceContains(popup, 'Preserve missing-target note')).toBe(true);
    await page.reload();
    await page.getByTestId('host-page-title').evaluate((node) => node.remove());
    await activate(page, popup);
    await expect(page.locator(restore)).toBeVisible();
    await page.locator(restore).click();
    await expect(
      page.getByText(
        /Could not save or restore page changes|Не удалось сохранить или восстановить/u
      )
    ).toBeVisible();
    await expect(page.locator(restore)).toBeVisible();
    expect(await sourceContains(popup, 'Preserve missing-target note')).toBe(true);
    await mode(page, 'design-review');
    await expect(page.locator('[data-ui="content.annotation-marker-button"]')).toHaveCount(0);
    await page.screenshot({
      path: info.outputPath('missing-note-target-refused.png'),
      fullPage: false,
    });
  } finally {
    await popup.close();
    await page.close();
  }
});
