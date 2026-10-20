import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { expect, type Page } from '@playwright/test';
import { test } from '../support/extension-fixture';
import { PageAccessOperation } from '@sniptale/runtime-contracts/messaging/page-access';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import {
  CaptureMode,
  createQuickAction,
  createRecordingRuntimeState,
  countRuntimeMessagesByType,
  E2E_ACTIVE_PAGE_ACCESS_RESPONSE,
  E2E_RUNTIME_SUCCESS_API_BEHAVIOR,
  emitHarnessRuntimeMessage,
  getRuntimeMessagesByType,
  POPUP_HARNESS_PATH,
  POPUP_VIDEO_CANCEL_LABEL,
  POPUP_VIDEO_PAUSE_LABEL,
  POPUP_VIDEO_RESUME_LABEL,
  POPUP_VIDEO_STOP_LABEL,
  POPUP_VIDEO_TAB_LABEL,
  QUICK_ACTIONS_KEY,
  applyHarnessBootstrap,
  VideoMessageType,
  VideoRecordingStatus,
} from '../extension-critical.helpers';

const POPUP_ENABLE_FOR_TAB_LABEL = translate('popup.home.enableForTab', 'ru');
const POPUP_IMAGE_EDITOR_LABEL = translate('popup.home.imageEditorLabel', 'ru');
const POPUP_VISIBLE_CAPTURE_LABEL = translate('popup.home.captureVisibleLabel', 'ru');

const QUICK_ACTIONS_STARTUP = {
  selection: 'screenshots:quick-actions',
  lastPage: 'screenshots',
  lastExportDestination: 'export',
} as const;

const MENU_STARTUP = {
  selection: 'menu',
  lastPage: 'menu',
  lastExportDestination: 'export',
} as const;

for (const viewport of PRIMARY_BROWSER_VIEWPORTS) {
  for (const theme of ['light', 'dark'] as const) {
    test(`popup result secondary actions and header strokes ${viewport.name} ${theme}`, async ({
      page,
      hostOrigin,
    }, info) => {
      await page.setViewportSize(viewport.size);
      await applyHarnessBootstrap(page, {
        apiBehavior: E2E_RUNTIME_SUCCESS_API_BEHAVIOR,
        runtimeResponses: {
          [MessageType.PAGE_ACCESS]: E2E_ACTIVE_PAGE_ACCESS_RESPONSE,
          [VideoMessageType.GET_RECORDING_STATE]: {
            success: true,
            recordingHealth: 'healthy',
            state: createRecordingRuntimeState(VideoRecordingStatus.IDLE),
            postRecordResult: {
              primaryRecordingId: 'result-1',
              projectId: null,
              recordingId: 'result-1',
            },
          },
        },
        storage: {
          'sniptale-theme-preference': theme,
          sniptale_popup_startup: {
            selection: 'video',
            lastPage: 'video',
            lastExportDestination: 'export',
          },
        },
      });
      await openPopupHarness(page, hostOrigin);
      await page.addStyleTag({ url: `${hostOrigin}/assets/index.css` });
      const header = page.locator('[data-ui="popup.app.tabs"]');
      const referenceStroke = await header
        .locator('button[data-page="screenshots"] svg path')
        .first()
        .evaluate((node) => getComputedStyle(node).strokeWidth);
      expect(referenceStroke).toBe('1.8px');
      for (const route of ['tools', 'export']) {
        expect(
          await header
            .locator(`button[data-page="${route}"] svg :is(g,path)`)
            .evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).strokeWidth))
        ).toEqual(expect.arrayContaining([referenceStroke]));
        expect(
          await header
            .locator(`button[data-page="${route}"] svg :is(g,path)`)
            .evaluateAll((nodes) =>
              nodes.every((node) => getComputedStyle(node).strokeWidth === '1.8px')
            )
        ).toBe(true);
      }
      const primary = page.getByRole('button', {
        name: translate('popup.video.postRecordQuickEdit', 'ru'),
        exact: true,
      });
      await expect(primary).toBeVisible();
      for (const key of [
        'postRecordOpenGallery',
        'postRecordDownload',
        'postRecordClose',
      ] as const) {
        const action = page.getByRole('button', {
          name: translate(`popup.video.${key}`, 'ru'),
          exact: true,
        });
        await expect(action).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      }
      for (const key of ['postRecordQuickEdit', 'postRecordOpenEditor'] as const) {
        const action = page.getByRole('button', {
          name: translate(`popup.video.${key}`, 'ru'),
          exact: true,
        });
        const icon = action.locator('svg');
        const before = await action.boundingBox();
        await expect(icon).toHaveCSS('scale', '1');
        await action.hover();
        await expect(icon).toHaveCSS('scale', '1.1');
        expect(await action.boundingBox()).toEqual(before);
        await page.mouse.move(1, 1);
        await expect(icon).toHaveCSS('scale', '1');
      }
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await primary.hover();
      await expect(primary.locator('svg')).toHaveCSS('scale', '1');
      await page.mouse.move(1, 1);
      await page.screenshot({
        path: info.outputPath('result-secondary-actions.png'),
        fullPage: false,
      });
      await header.locator('button[data-page="export"]').click();
      await expect(header.locator('button[data-page="export"]')).toHaveAttribute(
        'data-active',
        'true'
      );
      await expect(header.locator('button[data-page="export"] svg g').first()).toHaveCSS(
        'stroke-width',
        '1.8px'
      );
    });
  }
}

