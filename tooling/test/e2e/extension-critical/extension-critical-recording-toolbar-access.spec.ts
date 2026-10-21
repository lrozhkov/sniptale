import { expect, test, type BrowserContext, type Frame, type Page } from '@playwright/test';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import {
  VideoRecordingStatus,
  VideoResolutionPreset,
  WebcamPresentationMode,
  type VideoRecordingSettings,
} from '@sniptale/runtime-contracts/video/types/types';
import { parseRuntimeResponseForMessage } from '../../../../apps/extension/src/contracts/messaging/parsers/boundary';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { closeExtensionBrowser, launchExtensionBrowser } from '../support/extension-browser-launch';
import { startHostServer } from '../support/host-server';
import {
  evaluateInTarget,
  openRealPopup,
  sendRuntimeMessage,
  triggerExtensionAction,
} from '../support/recording-action';

test.use({ actionTimeout: 10_000 });
test.setTimeout(60_000);

const permissionFrameSelector = '[data-ui="content.toolbar.video-recording.permission-frame"]';
const nativePermissions = process.env.SNIPTALE_NATIVE_PERMISSION_PROOF === '1';

async function openToolbar(
  context: BrowserContext,
  extensionId: string,
  origin: string,
  appearance: { locale: 'ru' | 'en'; theme: 'light' | 'dark' } = { locale: 'en', theme: 'dark' },
  recordingSettings: Partial<VideoRecordingSettings> = {}
) {
  const popup = await openRealPopup(context, extensionId);
  await popup.evaluate(
    async ({ settings, appearance }) => {
      await chrome.storage.local.set({
        sniptale_video_settings: settings,
        'sniptale-locale-preference': appearance.locale,
        'sniptale-theme-preference': appearance.theme,
      });
    },
    {
      settings: {
        ...DEFAULT_VIDEO_SETTINGS,
        microphoneEnabled: true,
        webcamEnabled: true,
        countdownSeconds: 0,
        ...recordingSettings,
      },
      appearance,
    }
  );
  const page = await context.newPage();
  await page.goto(`${origin}/fixtures/host-page.html`);
  await popup.evaluate((origin) => {
    const grant = document.createElement('button');
    grant.textContent = 'Grant toolbar test host';
    grant.onclick = async () => {
      grant.dataset['granted'] = String(
        await chrome.permissions.request({ origins: [`${origin}/*`] })
      );
    };
    document.body.append(grant);
  }, origin);
  const grant = popup.getByRole('button', { name: 'Grant toolbar test host' });
  await grant.click();
  await expect(grant).toHaveAttribute('data-granted', 'true');
  const tabId = await popup.evaluate(async (url) => {
    const tab = (await chrome.tabs.query({})).find((tab) => tab.url === url);
    if (tab?.id === undefined) throw new Error('Recording toolbar host is unavailable');
    return tab.id;
  }, page.url());
  await page.reload();
  expect(
    await sendRuntimeMessage(popup, {
      type: 'PAGE_ACCESS',
      operation: 'register-granted-site',
      tabId,
    })
  ).toMatchObject({ success: true });
  expect(
    await popup.evaluate(
      (tabId) =>
        chrome.tabs.sendMessage(tabId, {
          type: 'ENABLE_SCREENSHOT_MODE',
          workingMode: 'design-review',
        }),
      tabId
    )
  ).toMatchObject({ success: true });
  await page.bringToFront();
  await page.locator('[data-ui="content.toolbar.mode-selector-button"]').click();
  await page.locator('[data-ui="content.toolbar.mode-option.video-recording"]').click();
  const action = await triggerExtensionAction(context, extensionId, page);
  await evaluateInTarget(context, action, 'window.close()').catch(() => undefined);
  await page.bringToFront();
  return { page, popup };
}

async function settled(page: Page) {
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

async function gatePermissionRequest(context: BrowserContext) {
  await context.addInitScript(() => {
    if (!location.pathname.endsWith('/media-permission/index.html')) return;
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    Reflect.set(globalThis, '__toolbarPermissionRequested', false);
    const ready = new Promise<void>((resolve) =>
      Reflect.set(globalThis, '__allowToolbarPermission', resolve)
    );
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      Reflect.set(globalThis, '__toolbarPermissionRequested', true);
      await ready;
      return original(constraints);
    };
  });
}

