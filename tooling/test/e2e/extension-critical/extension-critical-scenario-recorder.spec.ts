import { expect, test, terminateExtensionServiceWorker } from '../support/extension-fixture';
import { openDesignReview } from './extension-critical-page-toolbar.helpers';

test('scenario and capture panels collapse and restore independently', async ({
  context,
  extensionId,
  hostOrigin,
}) => {
  const { page, popup } = await openDesignReview(context, extensionId, hostOrigin);
  await page.locator('[data-ui="content.toolbar.mode-selector-button"]').click();
  await page.locator('[data-ui="content.toolbar.mode-option.cursor"]').click();
  await page.locator('[data-ui="content.toolbar.capture-action-button"]').click();
  await page.locator('[data-ui="content.toolbar.capture-action-option.scenario"]').click();
  const sidebar = page.locator('[data-ui="content.scenario.sidebar"]');
  const toolbar = page.locator('[data-ui="content.toolbar.navigation.collapse"]');
  await expect(sidebar).toBeVisible();
  await expect(toolbar).toBeVisible();
  await page.locator('[data-ui="content.toolbar.navigation.collapse"]').click();
  await expect(toolbar).toBeHidden();
  await expect(sidebar).toBeVisible();
  await page.locator('[data-ui="content.scenario.sidebar.collapse"]').click();
  await expect(sidebar).toBeHidden();
  await expect(toolbar).toBeHidden();
  await page.locator('[data-ui="content.scenario.sidebar.restore"]').click();
  await expect(sidebar).toBeVisible();
  await expect(toolbar).toBeHidden();
  await page.locator('[data-ui="content.scenario.sidebar.collapse"]').click();
  await page.locator('#sniptale-show-toolbar-btn').click();
  await expect(toolbar).toBeVisible();
  await expect(sidebar).toBeHidden();
  await page.locator('[data-ui="content.scenario.sidebar.restore"]').click();
  await expect(sidebar).toBeVisible();
  await expect(toolbar).toBeVisible();
  await page.close();
  await popup.close();
});

test('pinned scenario survives navigation with its project and collapsed capture panel', async ({
  context,
  extensionId,
  hostOrigin,
}) => {
  const { page, popup } = await openDesignReview(context, extensionId, hostOrigin);
  await popup.evaluate(() => {
    const grant = document.createElement('button');
    grant.textContent = 'Grant all sites for pin';
    grant.onclick = async () => {
      grant.dataset['granted'] = String(
        await chrome.permissions.request({ origins: ['<all_urls>'] })
      );
    };
    document.body.append(grant);
  });
  await popup.getByRole('button', { name: 'Grant all sites for pin' }).click();
  await expect(popup.getByRole('button', { name: 'Grant all sites for pin' })).toHaveAttribute(
    'data-granted',
    'true'
  );
  await page.bringToFront();
  await page.locator('[data-ui="content.toolbar.mode-selector-button"]').click();
  await page.locator('[data-ui="content.toolbar.mode-option.cursor"]').click();
  const pin = page.locator('[data-ui="content.toolbar.navigation.pin-to-tab"]');
  await page.locator('[data-ui="content.toolbar.capture-action-button"]').click();
  await page.locator('[data-ui="content.toolbar.capture-action-option.scenario"]').click();
  const sidebar = page.locator('[data-ui="content.scenario.sidebar"]');
  await expect(sidebar).toBeVisible();
  await expect(pin).toHaveAttribute('aria-pressed', 'false');
  await expect(pin).toBeEnabled();
  await pin.click();
  await expect(pin).toHaveAttribute('aria-pressed', 'true');
  await page.locator('[data-ui="content.scenario.sidebar.project-button"]').click();
  const picker = page.locator('[data-ui="content.scenario.sidebar.project-picker"]');
  await picker.getByRole('textbox').fill('Pinned recorder proof');
  await picker.getByRole('button', { name: /Create project|Создать проект/u }).click();
  await expect(sidebar).toContainText('Pinned recorder proof');
  await page.locator('[data-ui="content.toolbar.navigation.collapse"]').click();
  await expect(page.locator('#sniptale-show-toolbar-btn')).toBeVisible();
  await page.reload();
  await expect(sidebar).toBeVisible();
  await expect(sidebar).toContainText('Pinned recorder proof');
  await expect(page.locator('#sniptale-show-toolbar-btn')).toBeVisible();
  await expect(page.locator('[data-ui="content.toolbar.navigation.collapse"]')).toBeHidden();
  const crossSite = new URL(hostOrigin);
  crossSite.hostname = 'localhost';
  for (const url of [`${hostOrigin}/?next=1`, crossSite.href]) {
    await page.goto(url);
    await expect(sidebar).toHaveCount(1);
    await expect(sidebar).toContainText('Pinned recorder proof');
    await expect(page.locator('#sniptale-show-toolbar-btn')).toBeVisible();
    await expect(page.locator('[data-ui="content.toolbar.navigation.collapse"]')).toBeHidden();
  }
  await page.locator('[data-ui="content.scenario.sidebar.collapse"]').click();
  await expect(page.locator('[data-ui="content.scenario.sidebar.restore"]')).toBeVisible();
  await terminateExtensionServiceWorker(context);
  await page.reload();
  await expect(page.locator('[data-ui="content.scenario.sidebar.restore"]')).toHaveCount(1);
  await expect(page.locator('#sniptale-show-toolbar-btn')).toHaveCount(1);
  await expect(sidebar).toBeHidden();
  await page.locator('[data-ui="content.scenario.sidebar.restore"]').click();
  await expect(sidebar).toContainText('Pinned recorder proof');
  await expect(page.locator('#sniptale-show-toolbar-btn')).toBeVisible();
  await page.goto('chrome://version');
  await expect(sidebar).toHaveCount(0);
  await page.goto(crossSite.href);
  await expect(sidebar).toHaveCount(1);
  await expect(sidebar).toContainText('Pinned recorder proof');
  await expect(page.locator('#sniptale-show-toolbar-btn')).toBeVisible();
  await page.close();
  await popup.close();
});

