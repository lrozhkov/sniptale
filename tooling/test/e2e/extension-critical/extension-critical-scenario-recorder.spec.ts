import { expect, test, terminateExtensionServiceWorker } from '../support/extension-fixture';
import {
  openDesignReview,
  restoreScenarioRecorderFixture,
} from './extension-critical-page-toolbar.helpers';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { triggerExtensionAction } from '../support/recording-action';

for (const theme of ['light', 'dark'] as const) {
  for (const viewport of PRIMARY_BROWSER_VIEWPORTS) {
    test(`collapsed panel dock ${theme} ${viewport.name}`, async ({
      context,
      extensionId,
      hostOrigin,
    }, info) => {
      test.setTimeout(90000);
      const { page, popup } = await openDesignReview(
        context,
        extensionId,
        hostOrigin,
        viewport.size
      );
      try {
        await popup.evaluate(
          async (theme) =>
            chrome.storage.local.set({
              'sniptale-theme-preference': theme,
              'sniptale-locale-preference': theme === 'dark' ? 'ru' : 'en',
            }),
          theme
        );
        await page.locator('[data-ui="content.toolbar.mode-selector-button"]').click();
        await page.locator('[data-ui="content.toolbar.mode-option.cursor"]').click();
        await restoreScenarioRecorderFixture(page, popup);
        const sidebar = page.locator('[data-ui="content.scenario.sidebar"]');
        const collapseSidebar = page.locator('[data-ui="content.scenario.sidebar.collapse"]');
        const collapseToolbar = page.locator('[data-ui="content.toolbar.navigation.collapse"]');
        const restoreScenario = page.locator('[data-ui="content.scenario.sidebar.restore"]');
        const restoreToolbar = page.locator('#sniptale-show-toolbar-btn');
        const dock = page.locator('[data-ui="content.collapsed-panels"]');
        const restoreButtons = dock.locator('button:not(.sniptale-drag-handle)');
        const grip = page.locator('[data-ui="content.collapsed-panels.drag-handle"]');
        const moveSingleDock = async (left: boolean, top: boolean) => {
          await expect(restoreButtons).toHaveCount(1);
          await dock.hover();
          const bounds = (await grip.boundingBox())!;
          await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
          await page.mouse.down();
          await page.mouse.move(
            left ? 20 : viewport.size.width - 20,
            top ? 20 : viewport.size.height - 20,
            { steps: 5 }
          );
          await page.mouse.up();
          await expect(dock).toHaveAttribute(
            'data-corner',
            `${top ? 'top' : 'bottom'}-${left ? 'left' : 'right'}`
          );
        };
        await expect(sidebar).toBeVisible();
        const switchMode = async (mode: 'cursor' | 'video-recording') => {
          await page.locator('[data-ui="content.toolbar.mode-selector-button"]').click();
          await page.locator(`[data-ui="content.toolbar.mode-option.${mode}"]`).click();
        };
        await switchMode('video-recording');
        await expect(sidebar).toHaveCount(0);
        await expect(restoreScenario).toHaveCount(0);
        await page.screenshot({
          path: info.outputPath('scenario-suspended-video.png'),
          fullPage: false,
        });
        await switchMode('cursor');
        await expect(sidebar).toBeVisible();
        await collapseSidebar.click();
        await expect(restoreButtons).toHaveCount(1);
        await switchMode('video-recording');
        await expect(sidebar).toHaveCount(0);
        await expect(restoreScenario).toHaveCount(0);
        await switchMode('cursor');
        await expect(sidebar).toHaveCount(0);
        await expect(restoreButtons).toHaveCount(1);
        await page.screenshot({ path: info.outputPath('scenario-only.png'), fullPage: false });
        await collapseToolbar.focus();
        await page.keyboard.press('Enter');
        await expect(restoreToolbar).toBeFocused();
        await expect(restoreButtons).toHaveCount(2);
        const geometry = await restoreButtons.evaluateAll((buttons) =>
          buttons.map((button) => {
            const bounds = button.getBoundingClientRect();
            const icon = button.querySelector('svg')!.getBoundingClientRect();
            return { width: bounds.width, height: bounds.height, icon: icon.width };
          })
        );
        expect(Math.abs(geometry[0]!.width - 28)).toBeLessThanOrEqual(1);
        expect(Math.abs(geometry[0]!.height - 28)).toBeLessThanOrEqual(1);
        expect(Math.abs(geometry[0]!.width - geometry[1]!.width)).toBeLessThanOrEqual(1);
        expect(Math.abs(geometry[0]!.height - geometry[1]!.height)).toBeLessThanOrEqual(1);
        expect(Math.abs(geometry[0]!.icon - 16)).toBeLessThanOrEqual(1);
        expect(Math.abs(geometry[0]!.icon - geometry[1]!.icon)).toBeLessThanOrEqual(1);
        for (const corner of ['top-left', 'top-right', 'bottom-left', 'bottom-right']) {
          await dock.hover();
          const handle = (await grip.boundingBox())!;
          await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
          await page.mouse.down();
          const x = corner.endsWith('left') ? 20 : viewport.size.width - 20;
          const y = corner.startsWith('top') ? 20 : viewport.size.height - 20;
          await page.mouse.move(x, y, { steps: 8 });
          await expect(dock).toHaveAttribute('data-dragging', 'true');
          await expect(
            page.locator('[data-ui="content.toolbar.dock-guides"] [data-active]')
          ).toHaveCount(4);
          if (corner === 'top-left') {
            await page.screenshot({ path: info.outputPath('drag-corner.png'), fullPage: false });
            await dock.evaluate((node) => {
              const root = node.getRootNode();
              if (!(root instanceof ShadowRoot)) throw new Error('Expected content shadow root');
              root.host.classList.add('sniptale-capture-ui-hidden');
            });
            await expect(dock).toBeHidden();
            await expect(page.locator('[data-ui="content.toolbar.dock-guides"]')).toBeHidden();
            await page.screenshot({ path: info.outputPath('capture-hidden.png'), fullPage: false });
            await dock.evaluate((node) => {
              const root = node.getRootNode();
              if (root instanceof ShadowRoot)
                root.host.classList.remove('sniptale-capture-ui-hidden');
            });
          }
          await page.mouse.up();
          await expect(dock).toHaveAttribute('data-corner', corner);
          await expect(dock).toHaveAttribute('data-dragging', 'false');
          const bounds = (await dock.boundingBox())!;
          expect(
            Math.abs(
              (corner.endsWith('left') ? bounds.x : viewport.size.width - bounds.x - bounds.width) -
                20
            )
          ).toBeLessThanOrEqual(2);
          expect(
            Math.abs(
              (corner.startsWith('top')
                ? bounds.y
                : viewport.size.height - bounds.y - bounds.height) - 20
            )
          ).toBeLessThanOrEqual(2);
        }
        await dock.hover();
        const cancelGrip = (await grip.boundingBox())!;
        await page.mouse.move(
          cancelGrip.x + cancelGrip.width / 2,
          cancelGrip.y + cancelGrip.height / 2
        );
        await page.mouse.down();
        await page.mouse.move(400, 200, { steps: 4 });
        await expect(dock).toHaveAttribute('data-dragging', 'true');
        await page.keyboard.press('Escape');
        await expect(dock).toHaveAttribute('data-dragging', 'false');
        await expect(dock).toHaveAttribute('data-corner', 'bottom-right');
        await page.mouse.up();
        await restoreScenario.focus();
        await page.keyboard.press('Enter');
        await expect(
          page.locator('[data-ui="content.scenario.sidebar.project-button"]')
        ).toBeFocused();
        await expect(restoreToolbar).toBeVisible();
        await expect(dock).toHaveAttribute('data-corner', 'bottom-right');
        await moveSingleDock(true, true);
        await collapseSidebar.focus();
        await page.keyboard.press('Enter');
        await expect(restoreScenario).toBeFocused();
        await grip.focus();
        await page.keyboard.press('ArrowUp');
        await page.keyboard.press('ArrowLeft');
        await expect(dock).toHaveAttribute('data-corner', 'top-left');
        await page.keyboard.down('Enter');
        await page.keyboard.down('Enter');
        await expect(dock).toHaveAttribute('data-corner', 'top-right');
        await page.keyboard.up('Enter');
        await page.keyboard.down('Space');
        await expect(dock).toHaveAttribute('data-corner', 'top-right');
        await page.keyboard.press('Escape');
        await page.keyboard.up('Space');
        await expect(dock).toHaveAttribute('data-corner', 'top-right');
        await page.keyboard.press('Space');
        await expect(dock).toHaveAttribute('data-corner', 'bottom-right');
        await page.keyboard.press('ArrowUp');
        await page.keyboard.press('ArrowLeft');
        await restoreToolbar.focus();
        await page.keyboard.press('Enter');
        await expect(
          page.locator('[data-ui="content.toolbar.mode-selector-button"]')
        ).toBeFocused();
        await expect(restoreScenario).toBeVisible();
        await moveSingleDock(false, false);
        await moveSingleDock(true, true);
        await restoreScenario.click();
        await expect(sidebar).toBeVisible();
        await expect(
          page.locator('[data-ui="content.scenario.sidebar.project-button"]')
        ).not.toBeFocused();
        await expect(dock).toHaveCount(0);
        await collapseToolbar.click();
        await collapseSidebar.click();
        await expect(dock).toHaveAttribute('data-corner', 'top-left');
        await expect(restoreButtons).toHaveCount(2);
        await page.setViewportSize({ width: 960, height: 560 });
        const narrow = (await dock.boundingBox())!;
        expect(narrow.x).toBeGreaterThanOrEqual(0);
        expect(narrow.x + narrow.width).toBeLessThanOrEqual(960);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true
        );
        await page.screenshot({ path: info.outputPath('grouped-narrow.png'), fullPage: false });
        if (theme === 'light' && viewport.size.width === 1280) {
          await restoreScenario.click();
          await page.locator('[data-ui="content.scenario.sidebar.project-button"]').click();
          const picker = page.locator('[data-ui="content.scenario.sidebar.project-picker"]');
          await picker.getByRole('textbox').fill('Collapsed dock capture proof');
          await picker.getByRole('button', { name: 'Create project', exact: true }).click();
          await expect(sidebar).toContainText('Collapsed dock capture proof');
          await triggerExtensionAction(context, extensionId, page);
          await page.bringToFront();
          await dock.evaluate((node) => {
            const root = node.getRootNode();
            if (!(root instanceof ShadowRoot)) throw new Error('Expected content shadow root');
            const probe = document.createElement('output');
            probe.id = 'dock-capture-proof';
            probe.hidden = true;
            document.body.append(probe);
            new MutationObserver(() => {
              if (!root.host.classList.contains('sniptale-capture-ui-hidden')) return;
              const dock = root.querySelector('[data-ui="content.collapsed-panels"]');
              probe.dataset['hidden'] = String(!dock || dock.getBoundingClientRect().width === 0);
            }).observe(root.host, { attributes: true, attributeFilter: ['class'] });
          });
          await page.locator('[data-ui="content.scenario.sidebar.capture-visible"]').click();
          await expect(sidebar.locator('[data-ui="content.scenario.sidebar.step"]')).toHaveCount(1);
          await expect(page.locator('#dock-capture-proof')).toHaveAttribute('data-hidden', 'true');
          await expect(collapseToolbar).toBeVisible();
          await collapseToolbar.click();
          await collapseSidebar.click();
          await expect(restoreButtons).toHaveCount(2);
          await expect(dock).toHaveAttribute('data-corner', 'top-left');
        }
        if (await restoreToolbar.isVisible()) await restoreToolbar.click();
        await page.locator('[data-ui="content.toolbar.mode-selector-button"]').click();
        await page.locator('[data-ui="content.toolbar.mode-option.video-recording"]').click();
        await expect(
          page.locator('[data-ui="content.toolbar.video-recording.start"]')
        ).toBeVisible();
        await page.locator('[data-ui="content.toolbar.settings-button"]').click();
        const hideRecordingToolbar = page.getByRole('button', {
          name: theme === 'dark' ? 'Свернуть' : 'Collapse',
          exact: true,
        });
        await hideRecordingToolbar.focus();
        await page.keyboard.press('Enter');
        await expect(restoreToolbar).toBeFocused();
        await page.keyboard.press('Enter');
        await expect(
          page.locator('[data-ui="content.toolbar.mode-selector-button"]')
        ).toBeFocused();
      } finally {
        await page.close();
        await popup.close();
      }
    });
  }
}

test('scenario and capture panels collapse and restore independently', async ({
  context,
  extensionId,
  hostOrigin,
}) => {
  const { page, popup } = await openDesignReview(context, extensionId, hostOrigin);
  await page.locator('[data-ui="content.toolbar.mode-selector-button"]').click();
  await page.locator('[data-ui="content.toolbar.mode-option.cursor"]').click();
  await restoreScenarioRecorderFixture(page, popup);
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
  await expect(page.locator('[data-ui="content.collapsed-panels"]')).toBeVisible();
  await expect(
    page.locator('[data-ui="content.collapsed-panels"] button:not(.sniptale-drag-handle)')
  ).toHaveCount(2);
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
  await restoreScenarioRecorderFixture(page, popup);
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
    await restoreScenarioRecorderFixture(page, popup);
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
