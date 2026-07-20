import { expect, type Page } from '@playwright/test';
import { test } from './support/extension-fixture';
import { PageAccessOperation } from '@sniptale/runtime-contracts/messaging/page-access';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { translate } from '../../../apps/extension/src/platform/i18n';
import {
  CaptureMode,
  createQuickAction,
  createRecordingRuntimeState,
  countRuntimeMessagesByType,
  E2E_RUNTIME_SUCCESS_API_BEHAVIOR,
  emitHarnessRuntimeMessage,
  getRuntimeMessagesByType,
  POPUP_HARNESS_PATH,
  POPUP_EXPORT_TAB_LABEL,
  POPUP_VIDEO_CANCEL_LABEL,
  POPUP_VIDEO_PAUSE_LABEL,
  POPUP_VIDEO_RESUME_LABEL,
  POPUP_VIDEO_STOP_LABEL,
  POPUP_VIDEO_TAB_LABEL,
  QUICK_ACTIONS_DISPLAY_MODE_KEY,
  QUICK_ACTIONS_KEY,
  applyHarnessBootstrap,
  VideoMessageType,
  VideoRecordingStatus,
} from './extension-critical.helpers';

const POPUP_ENABLE_FOR_TAB_LABEL = translate('popup.home.enableForTab', 'ru');

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
    page.getByRole('button', { name: POPUP_EXPORT_TAB_LABEL, exact: true })
  ).toBeDisabled();
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
      quality: expect.any(String),
      countdownSeconds: expect.any(Number),
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
    storage: {
      [QUICK_ACTIONS_KEY]: [createQuickAction(actionName)],
      [QUICK_ACTIONS_DISPLAY_MODE_KEY]: 'list',
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

test('popup page access choice hides page actions and unlocks after activation', async ({
  page,
  hostOrigin,
}) => {
  const actionName = 'Page access gated action';
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
    storage: {
      [QUICK_ACTIONS_KEY]: [createQuickAction(actionName)],
      [QUICK_ACTIONS_DISPLAY_MODE_KEY]: 'list',
    },
  });
  await openPopupHarness(page, hostOrigin);

  await configurePageAccessActivation(page);
  await expectPageAccessLocked(page, actionName);

  await page.getByRole('button', { name: POPUP_ENABLE_FOR_TAB_LABEL, exact: true }).click();

  await expectPageAccessActivationRequest(page);
  await expect(page.locator('button', { hasText: actionName })).toBeVisible();
  await expect(
    page.getByRole('button', { name: POPUP_EXPORT_TAB_LABEL, exact: true })
  ).toBeEnabled();
});

test('popup image editor action opens a new editor tab url', async ({ page, hostOrigin }) => {
  await applyHarnessBootstrap(page, {});
  await openPopupHarness(page, hostOrigin);

  await page.locator('[data-ui="popup.home.image-editor-button"]').click();

  await expect
    .poll(async () => {
      const tabs = await page.evaluate(() => window.__sniptaleHarness?.getCreatedTabs() ?? []);
      return tabs.length;
    })
    .toBe(1);

  const [createdTab] = await page.evaluate(() => window.__sniptaleHarness?.getCreatedTabs() ?? []);
  expect(createdTab?.url).toMatch(/\/apps\/extension\/src\/editor\/index\.html\?session=/);
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
