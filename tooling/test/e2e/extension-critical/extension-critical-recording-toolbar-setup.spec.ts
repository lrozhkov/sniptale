import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import { z } from 'zod';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import {
  CaptureMode,
  VideoRecordingBuiltInProfileId,
  VideoFrameRate,
  VideoRecordingStatus,
  VideoResolutionPreset,
} from '@sniptale/runtime-contracts/video/types/types';
import { parseRuntimeResponseForMessage } from '../../../../apps/extension/src/contracts/messaging/parsers/boundary';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { closeExtensionBrowser, launchExtensionBrowser } from '../support/extension-browser-launch';
import { startHostServer } from '../support/host-server';
import {
  evaluateInTarget,
  sendRuntimeMessage,
  triggerExtensionAction,
} from '../support/recording-action';
import { openDesignReview } from './extension-critical-page-toolbar.helpers';

test.setTimeout(120_000);
test.use({ actionTimeout: 10_000 });

const prefix = 'content.toolbar.video-recording.';
const profileId = 'toolbar-native-custom';
const profileName = 'Custom recording profile with a long name for compact toolbar layout';
const customOutput = {
  ...DEFAULT_VIDEO_SETTINGS.outputProfile,
  resolution: VideoResolutionPreset.P240,
  frameRate: VideoFrameRate.FPS24,
};

function control(page: Page, name: string): Locator {
  const element = page.locator(`[data-ui="${prefix}${name}"]`);
  return name.endsWith('.dropdown') ? element.locator('.sniptale-popover-menu') : element;
}

async function readState(popup: Page) {
  const response = parseRuntimeResponseForMessage(
    VideoMessageType.GET_RECORDING_STATE,
    await sendRuntimeMessage(popup, { type: VideoMessageType.GET_RECORDING_STATE })
  );
  if (!response.success || !response.state) throw new Error('Recording state is unavailable');
  return { ...response, state: response.state };
}

async function readSettings(popup: Page) {
  return popup.evaluate(async () => {
    const stored = await chrome.storage.local.get('sniptale_video_settings');
    const settings: unknown = stored.sniptale_video_settings;
    return settings;
  });
}

async function openSetup(
  launched: Awaited<ReturnType<typeof launchExtensionBrowser>>,
  origin: string,
  size: { width: number; height: number },
  orientation: 'horizontal' | 'vertical'
) {
  const { page, popup } = await openDesignReview(
    launched.context,
    launched.extensionId,
    origin,
    size
  );
  await popup.evaluate(
    async ({ defaults, output, id, name, locale }) => {
      await chrome.storage.local.set({
        'sniptale-locale-preference': locale,
        'sniptale-theme-preference': locale === 'ru' ? 'dark' : 'light',
        sniptale_video_settings: {
          ...defaults,
          microphoneEnabled: false,
          webcamEnabled: false,
          systemAudioEnabled: false,
          warnWithoutMicrophone: false,
          countdownSeconds: 0,
          qualityProfileId: null,
          outputProfile: output,
          qualityProfiles: [{ id, name, configuration: output }],
        },
      });
    },
    {
      defaults: DEFAULT_VIDEO_SETTINGS,
      output: customOutput,
      id: profileId,
      name: profileName,
      locale: size.width === 1920 ? 'ru' : 'en',
    }
  );
  await page.locator('[data-ui="content.toolbar.mode-selector-button"]').click();
  await page.locator('[data-ui="content.toolbar.mode-option.video-recording"]').click();
  await page.locator('[data-ui="content.toolbar.settings-button"]').click();
  const freePlacement = page.getByRole('button', {
    name: /Free toolbar placement|Свободное размещение/u,
  });
  if ((await freePlacement.getAttribute('aria-checked')) !== 'true') await freePlacement.click();
  if (orientation === 'vertical') {
    await page.getByRole('button', { name: /Vertical view|Вертикальный вид/u }).click();
  }
  await page.keyboard.press('Escape');
  return { page, popup };
}

async function screenshot(page: Page, info: TestInfo, name: string) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => undefined))
    );
  });
  await page.screenshot({ path: info.outputPath(name), fullPage: false });
}

async function expectFitsViewport(surface: Locator, page: Page) {
  await expect(surface).toBeVisible();
  await expect
    .poll(async () => {
      const box = await surface.boundingBox();
      const viewport = page.viewportSize()!;
      return Boolean(
        box &&
        box.x >= -1 &&
        box.y >= -1 &&
        box.x + box.width <= viewport.width + 1 &&
        box.y + box.height <= viewport.height + 1
      );
    })
    .toBe(true);
}