for (const route of ['screenshots', 'video', 'export'] as const) {
  test(`popup ${route} primary command keeps its target fixed through hover and press`, async ({
    page,
    hostOrigin,
  }) => {
    await page.setViewportSize({ width: 392, height: 560 });
    await applyHarnessBootstrap(page, {
      apiBehavior: E2E_RUNTIME_SUCCESS_API_BEHAVIOR,
      runtimeResponses: { [MessageType.PAGE_ACCESS]: E2E_ACTIVE_PAGE_ACCESS_RESPONSE },
      storage: {
        sniptale_popup_startup: {
          selection:
            route === 'screenshots'
              ? 'screenshots:tab'
              : route === 'export'
                ? 'export:download'
                : 'video',
          lastPage: route,
          lastExportDestination: 'export',
        },
      },
    });
    await openPopupHarness(page, hostOrigin);
    await page.addStyleTag({ url: `${hostOrigin}/assets/index.css` });
    const action =
      route === 'screenshots'
        ? page.getByRole('button', {
            name: translate('popup.home.captureButtonLabel', 'ru'),
            exact: true,
          })
        : page.locator(
            route === 'video'
              ? '[data-ui="popup.video-setup.start-recording-button"]'
              : '[data-ui="popup.export.export-button"]'
          );
    await expect(action).toBeEnabled();
    await expect(action).toHaveCSS('height', '40px');
    const resting = await action.boundingBox();
    const background = await action.evaluate((node) => getComputedStyle(node).backgroundColor);
    await action.hover();
    await expect
      .poll(() => action.evaluate((node) => getComputedStyle(node).backgroundColor))
      .not.toBe(background);
    await expect(action).toHaveCSS('outline-style', 'none');
    const icon = action.locator(':scope > span').first();
    const before = await icon.boundingBox();
    await page.mouse.down();
    await expect.poll(async () => (await icon.boundingBox())!.y - before!.y).toBeCloseTo(1, 1);
    expect(await action.boundingBox()).toEqual(resting);
    await page.mouse.move(1, 1);
    await page.mouse.up();
    await expect.poll(async () => (await icon.boundingBox())!.y - before!.y).toBeCloseTo(0, 1);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await action.hover();
    await page.mouse.down();
    expect(await icon.boundingBox()).toEqual(before);
    await page.mouse.move(1, 1);
    await page.mouse.up();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expect(action).toBeFocused();
    await expect(action).toHaveCSS('outline-style', 'solid');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await action.evaluate((node) => {
      (node as HTMLButtonElement).disabled = true;
    });
    const disabled = await icon.boundingBox();
    await page.mouse.move(resting!.x + resting!.width / 2, resting!.y + resting!.height / 2);
    await page.mouse.down();
    expect(await icon.boundingBox()).toEqual(disabled);
    await page.mouse.up();
  });
}

for (const route of ['screenshots', 'menu', 'tools', 'export'] as const) {
  test(`popup ${route} failure retains its action inside the fixed popup`, async ({
    page,
    hostOrigin,
  }, info) => {
    await page.setViewportSize({ width: 392, height: 560 });
    const messageType =
      route === 'tools'
        ? 'ENABLE_SCREENSHOT_MODE'
        : route === 'export'
          ? 'START_PAGE_PACKAGE_JOB'
          : 'TRIGGER_SCREENSHOT_CAPTURE';
    await applyHarnessBootstrap(page, {
      apiBehavior: E2E_RUNTIME_SUCCESS_API_BEHAVIOR,
      runtimeResponses: {
        [MessageType.PAGE_ACCESS]: E2E_ACTIVE_PAGE_ACCESS_RESPONSE,
        [messageType]: { success: false, error: 'Browser operation failed' },
      },
      storage: {
        sniptale_popup_startup: {
          selection:
            route === 'screenshots'
              ? 'screenshots:tab'
              : route === 'export'
                ? 'export:download'
                : route,
          lastPage: route,
          lastExportDestination: 'export',
        },
      },
    });
    await openPopupHarness(page, hostOrigin);
    await page.addStyleTag({ url: `${hostOrigin}/assets/index.css` });
    const action =
      route === 'tools'
        ? page.locator('[data-ui="popup.home.tools.open"]')
        : route === 'export'
          ? page.locator('[data-ui="popup.export.export-button"]')
          : page.getByRole('button', {
              name: translate(
                route === 'menu'
                  ? 'popup.home.captureVisibleLabel'
                  : 'popup.home.captureButtonLabel',
                'ru'
              ),
              exact: true,
            });
    await expect(action).toBeEnabled();
    await action.click();
    const error = page.locator('.popup-error-message[role="alert"]').first();
    await expect(error).toBeVisible();
    await expect(error).not.toHaveText('');
    await expect(action).toBeVisible();
    await expect(action).toBeInViewport();
    if (route === 'menu' || route === 'tools') {
      const content = page.locator(
        route === 'menu' ? '[data-ui="popup.menu.content"]' : '[data-ui="popup.tools.actions"]'
      );
      expect(
        await content.evaluate((element) => element.scrollHeight - element.clientHeight)
      ).toBeLessThanOrEqual(1);
      const lastAction =
        route === 'menu'
          ? page.locator('[data-ui="popup.menu.workspace"] button').last()
          : page.locator('[data-ui="popup.home.tools.video-recording"]');
      await expect(lastAction).toBeInViewport({ ratio: 1 });
      for (const button of await content.getByRole('button').all()) {
        expect((await button.boundingBox())?.height).toBeGreaterThanOrEqual(44);
        expect(
          await button.evaluate((element) => element.scrollHeight - element.clientHeight)
        ).toBeLessThanOrEqual(1);
      }
    }
    const geometry = await page.evaluate(() => {
      const root = document.querySelector<HTMLElement>('[data-ui="popup.app.root"]')!;
      const rect = root.getBoundingClientRect();
      return {
        width: rect.width,
        height: rect.height,
        scrollWidth: document.documentElement.scrollWidth,
        scrollHeight: document.documentElement.scrollHeight,
      };
    });
    expect(geometry).toEqual({ width: 392, height: 560, scrollWidth: 392, scrollHeight: 560 });
    await page.screenshot({ path: info.outputPath(`${route}-error.png`), fullPage: false });
  });
}