for (const [locale, theme] of [
  ['ru', 'light'],
  ['en', 'dark'],
] as const) {
  test(`finish and edit retains the last captured step and stops recording ${locale}/${theme}`, async ({
    context,
    extensionId,
    hostOrigin,
  }) => {
    const { page, popup } = await openDesignReview(context, extensionId, hostOrigin);
    await popup.evaluate(
      async ({ locale, theme }) => {
        await chrome.storage.local.set({
          'sniptale-locale-preference': locale,
          'sniptale-theme-preference': theme,
        });
      },
      { locale, theme }
    );
    await page.bringToFront();
    await page.locator('[data-ui="content.toolbar.mode-selector-button"]').click();
    await page.locator('[data-ui="content.toolbar.mode-option.cursor"]').click();
    await page.locator('[data-ui="content.toolbar.capture-action-button"]').click();
    await page.locator('[data-ui="content.toolbar.capture-action-option.scenario"]').click();
    const sidebar = page.locator('[data-ui="content.scenario.sidebar"]');
    await page.locator('[data-ui="content.scenario.sidebar.project-button"]').click();
    const picker = page.locator('[data-ui="content.scenario.sidebar.project-picker"]');
    await picker.getByRole('textbox').fill(`Final capture proof ${locale}`);
    await picker.getByRole('button', { name: /Create project|Создать проект/u }).click();
    await expect(sidebar).toContainText(`Final capture proof ${locale}`);
    const finish = page.locator('[data-ui="content.scenario.sidebar.finish"]');
    await expect(finish).toHaveText(
      locale === 'ru' ? 'Завершить и редактировать' : 'Finish and edit'
    );
    await expect(page.locator('[data-ui="content.scenario.sidebar.open-editor"]')).toHaveCount(0);
    expect(await finish.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    await page.locator('[data-ui="content.scenario.sidebar.capture-visible"]').click();
    await expect(sidebar.locator('[data-ui="content.scenario.sidebar.step"]')).toHaveCount(1);
    await expect(finish).toBeEnabled();
    await sidebar.screenshot({ path: `.tmp/backlog6-w10-${locale}-${theme}.png` });
    const editorPromise = context.waitForEvent('page');
    await finish.click();
    const editor = await editorPromise;
    await expect(editor).toHaveURL(/scenario-editor\/index.html\?projectId=/u);
    await expect(editor.locator('#guide-inspector-panel')).toBeVisible();
    const stepTitle = editor.getByRole('textbox', {
      name: locale === 'ru' ? 'Заголовок шага' : 'Step title',
      exact: true,
    });
    await expect(stepTitle).toHaveValue(await page.title());
    await expect(
      editor.getByRole('textbox', { name: locale === 'ru' ? 'Сценарий' : 'Scenario', exact: true })
    ).toHaveValue(`Final capture proof ${locale}`);
    await expect(editor.locator('article figure')).toHaveCount(1);
    await editor.reload();
    await expect(stepTitle).toHaveValue(await page.title());
    await expect(sidebar).toBeHidden();
    expect(
      context.pages().filter((candidate) => candidate.url().includes('/scenario-editor/'))
    ).toHaveLength(1);
    await page.reload();
    await expect(sidebar).toHaveCount(0);
    await editor.close();
    await page.close();
    await popup.close();
  });
}