async function permissionFrame(page: Page): Promise<Frame> {
  const locator = page.locator(permissionFrameSelector).last();
  await expect(locator).toBeAttached();
  const element = await locator.elementHandle();
  const frame = await element?.contentFrame();
  if (!frame) throw new Error('Recording permission frame is unavailable');
  await frame.waitForURL(/\/media-permission\/index\.html$/);
  return frame;
}

async function resolvePermissionRequest(
  launched: Awaited<ReturnType<typeof launchExtensionBrowser>>,
  page: Page,
  frame: Frame,
  kind: 'microphone' | 'camera',
  setting: 'granted' | 'denied'
) {
  await expect
    .poll(() => frame.evaluate(() => Reflect.get(globalThis, '__toolbarPermissionRequested')))
    .toBe(true);
  const session = await launched.browser.newBrowserCDPSession();
  const extensionOrigin = `chrome-extension://${launched.extensionId}`;
  await session.send('Browser.setPermission', {
    origin: extensionOrigin,
    permission: { name: kind },
    setting,
  });
  await session.send('Browser.setPermission', {
    origin: new URL(page.url()).origin,
    embeddedOrigin: extensionOrigin,
    permission: { name: kind },
    setting,
  });
  await frame.evaluate(() => {
    const allow = Reflect.get(globalThis, '__allowToolbarPermission');
    if (typeof allow !== 'function') throw new Error('Toolbar permission gate is unavailable');
    allow();
  });
}

async function expectRecordingNotStarted(page: Page) {
  await expect(page.locator('[data-ui="content.toolbar.video-recording.pause"]')).toHaveCount(0);
  await expect(page.locator('[data-ui="content.toolbar.video-recording.start"]')).toBeVisible();
}

async function readRecordingState(popup: Page) {
  const response = parseRuntimeResponseForMessage(
    VideoMessageType.GET_RECORDING_STATE,
    await sendRuntimeMessage(popup, { type: VideoMessageType.GET_RECORDING_STATE })
  );
  if (response.success !== true || !response.state) {
    throw new Error('Recording toolbar state is unavailable');
  }
  return { ...response, state: response.state };
}

test('real toolbar retains device grants through countdown and recording handoff', async ({}, info) => {
  test.setTimeout(nativePermissions ? 360_000 : 120_000);
  const host = await startHostServer();
  const launched = await launchExtensionBrowser({
    viewport: PRIMARY_BROWSER_VIEWPORTS[0].size,
    fakeMediaDevices: true,
    autoGrantMediaPermissions: false,
  });
  try {
    const { page, popup } = await openToolbar(
      launched.context,
      launched.extensionId,
      host.origin,
      { locale: 'en', theme: 'dark' },
      {
        countdownSeconds: 3,
        systemAudioEnabled: false,
        qualityProfileId: null,
        outputProfile: {
          ...DEFAULT_VIDEO_SETTINGS.outputProfile,
          resolution: VideoResolutionPreset.P240,
        },
        webcamPresentation: {
          ...DEFAULT_VIDEO_SETTINGS.webcamPresentation!,
          mode: WebcamPresentationMode.EMBEDDED,
        },
      }
    );
    if (!nativePermissions) await gatePermissionRequest(launched.context);
    for (const kind of ['microphone', 'camera'] as const) {
      const toggle = page.locator(`[data-ui="content.toolbar.video-recording.${kind}.toggle"]`);
      await expect(toggle).toHaveAttribute('aria-pressed', 'false');
      await toggle.click();
      const frame = await permissionFrame(page);
      if (nativePermissions)
        console.log(`NATIVE_HANDOFF_PERMISSION ${kind} DISPLAY=${process.env.DISPLAY}`);
      else await resolvePermissionRequest(launched, page, frame, kind, 'granted');
      await expect(toggle).toHaveAttribute('aria-pressed', 'true', {
        timeout: nativePermissions ? 150_000 : 10_000,
      });
    }
    await expect(page.locator(permissionFrameSelector)).toHaveCount(2);
    await expectRecordingNotStarted(page);
    await page.locator('[data-ui="content.toolbar.video-recording.start"]').click();
    await expect
      .poll(async () => (await readRecordingState(popup)).state.status)
      .toBe(VideoRecordingStatus.COUNTDOWN);
    await expect(page.locator(permissionFrameSelector)).toHaveCount(2);
    await page.screenshot({
      path: info.outputPath('countdown-held-device-grants.png'),
      fullPage: false,
    });
    await expect
      .poll(async () => (await readRecordingState(popup)).state.status, { timeout: 30_000 })
      .toBe(VideoRecordingStatus.RECORDING);
    await expect(page.locator(permissionFrameSelector)).toHaveCount(0);
    await expect
      .poll(async () => (await readRecordingState(popup)).state.liveMedia)
      .toMatchObject({
        microphoneEnabled: true,
        webcamEnabled: true,
      });
    const camera = page.locator('[data-ui="content.video-recording.embedded-camera"] video');
    await expect(camera).toBeVisible();
    await expect
      .poll(() =>
        camera.evaluate((video: HTMLVideoElement) => {
          const stream = video.srcObject;
          return (
            video.readyState >= 2 &&
            video.videoWidth > 0 &&
            stream instanceof MediaStream &&
            stream.getVideoTracks().some((track) => track.readyState === 'live')
          );
        })
      )
      .toBe(true);
    await expect
      .poll(async () => (await readRecordingState(popup)).state.duration)
      .toBeGreaterThan(1);
    await page.screenshot({
      path: info.outputPath('recording-after-device-handoff.png'),
      fullPage: false,
    });
    await page.locator('[data-ui="content.toolbar.video-recording.stop"]').click();
    await expect
      .poll(async () => (await readRecordingState(popup)).postRecordResult, { timeout: 30_000 })
      .toBeTruthy();
    const saved = (await readRecordingState(popup)).postRecordResult!;
    expect(saved.primaryRecordingId).toEqual(expect.any(String));
    await expect
      .poll(async () => (await readRecordingState(popup)).state.status)
      .toBe(VideoRecordingStatus.IDLE);
    expect(
      await popup.evaluate(async (recordingId) => {
        const database = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open('sniptale-db');
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        try {
          return await new Promise<boolean>((resolve, reject) => {
            const request = database
              .transaction('recordings', 'readonly')
              .objectStore('recordings')
              .getKey(recordingId);
            request.onsuccess = () => resolve(request.result !== undefined);
            request.onerror = () => reject(request.error);
          });
        } finally {
          database.close();
        }
      }, saved.primaryRecordingId)
    ).toBe(true);
  } finally {
    await closeExtensionBrowser(launched);
    await new Promise<void>((resolve) => host.server.close(() => resolve()));
  }
});