test('popup video long error keeps complete text and recording controls accessible', async ({
  page,
  hostOrigin,
}, info) => {
  await page.setViewportSize({ width: 392, height: 560 });
  const message = `${'Recording control failed. Retry the action. '.repeat(8)}${'unbroken'.repeat(30)}`;
  await applyHarnessBootstrap(page, {
    apiBehavior: E2E_RUNTIME_SUCCESS_API_BEHAVIOR,
    runtimeResponses: {
      [MessageType.PAGE_ACCESS]: E2E_ACTIVE_PAGE_ACCESS_RESPONSE,
      [VideoMessageType.GET_RECORDING_STATE]: {
        success: true,
        recordingHealth: 'healthy',
        state: { ...createRecordingRuntimeState(VideoRecordingStatus.RECORDING), error: message },
      },
    },
    storage: {
      sniptale_popup_startup: {
        selection: 'video',
        lastPage: 'video',
        lastExportDestination: 'export',
      },
    },
  });
  await openPopupHarness(page, hostOrigin);
  await page.addStyleTag({ url: `${hostOrigin}/assets/index.css` });
  const error = page.locator('.popup-error-message[role="alert"]');
  await expect(error).toHaveText(message);
  const details = await error.evaluate((element) => {
    const style = getComputedStyle(element);
    element.scrollTop = element.scrollHeight;
    return {
      height: element.clientHeight,
      width: element.clientWidth,
      scrollWidth: element.scrollWidth,
      scrollTop: element.scrollTop,
      overflow: style.overflowY,
      whiteSpace: style.whiteSpace,
    };
  });
  expect(details.height).toBeLessThanOrEqual(112);
  expect(details.scrollWidth).toBeLessThanOrEqual(details.width);
  expect(details.scrollTop).toBeGreaterThan(0);
  expect(details.overflow).toBe('auto');
  expect(details.whiteSpace).toBe('normal');
  await expect(
    page.getByRole('button', { name: POPUP_VIDEO_PAUSE_LABEL, exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: POPUP_VIDEO_STOP_LABEL, exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: POPUP_VIDEO_PAUSE_LABEL, exact: true })
  ).toBeInViewport();
  await expect(
    page.getByRole('button', { name: POPUP_VIDEO_STOP_LABEL, exact: true })
  ).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(560);
  await page.screenshot({ path: info.outputPath('video-long-error.png'), fullPage: false });
});

test('popup page access failure preserves full error and all recovery targets', async ({
  page,
  hostOrigin,
}, info) => {
  await page.setViewportSize({ width: 392, height: 560 });
  await applyHarnessBootstrap(page, {
    apiBehavior: E2E_RUNTIME_SUCCESS_API_BEHAVIOR,
    runtimeResponses: {
      [MessageType.PAGE_ACCESS]: { success: true, status: createInactivePageAccessStatus() },
    },
    storage: {
      sniptale_popup_startup: {
        selection: 'screenshots:tab',
        lastPage: 'screenshots',
        lastExportDestination: 'export',
      },
    },
  });
  await openPopupHarness(page, hostOrigin);
  await page.addStyleTag({ url: `${hostOrigin}/assets/index.css` });
  await page.evaluate(() => {
    window.__sniptaleHarness?.setRuntimeResponse('PAGE_ACCESS', {
      success: false,
      status: {
        allSitesGranted: false,
        currentTabActive: false,
        currentTabId: 1,
        currentTabOrigin: 'https://example.test',
        siteGranted: false,
        supported: true,
      },
    });
  });
  await page.getByRole('button', { name: POPUP_ENABLE_FOR_TAB_LABEL, exact: true }).click();
  const controls = page.locator('[data-ui="popup.page-access.controls"]');
  await expect(controls.getByRole('alert')).toHaveText(
    translate('popup.home.pageAccessFailed', 'ru')
  );
  await expect(controls.getByRole('button')).toHaveCount(3);
  for (const button of await controls.getByRole('button').all()) {
    await expect(button).toBeEnabled();
    await expect(button).toBeInViewport();
    expect((await button.boundingBox())?.height).toBeGreaterThanOrEqual(88);
  }
  expect(
    await controls.getByRole('alert').evaluate((element) => getComputedStyle(element).textOverflow)
  ).not.toBe('ellipsis');
  await page.screenshot({ path: info.outputPath('page-access-error.png'), fullPage: false });
});

async function openPopupHarness(page: Page, hostOrigin: string) {
  const runtimeErrors: string[] = [];
  page.on('pageerror', (error) => {
    runtimeErrors.push(error.message);
  });
  page.on('console', (message) => {
    if (message.type() === 'error') {
      runtimeErrors.push(message.text());
    }
  });
  await page.goto(`${hostOrigin}${POPUP_HARNESS_PATH}`, { waitUntil: 'domcontentloaded' });
  try {
    await page.locator('[data-ui="popup.app.root"]').waitFor({ state: 'visible', timeout: 5_000 });
  } catch (error) {
    throw new Error(
      `Popup harness did not mount. Runtime errors: ${runtimeErrors.join(' | ') || 'none'}`,
      { cause: error }
    );
  }
}

function createInactivePageAccessStatus() {
  return {
    allSitesGranted: false,
    currentTabActive: false,
    currentTabId: 1,
    currentTabOrigin: 'https://example.test',
    siteGranted: false,
    supported: true,
  };
}

async function emitPopupRecordingState(page: Page, status: VideoRecordingStatus) {
  await emitHarnessRuntimeMessage(page, {
    type: VideoMessageType.RECORDING_STATE_SYNC,
    state: createRecordingRuntimeState(status),
  });
}