async function selectProfile(page: Page, id: string) {
  await control(page, 'quality.menu').click();
  await control(page, `quality.profile.${id}`).click();
  await expect(control(page, 'quality.dropdown')).toHaveCount(0);
}

async function expectSetupHidden(page: Page) {
  for (const name of [
    'quality.menu',
    'quality.dropdown',
    'capture-target.menu',
    'capture-target.dropdown',
  ]) {
    await expect(control(page, name)).toHaveCount(0);
  }
}

async function selectArea(page: Page) {
  await control(page, 'quality.menu').click();
  const area = control(page, 'capture-target').getByRole('button', { name: /^(Area|Область)$/u });
  await area.focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
}

async function moveToolbar(page: Page, destination: { x: number; y: number }) {
  const toolbar = page.locator('[data-ui="content.toolbar.root"]');
  const box = (await toolbar.boundingBox())!;
  const grip = (await toolbar.locator('.sniptale-drag-handle').boundingBox())!;
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    grip.x + grip.width / 2 + destination.x - box.x,
    grip.y + grip.height / 2 + destination.y - box.y,
    { steps: 8 }
  );
  await page.mouse.up();
}

async function chooseRegion(page: Page) {
  const selector = page.locator('#sniptale-region-selector-root');
  await expect(selector).toBeVisible();
  for (const [dimension, value] of [
    ['width', '400'],
    ['height', '240'],
  ] as const) {
    const input = selector.locator(`#sniptale-${dimension}-input`);
    await input.fill(value);
    await input.press('Enter');
  }
  const region = selector.locator('#sniptale-region');
  const initial = (await region.boundingBox())!;
  const destination = { x: 760, y: 240 };
  await page.mouse.move(initial.x + initial.width / 2, initial.y + initial.height / 2);
  await page.mouse.down();
  await page.mouse.move(destination.x + initial.width / 2, destination.y + initial.height / 2, {
    steps: 5,
  });
  await page.mouse.up();
  const selected = (await region.boundingBox())!;
  expect(selected.width).toBe(400);
  expect(selected.height).toBe(240);
  await selector.locator('.sniptale-selection-size-confirm-button').click();
  await expect(selector).toHaveCount(0);
  return selected;
}

async function refuseNextTabCapture(launched: Awaited<ReturnType<typeof launchExtensionBrowser>>) {
  const session = await launched.browser.newBrowserCDPSession();
  const targets = await session.send('Target.getTargets');
  await session.detach();
  const offscreen = targets.targetInfos.find((target) => target.url.includes('/offscreen/'));
  if (!offscreen) throw new Error('Recording offscreen document is unavailable');
  await evaluateInTarget(
    launched.context,
    offscreen.targetId,
    `(() => {
      const acquire = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      let refuse = true;
      navigator.mediaDevices.getUserMedia = async (constraints) => {
        if (refuse && constraints.video?.mandatory?.chromeMediaSource === 'tab') {
          refuse = false;
          globalThis.__toolbarSetupRefused = true;
          throw new DOMException('Test source unavailable', 'NotFoundError');
        }
        return acquire(constraints);
      };
    })()`
  );
  return async () =>
    evaluateInTarget(
      launched.context,
      offscreen.targetId,
      'globalThis.__toolbarSetupRefused === true'
    );
}

async function inspectSavedVideo(popup: Page) {
  const refs = await popup.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('sniptale-db');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<unknown>((resolve, reject) => {
        const request = database.transaction('asset_refs').objectStore('asset_refs').getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } finally {
      database.close();
    }
  });
  const [asset] = z
    .array(z.object({ location: z.object({ objectKey: z.string() }) }))
    .min(1)
    .parse(refs);
  return popup.evaluate(async (objectKey) => {
    let directory = await (
      await navigator.storage.getDirectory()
    ).getDirectoryHandle('sniptale-assets');
    const parts = objectKey.split('/');
    for (const part of parts.slice(0, -1)) directory = await directory.getDirectoryHandle(part);
    const file = await (await directory.getFileHandle(parts.at(-1)!)).getFile();
    const video = document.createElement('video');
    video.muted = true;
    const url = URL.createObjectURL(file);
    try {
      const ready = new Promise<void>((resolve, reject) => {
        video.onloadeddata = () => resolve();
        video.onerror = () =>
          reject(new Error(`Saved recording failed to decode: ${video.error?.message}`));
      });
      video.src = url;
      await ready;
      return { width: video.videoWidth, height: video.videoHeight, bytes: file.size };
    } finally {
      video.removeAttribute('src');
      video.load();
      URL.revokeObjectURL(url);
    }
  }, asset!.location.objectKey);
}