test('live microphone permission moves to recording ownership and retires on stop', async () => {
  test.skip(nativePermissions, 'Native grant handoff is exercised by the countdown scenario.');
  test.setTimeout(120_000);
  const host = await startHostServer();
  const launched = await launchExtensionBrowser({
    viewport: PRIMARY_BROWSER_VIEWPORTS[0].size,
    fakeMediaDevices: true,
    autoGrantMediaPermissions: false,
  });
  try {
    const { page, popup } = await openToolbar(
      launched.context,
      launched.extensionId,
      host.origin,
      { locale: 'en', theme: 'dark' },
      {
        microphoneEnabled: false,
        webcamEnabled: false,
        warnWithoutMicrophone: false,
        countdownSeconds: 0,
        systemAudioEnabled: true,
        qualityProfileId: null,
        outputProfile: {
          ...DEFAULT_VIDEO_SETTINGS.outputProfile,
          resolution: VideoResolutionPreset.P240,
        },
      }
    );
    await gatePermissionRequest(launched.context);
    await page.locator('[data-ui="content.toolbar.video-recording.start"]').click();
    await expect
      .poll(async () => (await readRecordingState(popup)).state.status, { timeout: 30_000 })
      .toBe(VideoRecordingStatus.RECORDING);
    await page.locator('[data-ui="content.toolbar.video-recording.microphone.toggle"]').click();
    const frame = await permissionFrame(page);
    await resolvePermissionRequest(launched, page, frame, 'microphone', 'granted');
    await expect
      .poll(async () => (await readRecordingState(popup)).state.liveMedia?.microphoneEnabled)
      .toBe(true);
    await expect(page.locator(permissionFrameSelector)).toHaveCount(0);
    await page.locator('[data-ui="content.toolbar.video-recording.stop"]').click();
    await expect
      .poll(async () => (await readRecordingState(popup)).state.status, { timeout: 30_000 })
      .toBe(VideoRecordingStatus.IDLE);
    await expect(page.locator(permissionFrameSelector)).toHaveCount(0);
  } finally {
    await closeExtensionBrowser(launched);
    await new Promise<void>((resolve) => host.server.close(() => resolve()));
  }
});