async function expectTypedRuntimeMessage(page: Page, type: VideoMessageType) {
  await expect.poll(() => countRuntimeMessagesByType(page, type)).toBe(1);
}

async function configurePageAccessActivation(page: Page) {
  await page.evaluate(() => {
    let active = false;
    window.__sniptaleHarness?.setRuntimeResponse('PAGE_ACCESS', (message) => {
      const operation =
        typeof message === 'object' && message !== null && 'operation' in message
          ? message.operation
          : null;
      if (operation === 'activate-current-tab') {
        active = true;
      }
      return {
        success: true,
        ...(operation === 'activate-current-tab' ? { result: 'activated' } : {}),
        status: {
          allSitesGranted: false,
          currentTabActive: active,
          currentTabId: 1,
          currentTabOrigin: 'https://example.test',
          siteGranted: false,
          supported: true,
        },
      };
    });
  });
}

async function expectPageAccessLocked(page: Page, actionName: string) {
  await expect(page.locator('button', { hasText: actionName })).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: POPUP_ENABLE_FOR_TAB_LABEL, exact: true })
  ).toBeVisible();
}

async function expectPageAccessActivationRequest(page: Page) {
  await expect
    .poll(async () => {
      const messages = await getRuntimeMessagesByType(page, MessageType.PAGE_ACCESS);
      return messages.some((message) => {
        return (
          'operation' in message && message.operation === PageAccessOperation.ACTIVATE_CURRENT_TAB
        );
      });
    })
    .toBe(true);
}

async function startTabRecordingFromPopup(page: Page) {
  await page.getByRole('button', { name: POPUP_VIDEO_TAB_LABEL, exact: true }).click();
  const startButton = page.locator('[data-ui="popup.video-setup.start-recording-button"]');
  await expect(startButton).toBeEnabled();
  await startButton.click();
  await expectTypedRuntimeMessage(page, VideoMessageType.START_RECORDING);
}

async function expectStartRecordingMessage(page: Page) {
  const [startMessage] = await getRuntimeMessagesByType(page, VideoMessageType.START_RECORDING);
  expect(startMessage).toMatchObject({
    type: VideoMessageType.START_RECORDING,
    captureMode: CaptureMode.TAB,
    tabId: 1,
    settings: expect.objectContaining({
      countdownSeconds: expect.any(Number),
      outputProfile: expect.objectContaining({
        codec: expect.any(String),
        container: expect.any(String),
        frameRate: expect.any(Number),
        quality: expect.any(String),
        resolution: expect.any(String),
      }),
    }),
  });
}

async function driveRecordingControls(page: Page) {
  await emitPopupRecordingState(page, VideoRecordingStatus.COUNTDOWN);
  await expect(
    page.getByRole('button', { name: POPUP_VIDEO_CANCEL_LABEL, exact: true })
  ).toBeVisible();

  await emitPopupRecordingState(page, VideoRecordingStatus.RECORDING);
  const pauseButton = page.getByRole('button', { name: POPUP_VIDEO_PAUSE_LABEL, exact: true });
  const stopButton = page.getByRole('button', { name: POPUP_VIDEO_STOP_LABEL, exact: true });
  await expect(pauseButton).toBeVisible();
  await expect(stopButton).toBeVisible();

  await pauseButton.click();
  await expectTypedRuntimeMessage(page, VideoMessageType.PAUSE_RECORDING);

  await emitPopupRecordingState(page, VideoRecordingStatus.PAUSED);
  const resumeButton = page.getByRole('button', { name: POPUP_VIDEO_RESUME_LABEL, exact: true });
  await expect(resumeButton).toBeVisible();
  await resumeButton.click();
  await expectTypedRuntimeMessage(page, VideoMessageType.RESUME_RECORDING);

  await stopButton.click();
  await expectTypedRuntimeMessage(page, VideoMessageType.STOP_RECORDING);
}

test('popup quick action dispatches a typed runtime message', async ({ page, hostOrigin }) => {
  const actionName = 'Critical visible edit';
  await applyHarnessBootstrap(page, {
    apiBehavior: E2E_RUNTIME_SUCCESS_API_BEHAVIOR,
    runtimeResponses: {
      [MessageType.PAGE_ACCESS]: E2E_ACTIVE_PAGE_ACCESS_RESPONSE,
    },
    storage: {
      [QUICK_ACTIONS_KEY]: [createQuickAction(actionName)],
      sniptale_popup_startup: QUICK_ACTIONS_STARTUP,
    },
  });
  await openPopupHarness(page, hostOrigin);

  await page.locator('button', { hasText: actionName }).click();

  await expect.poll(() => countRuntimeMessagesByType(page, 'TRIGGER_QUICK_ACTION')).toBe(1);

  const [message] = await getRuntimeMessagesByType(page, 'TRIGGER_QUICK_ACTION');
  expect(message).toMatchObject({
    type: 'TRIGGER_QUICK_ACTION',
    actionId: 'critical-edit-visible',
    tabId: expect.any(Number),
  });
});