for (const { name, size } of PRIMARY_BROWSER_VIEWPORTS) {
  for (const orientation of ['horizontal', 'vertical'] as const) {
    test(`native recording setup profiles and area ${name} ${orientation}`, async ({}, info) => {
      const host = await startHostServer();
      const launched = await launchExtensionBrowser({ viewport: size });
      try {
        const { page, popup } = await openSetup(launched, host.origin, size, orientation);
        const quality = control(page, 'quality.menu');
        const qualityMenu = control(page, 'quality.dropdown');
        const target = control(page, 'quality.menu');
        const targetMenu = control(page, 'quality.dropdown');
        await quality.focus();
        await page.keyboard.press('Enter');
        await expectFitsViewport(qualityMenu, page);
        for (const id of Object.values(VideoRecordingBuiltInProfileId)) {
          await expect(control(page, `quality.profile.${id}`)).toBeVisible();
        }
        await expect(control(page, `quality.profile.${profileId}`)).toContainText(profileName);
        await screenshot(page, info, 'quality-profiles.png');
        await expect(control(page, 'capture-target.menu')).toHaveCount(0);
        const region = await control(page, 'capture-target').boundingBox();
        const firstProfile = await control(page, 'quality.profile.builtin:compact').boundingBox();
        expect(region!.y + region!.height).toBeLessThan(firstProfile!.y);
        await expectFitsViewport(targetMenu, page);
        await page.keyboard.press('Escape');
        await expect(targetMenu).toHaveCount(0);
        await expect(target).toBeFocused();
        await selectProfile(page, VideoRecordingBuiltInProfileId.COMPACT);
        await expect
          .poll(() => readSettings(popup))
          .toMatchObject({
            qualityProfileId: VideoRecordingBuiltInProfileId.COMPACT,
            outputProfile: {
              resolution: VideoResolutionPreset.P720,
              frameRate: VideoFrameRate.FPS30,
            },
          });
        await selectProfile(page, profileId);
        await expect
          .poll(() => readSettings(popup))
          .toMatchObject({
            qualityProfileId: profileId,
            outputProfile: customOutput,
          });
        await quality.click();
        await control(page, 'quality.details').click();
        for (const field of ['quality', 'container', 'codec', 'resolution', 'frameRate']) {
          await expect(control(page, `output.${field}`)).toBeVisible();
        }
        await expectFitsViewport(qualityMenu, page);
        await screenshot(page, info, 'quality-details.png');
        await control(page, 'output.frameRate').locator('button[aria-haspopup="listbox"]').click();
        await page.getByRole('option', { name: /30/u }).click();
        await expect
          .poll(() => readSettings(popup))
          .toMatchObject({
            qualityProfileId: null,
            outputProfile: { ...customOutput, frameRate: VideoFrameRate.FPS30 },
          });
        await expect(qualityMenu).toBeVisible();
        await control(page, 'quality.back').click();
        await expect(control(page, `quality.profile.${profileId}`)).toBeVisible();
        await page.keyboard.press('Escape');
        await selectProfile(page, profileId);
        await expect.poll(() => readSettings(popup)).toMatchObject({ qualityProfileId: profileId });
        await quality.click();
        await page.mouse.click(size.width - 4, size.height - 4);
        await expect(qualityMenu).toHaveCount(0);
        await selectArea(page);
        // This callback runs in the hostile page world, without extension event branding.
        await target.evaluate((element: HTMLButtonElement) => element.click());
        const tabChoice = control(page, 'capture-target').getByRole('button', {
          name: /^(Full tab|Вся вкладка)$/u,
        });
        await tabChoice.evaluate((element: HTMLButtonElement) => {
          element.click();
          element.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
        });
        await expect(
          control(page, 'capture-target').getByRole('button', {
            name: /^(Area|Область)$/u,
          })
        ).toHaveAttribute('aria-pressed', 'true');
        await page.keyboard.press('Escape');
        await target.evaluate((element) => {
          element.ownerDocument.defaultView?.addEventListener(
            'click',
            (event) => {
              if (event.isTrusted && event.composedPath().includes(element)) {
                event.preventDefault();
                event.stopImmediatePropagation();
              }
            },
            { capture: true }
          );
          element.addEventListener(
            'click',
            (event) => {
              element.setAttribute('data-test-retained-trust', String(event.isTrusted));
              element.ownerDocument.addEventListener(
                'sniptale-test-replay-target',
                () => {
                  const root = element.getRootNode();
                  if (!(root instanceof ShadowRoot))
                    throw new Error('Expected content shadow root');
                  const tab = root.querySelector(
                    '[data-ui="content.toolbar.video-recording.capture-target"] button'
                  );
                  if (!tab) throw new Error('Capture tab choice unavailable');
                  tab.dispatchEvent(event);
                },
                { once: true }
              );
            },
            { once: true }
          );
        });
        await target.click();
        await expect(target).toHaveAttribute('data-test-retained-trust', 'false');
        await target.evaluate((element) =>
          element.ownerDocument.dispatchEvent(new Event('sniptale-test-replay-target'))
        );
        await expect(
          control(page, 'capture-target').getByRole('button', {
            name: /^(Area|Область)$/u,
          })
        ).toHaveAttribute('aria-pressed', 'true');
        await page.keyboard.press('Escape');
        await moveToolbar(page, { x: 16, y: 16 });
        const action = await triggerExtensionAction(launched.context, launched.extensionId, page);
        await evaluateInTarget(launched.context, action, 'window.close()').catch(() => undefined);
        await page.bringToFront();
        await control(page, 'start').click();
        await expect(page.locator('#sniptale-region-selector-root')).toBeVisible();
        await expectSetupHidden(page);
        await page
          .locator('#sniptale-region-selector-root .sniptale-selection-size-cancel-button')
          .click();
        await expect(page.locator('#sniptale-region-selector-root')).toHaveCount(0);
        await expect(control(page, 'start')).toBeVisible();
        await expect(quality).toBeVisible();
        await expect(target).toBeVisible();
        expect((await readState(popup)).state.status).toBe(VideoRecordingStatus.IDLE);
        if (size.width === 1280 && orientation === 'horizontal') {
          const refused = await refuseNextTabCapture(launched);
          await control(page, 'start').click();
          await chooseRegion(page);
          await expect.poll(refused).toBe(true);
          await expect
            .poll(async () => (await readState(popup)).state.status)
            .toBe(VideoRecordingStatus.IDLE);
          await expect(quality).toBeVisible();
          await expect(target).toBeVisible();
          await expect
            .poll(() => readSettings(popup))
            .toMatchObject({
              qualityProfileId: profileId,
              outputProfile: customOutput,
            });
          await screenshot(page, info, 'failed-area-start-recovered.png');
        }
        await control(page, 'start').click();
        const selected = await chooseRegion(page);
        await expect
          .poll(async () => (await readState(popup)).state.status, { timeout: 30_000 })
          .toBe(VideoRecordingStatus.RECORDING);
        const state = (await readState(popup)).state;
        expect(state.captureMode).toBe(CaptureMode.TAB_CROP);
        expect(state.outputProfile).toEqual(customOutput);
        expect(state.cropRegion).toMatchObject({
          x: selected.x,
          y: selected.y,
          width: selected.width,
          height: selected.height,
        });
        await expectSetupHidden(page);
        const toolbar = page.locator('[data-ui="content.toolbar.root"]');
        const opacity = () =>
          toolbar.evaluate((element) => Number(getComputedStyle(element).opacity));
        const toolbarBox = (await toolbar.boundingBox())!;
        expect(
          toolbarBox.x + toolbarBox.width <= selected.x ||
            toolbarBox.y + toolbarBox.height <= selected.y ||
            toolbarBox.y >= selected.y + selected.height
        ).toBe(true);
        await page.mouse.click(size.width - 4, size.height - 4);
        await expect.poll(opacity).toBe(1);
        await screenshot(page, info, 'recording-toolbar-outside-area.png');
        await moveToolbar(page, { x: selected.x + 20, y: selected.y + 20 });
        await page.mouse.click(size.width - 4, size.height - 4);
        await expect.poll(opacity).toBeCloseTo(0.2, 2);
        await screenshot(page, info, 'recording-toolbar-overlaps-area.png');
        await control(page, 'pause').click();
        await expect(control(page, 'resume')).toBeVisible();
        await expectSetupHidden(page);
        await control(page, 'resume').click();
        await expect.poll(async () => (await readState(popup)).state.duration).toBeGreaterThan(1);
        await control(page, 'stop').click();
        await expect
          .poll(async () => (await readState(popup)).postRecordResult, { timeout: 30_000 })
          .toBeTruthy();
        await expect(quality).toBeVisible();
        await expect(target).toBeVisible();
        const saved = await inspectSavedVideo(popup);
        expect(saved).toMatchObject({ width: 400, height: 240 });
        expect(saved.bytes).toBeGreaterThan(0);
        await info.attach('saved-recording.json', {
          body: JSON.stringify({ selected, state, saved }),
          contentType: 'application/json',
        });
        await control(page, 'start').click();
        await expect(page.locator('#sniptale-region-selector-root')).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(quality).toBeVisible();
        await target.click();
        await expectFitsViewport(qualityMenu, page);
        await control(page, 'capture-target')
          .getByRole('button', { name: /^(Full tab|Вся вкладка)$/u })
          .click();
        await page.keyboard.press('Escape');
        await control(page, 'start').click();
        await expect
          .poll(async () => (await readState(popup)).state.status, { timeout: 30_000 })
          .toBe(VideoRecordingStatus.RECORDING);
        expect((await readState(popup)).state.captureMode).toBe(CaptureMode.TAB);
        await expect(page.locator('#sniptale-region-selector-root')).toHaveCount(0);
        await page.mouse.click(size.width - 4, size.height - 4);
        await expect.poll(opacity).toBeCloseTo(0.2, 2);
        await control(page, 'stop').click();
        await expect(control(page, 'start')).toBeVisible({ timeout: 30_000 });
      } finally {
        await closeExtensionBrowser(launched);
        await new Promise<void>((resolve) => host.server.close(() => resolve()));
      }
    });
  }
}