for (const viewport of PRIMARY_BROWSER_VIEWPORTS) {
  for (const kind of ['microphone', 'camera'] as const) {
    for (const entry of ['toggle', 'menu'] as const) {
      test(`real toolbar ${kind} ${entry} requests access and shows real devices ${viewport.name}`, async ({}, info) => {
        const host = await startHostServer();
        const launched = await launchExtensionBrowser({
          viewport: viewport.size,
          fakeMediaDevices: true,
          autoGrantMediaPermissions: false,
        });
        const { context, extensionId } = launched;
        try {
          const { page, popup } = await openToolbar(context, extensionId, host.origin);
          const toggle = page.locator(`[data-ui="content.toolbar.video-recording.${kind}.toggle"]`);
          await expect(toggle).toHaveAttribute('aria-pressed', 'false');
          if (nativePermissions) test.setTimeout(180_000);
          else await gatePermissionRequest(context);
          const pagesBeforeRequest = context.pages().map((candidate) => candidate.url());
          const originalUrl = page.url();
          await page
            .locator(`[data-ui="content.toolbar.video-recording.${kind}.${entry}"]`)
            .click();
          const request = await permissionFrame(page);
          const exposedUrl = await page
            .locator(permissionFrameSelector)
            .evaluate((element) => (element instanceof HTMLIFrameElement ? element.src : ''));
          expect(new URL(exposedUrl).host).not.toBe(extensionId);
          expect(new URL(request.url()).host).toBe(extensionId);
          if (nativePermissions)
            console.log(`NATIVE_PERMISSION ${kind} DISPLAY=${process.env.DISPLAY}`);
          else await resolvePermissionRequest(launched, page, request, kind, 'granted');
          const dropdown = page.locator(
            `[data-ui="content.toolbar.video-recording.${kind}.dropdown"]`
          );
          if (entry === 'toggle') {
            await expect(toggle).toHaveAttribute('aria-pressed', 'true', {
              timeout: nativePermissions ? 150_000 : 20_000,
            });
          } else {
            await expect(dropdown.locator('button:not(:disabled)').first()).toBeVisible({
              timeout: nativePermissions ? 150_000 : 20_000,
            });
          }
          expect(
            await request.evaluate(
              async (kind) =>
                (await navigator.permissions.query({ name: kind as PermissionName })).state,
              kind
            )
          ).toBe('granted');
          if (nativePermissions) {
            expect(
              await page.evaluate(
                async (kind) =>
                  (await navigator.permissions.query({ name: kind as PermissionName })).state,
                kind
              )
            ).toBe('prompt');
          }
          expect(page.url()).toBe(originalUrl);
          expect(context.pages().map((candidate) => candidate.url())).toEqual(pagesBeforeRequest);
          await expect
            .poll(() =>
              popup.evaluate(
                async () => (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.url
              )
            )
            .toBe(page.url());
          await expectRecordingNotStarted(page);
          const menu = page.locator(`[data-ui="content.toolbar.video-recording.${kind}.menu"]`);
          if ((await menu.getAttribute('aria-expanded')) !== 'true') await menu.click();
          await expect(dropdown.locator('button:not(:disabled)').first()).toBeVisible();
          await expect(dropdown).not.toContainText(/^(Microphone|Camera) 1$/m);
          await expect(dropdown).toContainText(/Fake|fake|default|Default/);
          await settled(page);
          await page.screenshot({
            path: info.outputPath('granted-device-menu.png'),
            fullPage: false,
          });
        } finally {
          await closeExtensionBrowser(launched);
          await new Promise<void>((resolve) => host.server.close(() => resolve()));
        }
      });
    }
  }

  for (const appearance of [
    { locale: 'ru', theme: 'light' },
    { locale: 'en', theme: 'dark' },
  ] as const) {
    test(`real toolbar microphone confirmation stays compact ${viewport.name} ${appearance.locale}-${appearance.theme}`, async ({}, info) => {
      const host = await startHostServer();
      const launched = await launchExtensionBrowser({
        viewport: viewport.size,
        fakeMediaDevices: true,
        autoGrantMediaPermissions: false,
      });
      try {
        const { page } = await openToolbar(
          launched.context,
          launched.extensionId,
          host.origin,
          appearance
        );
        await page.locator('[data-ui="content.toolbar.video-recording.start"]').click();
        const dialog = page.getByRole('alertdialog');
        await expect(dialog).toBeVisible();
        await expect(dialog).toBeFocused();
        const checkbox = dialog.getByRole('checkbox');
        await expect(checkbox).toHaveCSS('appearance', 'none');
        expect(
          await checkbox.evaluate((element) => getComputedStyle(element, '::before').borderRadius)
        ).toBe('50%');
        await settled(page);
        await page.screenshot({ path: info.outputPath('without-microphone.png'), fullPage: false });
        const box = (await dialog.boundingBox())!;
        expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.y + box.height).toBeLessThanOrEqual(viewport.size.height);
        await dialog
          .getByRole('button', {
            name: appearance.locale === 'ru' ? 'Отмена' : 'Cancel',
            exact: true,
          })
          .click();
        await expect(dialog).toHaveCount(0);
        await expect(page.locator('[data-ui="content.toolbar.video-recording.pause"]')).toHaveCount(
          0
        );
      } finally {
        await closeExtensionBrowser(launched);
        await new Promise<void>((resolve) => host.server.close(() => resolve()));
      }
    });
  }

  for (const kind of ['microphone', 'camera'] as const) {
    test(`real toolbar ${kind} denial preserves disabled source ${viewport.name}`, async ({}, info) => {
      test.skip(nativePermissions, 'Native grant runs do not override browser decisions.');
      const host = await startHostServer();
      const launched = await launchExtensionBrowser({
        viewport: viewport.size,
        fakeMediaDevices: true,
        autoGrantMediaPermissions: false,
      });
      try {
        const { page } = await openToolbar(
          launched.context,
          launched.extensionId,
          host.origin,
          viewport.name === '1280x560'
            ? { locale: 'ru', theme: 'light' }
            : { locale: 'en', theme: 'dark' }
        );
        await gatePermissionRequest(launched.context);
        const pagesBeforeRequest = launched.context.pages().map((candidate) => candidate.url());
        await page.locator(`[data-ui="content.toolbar.video-recording.${kind}.toggle"]`).click();
        const frame = await permissionFrame(page);
        await resolvePermissionRequest(launched, page, frame, kind, 'denied');
        await expect(frame.locator('[data-ui="recording.media-permission.status"]')).toContainText(
          /access|permission|denied|доступ/i
        );
        await expect(
          page.locator(`[data-ui="content.toolbar.video-recording.${kind}.toggle"]`)
        ).toHaveAttribute('aria-pressed', 'false');
        await settled(page);
        await page.screenshot({ path: info.outputPath('permission-denied.png'), fullPage: false });
        await expect(page.getByRole('alert').filter({ hasText: 'Unknown error' })).toHaveCount(0);
        expect(
          await frame.evaluate(() => document.documentElement.scrollHeight)
        ).toBeLessThanOrEqual(92);
        const cardRadius = await frame
          .locator('main')
          .evaluate((node) => getComputedStyle(node).borderRadius);
        expect(cardRadius).toBe('8px');
        await expect(page.locator(permissionFrameSelector)).toHaveCSS('border-radius', cardRadius);
        const recovery = frame.locator('[data-ui="recording.media-permission.settings"]');
        await expect(recovery).toBeVisible();
        const settingsOpened = launched.context.waitForEvent('page');
        await recovery.click();
        const settings = await settingsOpened;
        await settings.waitForLoadState();
        const settingsUrl = new URL(settings.url());
        expect(`${settingsUrl.protocol}//${settingsUrl.host}${settingsUrl.pathname}`).toBe(
          'chrome://settings/content/siteDetails'
        );
        expect(settingsUrl.searchParams.get('site')).toBe(
          `chrome-extension://${launched.extensionId}/`
        );
        await expect(
          settings.getByRole('heading', { name: 'Permissions', exact: true })
        ).toBeVisible();
        await expect(
          settings.getByRole('heading', { name: new RegExp(launched.extensionId) })
        ).toBeVisible();
        await settings.screenshot({
          path: info.outputPath('extension-permissions-settings.png'),
          fullPage: false,
        });
        await settings.close();
        await expectRecordingNotStarted(page);
        await frame.locator('[data-ui="recording.media-permission.cancel"]').click();
        await expect(page.locator(permissionFrameSelector)).toHaveCount(0);
        expect(launched.context.pages().map((candidate) => candidate.url())).toEqual(
          pagesBeforeRequest
        );
        await expectRecordingNotStarted(page);
      } finally {
        await closeExtensionBrowser(launched);
        await new Promise<void>((resolve) => host.server.close(() => resolve()));
      }
    });

    test(`real toolbar ${kind} respects host permission policy ${viewport.name}`, async ({}, info) => {
      const host = await startHostServer();
      const launched = await launchExtensionBrowser({
        viewport: viewport.size,
        fakeMediaDevices: true,
        autoGrantMediaPermissions: false,
      });
      try {
        await launched.context.route(`${host.origin}/fixtures/host-page.html`, async (route) => {
          const response = await route.fetch();
          await route.fulfill({
            response,
            headers: { ...response.headers(), 'permissions-policy': 'microphone=(), camera=()' },
          });
        });
        const { page } = await openToolbar(launched.context, launched.extensionId, host.origin);
        const pagesBeforeRequest = launched.context.pages().map((candidate) => candidate.url());
        await page.locator(`[data-ui="content.toolbar.video-recording.${kind}.toggle"]`).click();
        const frame = await permissionFrame(page);
        await expect(frame.locator('[data-ui="recording.media-permission.status"]')).toContainText(
          /page|site|policy|blocked/i
        );
        await expect(frame.locator('[data-ui="recording.media-permission.settings"]')).toBeHidden();
        await expect(
          page.locator(`[data-ui="content.toolbar.video-recording.${kind}.toggle"]`)
        ).toHaveAttribute('aria-pressed', 'false');
        expect(launched.context.pages().map((candidate) => candidate.url())).toEqual(
          pagesBeforeRequest
        );
        await expectRecordingNotStarted(page);
        await settled(page);
        await page.screenshot({ path: info.outputPath('host-policy-denied.png'), fullPage: false });
        await frame.locator('[data-ui="recording.media-permission.cancel"]').click();
        await expect(page.locator(permissionFrameSelector)).toHaveCount(0);
      } finally {
        await closeExtensionBrowser(launched);
        await new Promise<void>((resolve) => host.server.close(() => resolve()));
      }
    });
  }

  test(`real toolbar permission cancellation preserves source ${viewport.name}`, async () => {
    test.skip(nativePermissions, 'Native grant runs do not gate browser permission requests.');
    const host = await startHostServer();
    const launched = await launchExtensionBrowser({
      viewport: viewport.size,
      fakeMediaDevices: true,
      autoGrantMediaPermissions: false,
    });
    try {
      const { page, popup } = await openToolbar(
        launched.context,
        launched.extensionId,
        host.origin
      );
      await gatePermissionRequest(launched.context);
      await page.locator('[data-ui="content.toolbar.video-recording.microphone.toggle"]').click();
      const frame = await permissionFrame(page);
      await expect
        .poll(() => frame.evaluate(() => Reflect.get(globalThis, '__toolbarPermissionRequested')))
        .toBe(true);
      await expect(page.locator(permissionFrameSelector)).toBeHidden();
      await page.locator('[data-ui="content.toolbar.mode-selector-button"]').click();
      await page.locator('[data-ui="content.toolbar.mode-option.drawing"]').click();
      await expect(page.locator(permissionFrameSelector)).toHaveCount(0);
      await expect(page.locator('[data-ui="content.toolbar.video-recording.start"]')).toHaveCount(
        0
      );
      expect((await readRecordingState(popup)).state.status).toBe(VideoRecordingStatus.IDLE);
    } finally {
      await closeExtensionBrowser(launched);
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}

test('compact permission error and confirmation fit a narrow desktop viewport', async ({}, info) => {
  const host = await startHostServer();
  const launched = await launchExtensionBrowser({
    viewport: { width: 960, height: 560 },
    fakeMediaDevices: true,
    autoGrantMediaPermissions: false,
  });
  try {
    await launched.context.route(`${host.origin}/fixtures/host-page.html`, async (route) => {
      const response = await route.fetch();
      await route.fulfill({
        response,
        headers: { ...response.headers(), 'permissions-policy': 'microphone=(), camera=()' },
      });
    });
    const { page } = await openToolbar(launched.context, launched.extensionId, host.origin, {
      locale: 'ru',
      theme: 'light',
    });
    await page.locator('[data-ui="content.toolbar.video-recording.camera.toggle"]').click();
    const frame = await permissionFrame(page);
    await expect(frame.getByRole('alert')).toContainText('Этот сайт');
    expect(await frame.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(
      92
    );
    await settled(page);
    await page.screenshot({
      path: info.outputPath('compact-permission-error.png'),
      fullPage: false,
    });
    await frame.getByRole('button', { name: 'Закрыть', exact: true }).click();
    await page.locator('[data-ui="content.toolbar.video-recording.start"]').click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toBeVisible();
    const box = (await dialog.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(960);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      960
    );
    await dialog.getByRole('button', { name: 'Отмена', exact: true }).click();
    await expect(dialog).toHaveCount(0);
  } finally {
    await closeExtensionBrowser(launched);
    await new Promise<void>((resolve) => host.server.close(() => resolve()));
  }
});