test('popup center menu icon stays centered through hover, press, and focus', async ({
  page,
  hostOrigin,
}) => {
  await applyHarnessBootstrap(page, {
    apiBehavior: E2E_RUNTIME_SUCCESS_API_BEHAVIOR,
    storage: { sniptale_popup_startup: QUICK_ACTIONS_STARTUP },
  });
  await openPopupHarness(page, hostOrigin);
  await page.addStyleTag({ url: `${hostOrigin}/assets/index.css` });
  const button = page.locator('[data-ui="popup.app.tabs"] button[data-page="menu"]');
  const icon = button.locator('svg');
  const centerOffset = async () => {
    const buttonBox = await button.boundingBox();
    const iconBox = await icon.boundingBox();
    if (!buttonBox || !iconBox) throw new Error('Menu button geometry is unavailable');
    return {
      x: iconBox.x + iconBox.width / 2 - (buttonBox.x + buttonBox.width / 2),
      y: iconBox.y + iconBox.height / 2 - (buttonBox.y + buttonBox.height / 2),
    };
  };
  const expectCentered = async () => {
    const offset = await centerOffset();
    expect(Math.abs(offset.x)).toBeLessThan(0.6);
    expect(Math.abs(offset.y)).toBeLessThan(0.6);
  };

  await expectCentered();
  const ring = page.locator('.popup-react-shell__menu-ring');
  await button.click();
  const indicator = page.locator('.popup-react-shell__tab-indicator');
  await expect(indicator).toHaveAttribute('data-page', 'menu');
  await indicator.evaluate(async (element) => {
    await Promise.all(
      element.getAnimations({ subtree: true }).map((animation) => animation.finished)
    );
  });
  const ringBox = await ring.boundingBox();
  const buttonBox = await button.boundingBox();
  if (!ringBox || !buttonBox) throw new Error('Menu ring geometry is unavailable');
  expect(
    Math.abs(ringBox.x + ringBox.width / 2 - (buttonBox.x + buttonBox.width / 2))
  ).toBeLessThan(0.6);
  expect(
    Math.abs(ringBox.y + ringBox.height / 2 - (buttonBox.y + buttonBox.height / 2))
  ).toBeLessThan(0.6);
  expect(await indicator.evaluate((element) => getComputedStyle(element).boxShadow)).toBe('none');
  await button.hover();
  await icon.evaluate(async (element) => {
    await Promise.all(element.getAnimations().map((animation) => animation.finished));
  });
  await expectCentered();
  await page.mouse.down();
  await expectCentered();
  await page.mouse.up();
  await page.mouse.move(0, 0);
  await button.focus();
  await expectCentered();
});