test('native recording setup menus fit below the desktop width', async ({}, info) => {
  const size = { width: 1000, height: 560 };
  const host = await startHostServer();
  const launched = await launchExtensionBrowser({ viewport: size });
  try {
    const { page } = await openSetup(launched, host.origin, size, 'horizontal');
    await control(page, 'quality.menu').click();
    await expectFitsViewport(control(page, 'quality.dropdown'), page);
    await screenshot(page, info, 'narrow-quality-profiles.png');
    await control(page, 'quality.details').click();
    await expectFitsViewport(control(page, 'quality.dropdown'), page);
    await screenshot(page, info, 'narrow-quality-details.png');
    await page.keyboard.press('Escape');
    await control(page, 'quality.menu').click();
    await expectFitsViewport(control(page, 'quality.dropdown'), page);
    await screenshot(page, info, 'narrow-capture-target.png');
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
    ).toBe(true);
  } finally {
    await closeExtensionBrowser(launched);
    await new Promise<void>((resolve) => host.server.close(() => resolve()));
  }
});

for (const { name, size } of PRIMARY_BROWSER_VIEWPORTS) {
  test(`recording quality dropdown surface and customization ${name}`, async ({}, info) => {
    const host = await startHostServer();
    const launched = await launchExtensionBrowser({ viewport: size });
    try {
      const { page } = await openSetup(launched, host.origin, size, 'horizontal');
      await control(page, 'quality.menu').click();
      await control(page, 'quality.details').click();
      for (const field of ['quality', 'container', 'codec', 'resolution', 'frameRate']) {
        const trigger = control(page, `output.${field}`).locator('button[aria-haspopup="listbox"]');
        await trigger.click();
        const list = page.getByRole('listbox');
        await expect(list).toBeVisible();
        const material = await list.evaluate((element) => {
          const css = getComputedStyle(element);
          return {
            border: css.borderTopWidth,
            style: css.borderTopStyle,
            color: css.borderTopColor,
            shadow: css.boxShadow,
            background: css.backgroundColor,
          };
        });
        await info.attach(`${field}-material`, {
          body: JSON.stringify(material),
          contentType: 'application/json',
        });
        await screenshot(page, info, `${field}-surface.png`);
        expect(material.border).toBe('1px');
        expect(material.style).toBe('solid');
        expect(material.shadow).not.toBe('none');
        await page.keyboard.press('Escape');
        await expect(list).toHaveCount(0);
        await expect(control(page, 'quality.dropdown')).toBeVisible();
      }
      await page.keyboard.press('Escape');
      await control(page, 'customize').click();
      await expect(control(page, 'quality.menu')).toBeDisabled();
      await screenshot(page, info, 'quality-customizing-disabled.png');
      await control(page, 'customize').click();
      await expect(control(page, 'quality.menu')).toBeEnabled();
      await control(page, 'quality.menu').click();
      await expect(control(page, 'quality.dropdown')).toBeVisible();
    } finally {
      await closeExtensionBrowser(launched);
      host.server.closeAllConnections();
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}
