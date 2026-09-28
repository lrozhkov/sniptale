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

test('video mode descriptions keep one line throughout the width transition', async ({
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
  const heights = await screen.evaluate(async (button) => {
    const description = button.lastElementChild?.lastElementChild?.lastElementChild;
    if (!(description instanceof HTMLElement)) throw new Error('Mode description is unavailable');
    button.click();
    const samples: number[] = [];
    for (let frame = 0; frame < 24; frame += 1) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      samples.push(description.getBoundingClientRect().height);
    }
    return samples;
  });
  await expect(screen).toHaveAttribute('aria-pressed', 'true');
  expect(Math.max(...heights) - Math.min(...heights)).toBeLessThan(1);
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