test('popup menu and tools use stable tiles without clipping the footer', async ({
  page,
  hostOrigin,
}) => {
  await applyHarnessBootstrap(page, {
    apiBehavior: E2E_RUNTIME_SUCCESS_API_BEHAVIOR,
    runtimeResponses: { [MessageType.PAGE_ACCESS]: E2E_ACTIVE_PAGE_ACCESS_RESPONSE },
    storage: { sniptale_popup_startup: QUICK_ACTIONS_STARTUP },
  });
  await openPopupHarness(page, hostOrigin);
  await page.addStyleTag({ url: `${hostOrigin}/assets/index.css` });
  await page.locator('[data-ui="popup.app.tabs"] button[data-page="menu"]').click();

  const menu = page.locator('[data-ui="popup.menu.route"]');
  const tools = page.locator('[data-ui="popup.menu.tools"]');
  const workspace = page.locator('[data-ui="popup.menu.workspace"]');
  const footer = menu.locator('footer');
  const menuLayout = await menu.evaluate((element) => {
    const surface = element.querySelector('section');
    if (!surface) throw new Error('Menu surface is unavailable');
    const groups = [...surface.children].map((child) => child.getBoundingClientRect());
    return {
      clientHeight: surface.clientHeight,
      scrollHeight: surface.scrollHeight,
      gaps: groups.slice(1).map((group, index) => group.top - groups[index]!.bottom),
    };
  });
  expect(menuLayout.scrollHeight).toBeLessThanOrEqual(menuLayout.clientHeight + 1);
  expect(Math.max(...menuLayout.gaps) - Math.min(...menuLayout.gaps)).toBeLessThan(2);
  expect(await tools.evaluate((element) => getComputedStyle(element).borderTopWidth)).toBe('1px');
  expect(await workspace.evaluate((element) => getComputedStyle(element).borderTopWidth)).toBe(
    '1px'
  );
  await expect(tools.locator('button')).toHaveCount(4);
  await expect(workspace).toContainText('Приложения');
  await expect(workspace).toBeVisible();
  await expect(footer).toBeVisible();
  const workspaceBox = await workspace.boundingBox();
  const footerBox = await footer.boundingBox();
  const toolsBox = await tools.boundingBox();
  if (!workspaceBox || !footerBox) throw new Error('Menu layout geometry is unavailable');
  expect(workspaceBox.y + workspaceBox.height).toBeLessThan(footerBox.y);
  if (!toolsBox) throw new Error('Menu row geometry is unavailable');
  expect(workspaceBox.y - (toolsBox.y + toolsBox.height)).toBeLessThan(24);

  const imageEditor = workspace.getByRole('button', { name: POPUP_IMAGE_EDITOR_LABEL });
  const quickAction = menu.getByRole('button', {
    name: translate('popup.home.quickEditTabLabel', 'ru'),
  });
  expect(await imageEditor.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe(
    await quickAction.evaluate((element) => getComputedStyle(element).backgroundColor)
  );
  const before = await imageEditor.boundingBox();
  const restingBackground = await imageEditor.evaluate(
    (element) => getComputedStyle(element).backgroundColor
  );
  await imageEditor.hover();
  const after = await imageEditor.boundingBox();
  expect(after).toEqual(before);
  await expect
    .poll(() => imageEditor.evaluate((element) => getComputedStyle(element).backgroundColor))
    .not.toBe(restingBackground);

  await page.locator('[data-ui="popup.app.tabs"] button[data-page="tools"]').click();
  const tool = page.locator('[data-ui="popup.home.tools.drawing"]');
  await expect(tool).toBeVisible();
  await tool.evaluate((element) => element.removeAttribute('disabled'));
  const toolBefore = await tool.boundingBox();
  const toolIcon = tool.locator('svg');
  const restingIconTransform = await toolIcon.evaluate(
    (element) => getComputedStyle(element).scale
  );
  await tool.hover();
  expect(await tool.boundingBox()).toEqual(toolBefore);
  await expect
    .poll(() => toolIcon.evaluate((element) => getComputedStyle(element).scale))
    .not.toBe(restingIconTransform);
});

test('popup menu starts with a complete ring and no entrance animation', async ({
  page,
  hostOrigin,
}) => {
  await applyHarnessBootstrap(page, {
    apiBehavior: E2E_RUNTIME_SUCCESS_API_BEHAVIOR,
    runtimeResponses: { [MessageType.PAGE_ACCESS]: E2E_ACTIVE_PAGE_ACCESS_RESPONSE },
    storage: { sniptale_popup_startup: MENU_STARTUP },
  });
  await openPopupHarness(page, hostOrigin);
  await page.addStyleTag({ url: `${hostOrigin}/assets/index.css` });
  const nav = page.locator('[data-ui="popup.app.tabs"]');
  const indicator = nav.locator('.popup-react-shell__tab-indicator');
  await expect(indicator).toHaveAttribute('data-page', 'menu');
  await expect(nav).toHaveAttribute('data-animate', 'false');
  expect(await indicator.evaluate((element) => getComputedStyle(element).transitionDuration)).toBe(
    '0s'
  );
  expect(
    await indicator
      .locator('circle')
      .evaluate((element) => getComputedStyle(element).strokeDasharray)
  ).toBe('102px, 100px');
  expect(
    await indicator.locator('circle').evaluate((element) => element.getAnimations().length)
  ).toBe(0);
});

test('popup mode keeps one icon while expanding a hovered option', async ({ page, hostOrigin }) => {
  await applyHarnessBootstrap(page, {
    apiBehavior: E2E_RUNTIME_SUCCESS_API_BEHAVIOR,
    runtimeResponses: { [MessageType.PAGE_ACCESS]: E2E_ACTIVE_PAGE_ACCESS_RESPONSE },
    storage: { sniptale_popup_startup: QUICK_ACTIONS_STARTUP },
  });
  await openPopupHarness(page, hostOrigin);
  await page.addStyleTag({ url: `${hostOrigin}/assets/index.css` });
  const tabMode = page.getByRole('button', {
    name: translate('popup.home.captureTabLabel', 'ru'),
    exact: true,
  });
  await expect(tabMode).toBeVisible();
  const icon = tabMode.locator(':scope > svg');
  await expect(icon).toHaveCount(1);
  await icon.evaluate((element) => {
    element.dataset['motionIdentity'] = 'same';
  });
  await tabMode.hover();
  await expect.poll(() => icon.evaluate((element) => getComputedStyle(element).scale)).toBe('1.1');
  await tabMode.click();
  await expect(tabMode).toHaveAttribute('aria-pressed', 'true');
  await expect(icon).toHaveAttribute('data-motion-identity', 'same');
  expect(await icon.evaluate((element) => getComputedStyle(element).transitionProperty)).toContain(
    'left'
  );
});

test('video mode descriptions crossfade immediately without reflow during the width transition', async ({
  page,
  hostOrigin,
}) => {
  await applyHarnessBootstrap(page, {
    apiBehavior: E2E_RUNTIME_SUCCESS_API_BEHAVIOR,
    runtimeResponses: { [MessageType.PAGE_ACCESS]: E2E_ACTIVE_PAGE_ACCESS_RESPONSE },
    storage: { sniptale_popup_startup: QUICK_ACTIONS_STARTUP },
  });
  await openPopupHarness(page, hostOrigin);
  await page.addStyleTag({ url: `${hostOrigin}/assets/index.css` });
  await page.locator('[data-ui="popup.app.tabs"] button[data-page="video"]').click();
  const screenLabel = translate('popup.video.modeScreenLabel', 'ru');
  const screen = page.getByRole('button', { name: screenLabel, exact: true });
  await expect(screen).toBeEnabled();
  await expect
    .poll(() =>
      page.evaluate(() => window.__sniptaleHarness?.getStorageState()['sniptale_video_ui_state'])
    )
    .toMatchObject({ captureMode: CaptureMode.TAB });
  await screen.click();
  await expect(screen).toHaveAttribute('aria-pressed', 'true');
  const samples = await screen.evaluate(async (button) => {
    const description = button.lastElementChild?.lastElementChild?.lastElementChild;
    if (!(description instanceof HTMLElement)) throw new Error('Mode description is unavailable');
    const layer = button.lastElementChild;
    if (!(layer instanceof HTMLElement)) throw new Error('Expanded mode layer is unavailable');
    const frames: { height: number; width: number; buttonWidth: number; opacity: number }[] = [];
    for (let frame = 0; frame < 24; frame += 1) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      frames.push({
        height: description.getBoundingClientRect().height,
        width: description.getBoundingClientRect().width,
        buttonWidth: button.getBoundingClientRect().width,
        opacity: Number(getComputedStyle(layer).opacity),
      });
    }
    await Promise.allSettled(
      button.getAnimations({ subtree: true }).map((animation) => animation.finished)
    );
    return frames;
  });
  await expect(screen).toHaveAttribute('aria-pressed', 'true');
  const visibleHeights = samples
    .filter((sample) => sample.opacity > 0)
    .map((sample) => sample.height);
  expect(samples.some((sample) => sample.opacity > 0 && sample.opacity < 1)).toBe(true);
  expect(
    Math.max(...samples.map((sample) => sample.buttonWidth)) -
      Math.min(...samples.map((sample) => sample.buttonWidth))
  ).toBeGreaterThan(1);
  expect(visibleHeights.length).toBeGreaterThan(0);
  expect(Math.max(...visibleHeights) - Math.min(...visibleHeights)).toBeLessThan(1);
  expect(
    Math.max(...samples.map((sample) => sample.width)) -
      Math.min(...samples.map((sample) => sample.width))
  ).toBeLessThan(1);
  const textLayout = await screen.evaluate((button) => {
    const description = button.lastElementChild?.lastElementChild?.lastElementChild;
    if (!(description instanceof HTMLElement)) throw new Error('Mode description is unavailable');
    return {
      height: description.clientHeight,
      scrollHeight: description.scrollHeight,
      width: description.clientWidth,
      scrollWidth: description.scrollWidth,
      textOverflow: getComputedStyle(description).textOverflow,
      right: description.getBoundingClientRect().right,
      buttonRight: button.getBoundingClientRect().right,
      bottom: description.getBoundingClientRect().bottom,
      buttonBottom: button.getBoundingClientRect().bottom,
    };
  });
  expect(textLayout.height).toBeGreaterThan(10);
  expect(textLayout.scrollHeight).toBeLessThanOrEqual(textLayout.height + 1);
  expect(textLayout.scrollWidth).toBeLessThanOrEqual(textLayout.width + 1);
  expect(textLayout.textOverflow).not.toBe('ellipsis');
  expect(textLayout.right).toBeLessThan(textLayout.buttonRight - 4);
  expect(textLayout.bottom).toBeLessThan(textLayout.buttonBottom - 4);
});

test('top navigation fills hovered icons in the direction of the underline', async ({
  page,
  hostOrigin,
}) => {
  await applyHarnessBootstrap(page, {
    apiBehavior: E2E_RUNTIME_SUCCESS_API_BEHAVIOR,
    runtimeResponses: { [MessageType.PAGE_ACCESS]: E2E_ACTIVE_PAGE_ACCESS_RESPONSE },
    storage: { sniptale_popup_startup: QUICK_ACTIONS_STARTUP },
  });
  await openPopupHarness(page, hostOrigin);
  await page.addStyleTag({ url: `${hostOrigin}/assets/index.css` });
  const nav = page.locator('[data-ui="popup.app.tabs"]');
  const video = nav.locator('button[data-page="video"]');
  const screenshot = nav.locator('button[data-page="screenshots"]');
  await expect(screenshot).toHaveAttribute('data-active', 'true');
  await video.hover();
  await expect
    .poll(() =>
      video
        .locator('.popup-react-shell__tab-icon')
        .evaluate((element) => getComputedStyle(element).transform)
    )
    .not.toBe('none');
  await video.click();
  await expect(video).toHaveAttribute('data-entry-side', 'left');
  expect(
    await video
      .locator('.popup-react-shell__tab-icon-accent')
      .evaluate((element) => getComputedStyle(element).animationName)
  ).toBe('popup-tab-icon-fill-from-left');
  const accentColor = await video
    .locator('.popup-react-shell__tab-icon-accent')
    .evaluate((element) => getComputedStyle(element).color);
  await expect
    .poll(() => video.evaluate((element) => getComputedStyle(element).color))
    .toBe(accentColor);
  await screenshot.click();
  await expect(screenshot).toHaveAttribute('data-entry-side', 'right');
  expect(
    await screenshot
      .locator('.popup-react-shell__tab-icon-accent')
      .evaluate((element) => getComputedStyle(element).animationName)
  ).toBe('popup-tab-icon-fill-from-right');
});

test('popup page access choice hides page actions and unlocks after activation', async ({
  page,
  hostOrigin,
}) => {
  const actionName = POPUP_VISIBLE_CAPTURE_LABEL;
  await applyHarnessBootstrap(page, {
    activeTab: {
      id: 1,
      title: 'Example page',
      url: 'https://example.test/page',
    },
    apiBehavior: E2E_RUNTIME_SUCCESS_API_BEHAVIOR,
    runtimeResponses: {
      [MessageType.PAGE_ACCESS]: {
        success: true,
        status: createInactivePageAccessStatus(),
      },
    },
  });
  await openPopupHarness(page, hostOrigin);

  await configurePageAccessActivation(page);
  await expectPageAccessLocked(page, actionName);

  await page.getByRole('button', { name: POPUP_ENABLE_FOR_TAB_LABEL, exact: true }).click();

  await expectPageAccessActivationRequest(page);
  await expect(page.locator('button', { hasText: actionName })).toBeVisible();
});

test('popup image editor action opens a new editor tab url', async ({ page, hostOrigin }) => {
  await applyHarnessBootstrap(page, {});
  await openPopupHarness(page, hostOrigin);

  await page.getByRole('button', { name: POPUP_IMAGE_EDITOR_LABEL, exact: true }).click();

  await expect
    .poll(async () => {
      const tabs = await page.evaluate(() => window.__sniptaleHarness?.getCreatedTabs() ?? []);
      return tabs.length;
    })
    .toBe(1);

  const [createdTab] = await page.evaluate(() => window.__sniptaleHarness?.getCreatedTabs() ?? []);
  expect(createdTab?.url).toContain('/apps/extension/src/editor/index.html');
});

test('popup video setup drives the recording lifecycle through typed runtime messages', async ({
  page,
  hostOrigin,
}) => {
  await applyHarnessBootstrap(page, {
    apiBehavior: E2E_RUNTIME_SUCCESS_API_BEHAVIOR,
    runtimeResponses: {
      [VideoMessageType.START_RECORDING]: {
        controlToken: 'control-token-1',
        recordingId: 'recording-1',
        result: 'accepted',
        success: true,
      },
    },
  });
  await openPopupHarness(page, hostOrigin);

  await startTabRecordingFromPopup(page);
  await expectStartRecordingMessage(page);
  await driveRecordingControls(page);
});

test('popup video setup opens the video editor surface', async ({ page, hostOrigin }) => {
  await applyHarnessBootstrap(page, {
    apiBehavior: E2E_RUNTIME_SUCCESS_API_BEHAVIOR,
  });
  await openPopupHarness(page, hostOrigin);

  await page.getByRole('button', { name: POPUP_VIDEO_TAB_LABEL, exact: true }).click();
  await page.locator('[data-ui="popup.video-setup.video-editor-button"]').click();

  await expect
    .poll(async () => {
      const tabs = await page.evaluate(() => window.__sniptaleHarness?.getCreatedTabs() ?? []);
      return tabs.length;
    })
    .toBe(1);

  const [createdTab] = await page.evaluate(() => window.__sniptaleHarness?.getCreatedTabs() ?? []);
  expect(createdTab?.url).toContain('/apps/extension/src/video-editor/index.html');
});

for (const viewport of PRIMARY_BROWSER_VIEWPORTS) {
  test(`popup discard cleanup error and retry ${viewport.name}`, async ({
    page,
    context,
    hostOrigin,
  }, info) => {
    await page.setViewportSize(viewport.size);
    const capability = { recordingId: 'recording-cleanup', controlToken: 'cleanup-control-token' };
    const activeState = createRecordingRuntimeState(VideoRecordingStatus.RECORDING);
    const failedState = {
      ...activeState,
      status: VideoRecordingStatus.STOPPING,
      error: 'Background cleanup refused',
      completion: { discard: true, outcome: 'stopped' as const, pending: false },
    };
    const bootstrap = {
      apiBehavior: E2E_RUNTIME_SUCCESS_API_BEHAVIOR,
      runtimeResponses: {
        [MessageType.PAGE_ACCESS]: E2E_ACTIVE_PAGE_ACCESS_RESPONSE,
        [VideoMessageType.GET_RECORDING_STATE]: {
          success: true,
          recordingHealth: 'healthy',
          state: activeState,
          ...capability,
        },
      },
      storage: {
        'sniptale-theme-preference': viewport.name === '1920x900' ? 'dark' : 'light',
        sniptale_popup_startup: {
          selection: 'video',
          lastPage: 'video',
          lastExportDestination: 'export',
        },
      },
    };
    await applyHarnessBootstrap(page, bootstrap);
    await openPopupHarness(page, hostOrigin);
    await page.addStyleTag({ url: `${hostOrigin}/assets/index.css` });
    await page.evaluate(
      ({ state, capability }) => {
        window.__sniptaleHarness?.setRuntimeResponse('STOP_RECORDING', async () => {
          await new Promise<void>((resolve) =>
            document.addEventListener('release-cleanup', () => resolve(), { once: true })
          );
          window.__sniptaleHarness?.setRuntimeResponse('GET_RECORDING_STATE', {
            success: true,
            recordingHealth: 'degraded',
            state,
            ...capability,
          });
          return { success: false, result: 'failed', error: 'Background cleanup refused' };
        });
      },
      { state: failedState, capability }
    );
    await page.locator('[data-ui="popup.video-active.cancel-button"]').click();
    await page.locator('[data-ui="popup.video-active.cancel-delete-button"]').click();
    await expect(page.locator('[data-ui="popup.video-active.cancel-delete-button"]')).toHaveCount(
      0
    );
    await page.evaluate(() => document.dispatchEvent(new Event('release-cleanup')));
    const failure = page.locator('[data-ui="popup.video-completion.error"]');
    await expect(failure).toBeVisible();
    await expect(
      failure.getByRole('button', { name: translate('popup.video.completionRetry', 'ru') })
    ).toBeEnabled();
    await page.screenshot({
      path: info.outputPath(`cleanup-failure-${viewport.name}.png`),
      fullPage: false,
    });

    const reopened = await context.newPage();
    await reopened.setViewportSize(viewport.size);
    await applyHarnessBootstrap(reopened, {
      ...bootstrap,
      runtimeResponses: {
        ...bootstrap.runtimeResponses,
        [VideoMessageType.GET_RECORDING_STATE]: {
          success: true,
          recordingHealth: 'degraded',
          state: failedState,
          ...capability,
        },
      },
    });
    await openPopupHarness(reopened, hostOrigin);
    await reopened.addStyleTag({ url: `${hostOrigin}/assets/index.css` });
    const retry = reopened.locator('[data-ui="popup.video-completion.retry"]');
    await expect(retry).toBeEnabled();
    await reopened.evaluate((idle) => {
      window.__sniptaleHarness?.setRuntimeResponse('STOP_RECORDING', () => {
        window.__sniptaleHarness?.setRuntimeResponse('GET_RECORDING_STATE', {
          success: true,
          recordingHealth: 'healthy',
          state: idle,
        });
        return { success: true, result: 'accepted' };
      });
    }, createRecordingRuntimeState(VideoRecordingStatus.IDLE));
    await retry.click();
    await expect(
      reopened.locator('[data-ui="popup.video-setup.start-recording-button"]')
    ).toBeVisible();
    expect(await getRuntimeMessagesByType(reopened, VideoMessageType.STOP_RECORDING)).toEqual([
      expect.objectContaining({ ...capability, discard: true }),
    ]);
    await emitHarnessRuntimeMessage(reopened, {
      type: VideoMessageType.RECORDING_STATE_SYNC,
      state: {
        ...failedState,
        completion: { discard: true, outcome: 'failed', pending: false },
      },
    });
    await expect(
      reopened.getByText(translate('popup.video.completionFailedDescription', 'ru'))
    ).toBeVisible();
    await expect(
      reopened.getByRole('button', { name: translate('popup.video.completionRetry', 'ru') })
    ).toHaveCount(0);
    await reopened.screenshot({
      path: info.outputPath(`cleanup-terminal-failure-${viewport.name}.png`),
      fullPage: false,
    });
    await reopened.close();
  });
}
