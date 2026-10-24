import { expect, test } from '@playwright/test';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import {
  evaluateInTarget,
  openRealPopup,
  triggerExtensionAction,
} from '../support/recording-action';
import {
  CAMERA_ROUTE,
  sizes,
  tr,
  command,
  scrollStart,
  capture,
  launchCamera,
  nativeWindow,
  geometry,
  fontProof,
  playbackLabel,
  controls,
  savedResult,
  withBrowser,
  clickNativeStart,
} from './camera-recorder-design.test-support';

test.use({ actionTimeout: 10_000 });
test.setTimeout(150_000);

for (const stopBeforeFloat of [false, true]) {
  test(`native Camera result confirmation works in the floating window (Stop before Float: ${stopBeforeFloat})`, async ({}, info) => {
    const c = { locale: 'en', theme: 'dark' } as const;
    await withBrowser(c, info, async (context, extensionId, origin) => {
      const page = await launchCamera(context, extensionId, origin, c);
      if (stopBeforeFloat) {
        await command(page, c, 'popup.video.stopButton').click();
        await expect(command(page, c, 'popup.video.postRecordDelete')).toBeEnabled({
          timeout: 30_000,
        });
      }
      const [pip] = await Promise.all([
        context.waitForEvent('page'),
        command(page, c, 'popup.video.teleprompterFloat').click(),
      ]);
      await pip.setViewportSize({ width: 480, height: 640 });
      if (!stopBeforeFloat) await command(pip, c, 'popup.video.stopButton').click();
      const trigger = command(pip, c, 'popup.video.postRecordDelete');
      await expect(trigger).toBeEnabled({ timeout: 30_000 });
      await trigger.click();
      await expect(pip.getByRole('alertdialog')).toBeVisible();
      await expect(
        pip.getByRole('button', { name: tr(c, 'common.actions.cancel'), exact: true })
      ).toBeFocused();
      await capture(pip, info, 'result-floating-delete-confirmation');
      await pip.keyboard.press('Escape');
      await expect(pip.getByRole('alertdialog')).toHaveCount(0);
      await expect(trigger).toBeFocused();
      await capture(pip, info, 'result-floating');
      await trigger.click();
      await expect(pip.getByRole('alertdialog')).toBeVisible();
      await pip.close();
      await expect(page.getByRole('alertdialog')).toHaveCount(0);
      const dockedTrigger = command(page, c, 'popup.video.postRecordDelete');
      await expect(command(page, c, 'popup.video.teleprompterFloat')).toBeFocused();
      await dockedTrigger.click();
      await expect(page.getByRole('alertdialog')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('alertdialog')).toHaveCount(0);
      await expect(dockedTrigger).toBeFocused();
      await capture(page, info, 'result-restored-after-confirmation');
    });
  });
}

for (const locale of ['ru', 'en'] as const) {
  for (const theme of ['light', 'dark'] as const) {
    const composition = { locale, theme };
    test(`native Camera ${locale} ${theme} compositions and supported controls`, async ({}, info) => {
      await withBrowser(composition, info, async (context, extensionId, origin, fonts) => {
        const page = await launchCamera(context, extensionId, origin, composition);
        await nativeWindow(context, page, info);
        for (const size of sizes) {
          await page.setViewportSize(size);
          await geometry(page);
          await capture(page, info, `live-${size.width}x${size.height}`);
        }
        await fontProof(context, page, info, fonts);
        await page.setViewportSize(sizes[1]!);
        await controls(page, composition, info);
        await savedResult(page, composition, info);
      });
    });
  }
}

test('native Camera narrow boundary and unregistered route keep authority unavailable', async ({}, info) => {
  const c = { locale: 'ru', theme: 'dark' } as const;
  await withBrowser(c, info, async (context, extensionId, origin) => {
    const page = await launchCamera(context, extensionId, origin, c);
    for (const width of [767, 768, 769]) {
      await page.setViewportSize({ width, height: 560 });
      await geometry(page);
      await capture(page, info, `narrow-${width}`);
    }
    const tab = await page.evaluate(() => chrome.tabs.getCurrent());
    if (tab?.id === undefined) throw new Error('Recorder tab missing for browser zoom');
    await page.evaluate((id) => chrome.tabs.setZoom(id, 1.25), tab.id);
    expect(await page.evaluate((id) => chrome.tabs.getZoom(id), tab.id)).toBe(1.25);
    await capture(page, info, 'browser-zoom-125');
    await page.evaluate((id) => chrome.tabs.setZoom(id, 1), tab.id);
    await page.setViewportSize(sizes[1]!);
    await savedResult(page, c, info);
    const unregistered = await context.newPage();
    await unregistered.setViewportSize(sizes[1]!);
    await unregistered.goto(`chrome-extension://${extensionId}${CAMERA_ROUTE}`);
    await expect(unregistered.getByRole('alert')).toBeVisible();
    for (const key of [
      'popup.video.pauseButton',
      'popup.video.stopButton',
      'popup.video.cancelButton',
    ] as const) {
      await expect(command(unregistered, c, key)).toBeDisabled();
    }
    await expect(command(unregistered, c, 'popup.video.activeMicrophoneUnmute')).toBeDisabled();
    await expect(unregistered.getByRole('timer')).toHaveText('00:00');
    await capture(unregistered, info, 'unregistered-route');
  });
});

for (const locale of ['en', 'ru'] as const) {
  test(`native Camera teleprompter ${locale} editing, reading and floating-window recovery`, async ({}, info) => {
    const c = { locale, theme: 'dark' } as const;
    await withBrowser(c, info, async (context, extensionId, origin) => {
      const page = await launchCamera(context, extensionId, origin, c);
      await page.setViewportSize({ width: 1280, height: 560 });
      await command(page, c, 'popup.video.teleprompterShow').click();
      const resize = page.getByRole('separator', {
        name: tr(c, 'popup.video.teleprompterResizeCamera'),
      });
      const cameraArea = page.locator('[data-ui="camera-recorder.preview-layout"]');
      await expect(resize).toBeVisible();
      const cameraBefore = (await cameraArea.boundingBox())!.height;
      await resize.focus();
      await resize.press('ArrowDown');
      await expect
        .poll(async () => (await cameraArea.boundingBox())!.height)
        .toBeGreaterThan(cameraBefore);
      const grip = (await resize.boundingBox())!;
      await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
      await page.mouse.down();
      await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2 + 32);
      await page.mouse.up();
      await expect
        .poll(async () => (await cameraArea.boundingBox())!.height)
        .toBeGreaterThan(cameraBefore + 8);
      await resize.dblclick();
      await expect
        .poll(async () => (await cameraArea.boundingBox())!.height)
        .toBeLessThanOrEqual(cameraBefore + 1);
      const script = Array.from(
        { length: 80 },
        (_, index) => `Line ${index + 1}: Read this script while the camera keeps recording.`
      ).join('\n');
      const editor = page.getByRole('textbox', { name: tr(c, 'popup.video.teleprompterScript') });
      await expect(command(page, c, 'popup.video.teleprompterRead')).toBeDisabled();
      await editor.fill(script);
      await command(page, c, 'popup.video.teleprompterRead').click();
      const reader = page.getByRole('region', {
        name: tr(c, 'popup.video.teleprompterScript'),
        exact: true,
      });
      await expect(reader).toHaveText(script);
      await command(page, c, 'popup.video.teleprompterSettings').click();
      const speed = page.getByRole('slider', { name: tr(c, 'popup.video.teleprompterSpeed') });
      await speed.focus();
      await speed.press('End');
      await expect(speed).toHaveValue('300');
      const font = page.getByRole('slider', { name: tr(c, 'popup.video.teleprompterFontSize') });
      await font.focus();
      await font.press('End');
      await expect(reader).toHaveCSS('font-size', '72px');
      await font.press('Home');
      await expect(reader).toHaveCSS('font-size', '20px');
      await page.keyboard.press('Escape');
      await expect(page.getByRole('slider')).toHaveCount(0);
      await scrollStart(page, c).click();
      await expect.poll(() => reader.evaluate((node) => node.scrollTop)).toBeGreaterThan(12);
      await command(page, c, 'popup.video.teleprompterPause').click();
      const stopped = await reader.evaluate((node) => node.scrollTop);
      await page.evaluate(async () => {
        for (let frame = 0; frame < 8; frame++) {
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        }
      });
      expect(await reader.evaluate((node) => node.scrollTop)).toBe(stopped);
      await command(page, c, 'popup.video.teleprompterReset').click();
      await expect.poll(() => reader.evaluate((node) => node.scrollTop)).toBe(0);
      await scrollStart(page, c).click();
      await expect.poll(() => reader.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
      await command(page, c, 'popup.video.pauseButton').click();
      await expect(scrollStart(page, c)).toBeDisabled();
      await expect(page.locator('[data-ui="camera-recorder.controls"] [role="status"]')).toHaveText(
        tr(c, 'popup.labels.statusPaused')
      );
      await command(page, c, 'popup.video.resumeButton').click();
      await expect(command(page, c, 'popup.video.teleprompterPause')).toBeEnabled();
      await command(page, c, 'popup.video.teleprompterPause').click();
      await expect(scrollStart(page, c)).toBeEnabled();
      await command(page, c, 'popup.video.teleprompterHide').click();
      await expect(reader).toBeHidden();
      await command(page, c, 'popup.video.teleprompterShow').click();
      await expect(reader).toHaveText(script);
      await command(page, c, 'popup.video.teleprompterEdit').click();
      await expect(editor).toHaveValue(script);
      await editor.fill(`${script}\nFinal line added after reading.`);
      await command(page, c, 'popup.video.teleprompterRead').click();
      await expect(reader).toContainText('Final line added after reading.');

      const controlInset = await page
        .locator('[data-ui="camera-recorder.controls"]')
        .evaluate((node) => {
          const style = getComputedStyle(node);
          return (
            innerWidth -
            (node.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight))
          );
        });
      const controlBreakpoint = Math.round(controlInset) + 600;
      const headerInset = await page
        .locator('.camera-teleprompter-header')
        .evaluate((node) => innerWidth - node.clientWidth);
      const headerBreakpoint = Math.round(headerInset) + 450;
      const captureSizes = [
        { width: 1280, height: 560 },
        { width: 1920, height: 900 },
        { width: 480, height: 640 },
        { width: 375, height: 640 },
        ...[
          controlBreakpoint - 1,
          controlBreakpoint,
          controlBreakpoint + 1,
          headerBreakpoint - 1,
          headerBreakpoint,
          headerBreakpoint + 1,
        ].map((width) => ({
          width,
          height: 560,
        })),
      ];
      for (const { size, theme, captureSettings } of [
        ...captureSizes.map((size) => ({
          size,
          theme: 'dark',
          captureSettings: [1280, 375].includes(size.width),
        })),
        ...captureSizes
          .filter((size) => [1280, 1920, 375].includes(size.width))
          .map((size) => ({
            size,
            theme: 'light',
            captureSettings: true,
          })),
      ]) {
        await page.evaluate(async (value) => {
          await chrome.storage.local.set({ 'sniptale-theme-preference': value });
          localStorage.setItem('sniptale-theme-preference', value);
        }, theme);
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        const suffix = theme === 'light' ? '-light' : '';
        await page.setViewportSize(size);
        await command(page, c, 'popup.video.teleprompterReset').click();
        await expect(reader).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true
        );
        for (const key of [
          'popup.video.teleprompterPlay',
          'popup.video.teleprompterReset',
          'popup.video.stopButton',
        ] as const) {
          const control = command(page, c, key);
          await control.scrollIntoViewIfNeeded();
          const box = await control.boundingBox();
          expect(box).not.toBeNull();
          expect(box!.x).toBeGreaterThanOrEqual(0);
          expect(box!.y).toBeGreaterThanOrEqual(0);
          expect(box!.x + box!.width).toBeLessThanOrEqual(size.width + 1);
          expect(box!.y + box!.height).toBeLessThanOrEqual(size.height + 1);
        }
        const scriptPanel = page
          .getByRole('heading', { name: tr(c, 'popup.video.teleprompterTitle'), exact: true })
          .locator('..')
          .locator('..');
        const scriptBox = await scriptPanel.boundingBox();
        const detailsBox = await page.locator('[data-ui="camera-recorder.controls"]').boundingBox();
        expect(scriptBox).not.toBeNull();
        expect(detailsBox).not.toBeNull();
        expect(detailsBox!.height).toBeLessThanOrEqual(64);
        const micBox = await command(page, c, 'popup.video.activeMicrophoneMute').boundingBox();
        const stopBox = await command(page, c, 'popup.video.stopButton').boundingBox();
        expect(Math.abs(micBox!.y - stopBox!.y)).toBeLessThanOrEqual(1);
        expect(scriptBox!.y + scriptBox!.height).toBeLessThanOrEqual(detailsBox!.y + 1);
        const playBounds = await scrollStart(page, c).boundingBox();
        expect(playBounds!.width).toBeLessThanOrEqual(180);
        await playbackLabel(page, c, 'popup.video.teleprompterPlay');
        await expect(page.getByRole('slider')).toHaveCount(0);
        await capture(page, info, `teleprompter${suffix}-${size.width}x${size.height}`);
        await command(page, c, 'popup.video.teleprompterSettings').click();
        const settingsSlider = page.getByRole('slider', {
          name: tr(c, 'popup.video.teleprompterSpeed'),
          exact: true,
        });
        await expect(settingsSlider).toBeVisible();
        await expect(settingsSlider).toHaveValue('300');
        const settingsBounds = await settingsSlider.boundingBox();
        expect(settingsBounds!.width).toBeLessThanOrEqual(280);
        expect(settingsBounds!.x).toBeGreaterThanOrEqual(0);
        expect(settingsBounds!.x + settingsBounds!.width).toBeLessThanOrEqual(size.width);
        if (captureSettings)
          await capture(page, info, `teleprompter-settings${suffix}-${size.width}x${size.height}`);
        await page.keyboard.press('Escape');
        await expect(page.getByRole('slider')).toHaveCount(0);
      }
      await page.evaluate(async () => {
        await chrome.storage.local.set({ 'sniptale-theme-preference': 'dark' });
        localStorage.setItem('sniptale-theme-preference', 'dark');
      });
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

      await page.setViewportSize({ width: 1280, height: 560 });
      const floating = command(page, c, 'popup.video.teleprompterFloat');
      if (await page.evaluate(() => 'documentPictureInPicture' in window)) {
        const [pip] = await Promise.all([context.waitForEvent('page'), floating.click()]);
        await pip.setViewportSize({ width: 480, height: 640 });
        const floatingReader = pip.getByRole('region', {
          name: tr(c, 'popup.video.teleprompterScript'),
          exact: true,
        });
        await expect(floatingReader).toContainText('Final line added after reading.');
        await command(pip, c, 'popup.video.teleprompterPlay').click();
        await expect
          .poll(() => floatingReader.evaluate((node) => node.scrollTop))
          .toBeGreaterThan(0);
        await playbackLabel(pip, c, 'popup.video.teleprompterPause');
        await command(pip, c, 'popup.video.teleprompterPause').click();
        await playbackLabel(pip, c, 'popup.video.teleprompterResume');
        await capture(pip, info, 'teleprompter-floating-480x640');
        await command(pip, c, 'popup.video.teleprompterSettings').click();
        await expect(pip.getByRole('slider')).toHaveCount(3);
        await capture(pip, info, 'teleprompter-floating-settings-480x640');
        await pip.keyboard.press('Escape');
        await expect(pip.getByRole('slider')).toHaveCount(0);
        await pip.close();
        await expect(reader).toContainText('Final line added after reading.');
        await expect(floating).toBeEnabled();
        await command(page, c, 'popup.video.teleprompterEdit').click();
        await expect(editor).toHaveValue(`${script}\nFinal line added after reading.`);
        await capture(page, info, 'teleprompter-restored-after-floating-close');
      } else {
        await expect(floating).toBeDisabled();
      }
      await savedResult(page, c, info);
    });
  });
}

test(
  'native Camera teleprompter automatic playback ' +
    'reuses the prepared script for each recording',
  async ({}, info) => {
    const c = { locale: 'en', theme: 'dark' } as const;
    await withBrowser(c, info, async (context, extensionId, origin) => {
      const script = Array.from(
        { length: 60 },
        (_, index) => `Prepared line ${index + 1}: Speak naturally while looking toward the camera.`
      ).join('\n');
      let preparedOrigin = 0;
      const page = await launchCamera(context, extensionId, origin, c, async (popup) => {
        const toggle = command(popup, c, 'popup.video.teleprompterLabel');
        await expect(toggle).toHaveAttribute('aria-pressed', 'false');
        await toggle.click();
        await expect
          .poll(() =>
            context.pages().some((candidate) => new URL(candidate.url()).pathname === CAMERA_ROUTE)
          )
          .toBe(true);
        const draft = context
          .pages()
          .find((candidate) => new URL(candidate.url()).pathname === CAMERA_ROUTE);
        if (!draft) throw new Error('Draft teleprompter did not open');
        await expect(command(draft, c, 'popup.video.stopButton')).toBeDisabled();
        await draft
          .getByRole('textbox', { name: tr(c, 'popup.video.teleprompterScript') })
          .fill(script);
        await command(draft, c, 'popup.video.teleprompterSettings').click();
        await draft
          .getByRole('button', {
            name: tr(c, 'popup.video.teleprompterWithRecording'),
            exact: true,
          })
          .click();
        await draft.keyboard.press('Escape');
        await command(draft, c, 'popup.video.teleprompterRead').click();
        await expect(
          draft.getByRole('region', { name: tr(c, 'popup.video.teleprompterScript'), exact: true })
        ).toBeVisible();
        await scrollStart(draft, c).click();
        await expect
          .poll(() =>
            draft
              .getByRole('region', { name: tr(c, 'popup.video.teleprompterScript'), exact: true })
              .evaluate((node) => node.scrollTop)
          )
          .toBeGreaterThan(12);
        preparedOrigin = await draft.evaluate(() => performance.timeOrigin);
      });
      expect(await page.evaluate(() => performance.timeOrigin)).toBe(preparedOrigin);
      const reader = page.getByRole('region', {
        name: tr(c, 'popup.video.teleprompterScript'),
        exact: true,
      });
      await expect(reader).toHaveText(script);
      await expect(command(page, c, 'popup.video.teleprompterPause')).toBeEnabled();
      await expect.poll(() => reader.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
      await command(page, c, 'popup.video.pauseButton').click();
      await expect(scrollStart(page, c)).toBeDisabled();
      await command(page, c, 'popup.video.resumeButton').click();
      await expect(command(page, c, 'popup.video.teleprompterPause')).toBeEnabled();
      await page.setViewportSize({ width: 1920, height: 900 });
      await scrollStart(page, c).click();
      await expect(command(page, c, 'popup.video.teleprompterPause')).toBeEnabled();
      await command(page, c, 'popup.video.teleprompterPause').click();
      await capture(page, info, 'automatic-layout-1920x900');
      const column = reader.locator('[data-teleprompter-column]');
      const columnBox = await column.boundingBox();
      const readerBox = await reader.boundingBox();
      expect(columnBox!.width).toBeLessThan(readerBox!.width * 0.8);
      await command(page, c, 'popup.video.teleprompterSettings').click();
      await page
        .getByRole('slider', { name: tr(c, 'popup.video.teleprompterColumnWidth') })
        .press('Home');
      await page.getByRole('switch', { name: tr(c, 'popup.video.teleprompterFadeEdges') }).click();
      await page.getByRole('switch', { name: tr(c, 'popup.video.teleprompterFocusGuide') }).click();
      await page.keyboard.press('Escape');
      await expect(reader.locator('..').locator('[data-teleprompter-fade]')).toHaveCount(0);
      await expect(reader.locator('..').locator('[data-teleprompter-guide]')).toHaveCount(1);
      await capture(page, info, 'manual-column-and-guide');
      await command(page, c, 'popup.video.teleprompterSettings').click();
      await command(page, c, 'popup.video.teleprompterResetLayout').click();
      await page.keyboard.press('Escape');
      await command(page, c, 'popup.video.pauseButton').click();
      await command(page, c, 'popup.video.teleprompterSettings').click();
      await expect(page.locator('[popover]')).toBeVisible();
      const externalPopup = await openRealPopup(context, extensionId);
      await command(externalPopup, c, 'popup.video.stopButton').click();
      await externalPopup.close();
      await expect(command(page, c, 'popup.video.postRecordClose')).toBeEnabled({
        timeout: 30_000,
      });
      await expect(page.locator('[popover]')).toHaveCount(0);
      await command(page, c, 'popup.video.postRecordNext').click();
      await expect(scrollStart(page, c)).toBeEnabled();
      await command(page, c, 'popup.video.teleprompterEdit').click();
      await expect(
        page.getByRole('textbox', { name: tr(c, 'popup.video.teleprompterScript') })
      ).toHaveValue(script);
      const second = await launchCamera(context, extensionId, origin, c, undefined, true);
      expect(second).toBe(page);
      expect(await second.evaluate(() => performance.timeOrigin)).toBe(preparedOrigin);
      await expect(reader).toHaveText(script);
      await expect(command(second, c, 'popup.video.teleprompterPause')).toBeEnabled();
      await expect.poll(() => reader.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
      expect(
        context.pages().filter((candidate) => new URL(candidate.url()).pathname === CAMERA_ROUTE)
      ).toHaveLength(1);
      await savedResult(second, c, info);
    });
  }
);

test('native TAB retains teleprompter across popup reopen and admits the prepared companion', async ({}, info) => {
  const c = { locale: 'en', theme: 'dark' } as const;
  await withBrowser(
    c,
    info,
    async (context, extensionId, origin) => {
      const target = await context.newPage();
      await target.setViewportSize({ width: 1280, height: 560 });
      await target.goto(`${origin}/fixtures/host-page.html`);
      let popup = await openRealPopup(context, extensionId);
      await popup.evaluate(
        async (settings) => {
          await chrome.storage.local.set({ sniptale_video_settings: settings });
        },
        {
          ...DEFAULT_VIDEO_SETTINGS,
          microphoneEnabled: false,
          webcamEnabled: false,
          systemAudioEnabled: false,
          warnWithoutMicrophone: false,
          countdownSeconds: 0,
        }
      );
      await popup.reload();
      await popup.locator('[data-ui="popup.app.tabs"] button[data-page="video"]').click();
      await expect(command(popup, c, 'popup.video.modeTabLabel')).toHaveAttribute(
        'aria-pressed',
        'true'
      );
      const toggle = command(popup, c, 'popup.video.teleprompterLabel');
      await expect(toggle).toHaveAttribute('aria-pressed', 'false');
      await toggle.click();
      await expect
        .poll(() => context.pages().some((page) => new URL(page.url()).pathname === CAMERA_ROUTE))
        .toBe(true);
      const companion = context
        .pages()
        .find((page) => new URL(page.url()).pathname === CAMERA_ROUTE);
      if (!companion) throw new Error('TAB teleprompter draft did not open');
      const editor = companion.getByRole('textbox', {
        name: tr(c, 'popup.video.teleprompterScript'),
      });
      const script = 'A prepared script for a silent tab recording.';
      await editor.fill(script);
      const timeOrigin = await companion.evaluate(() => performance.timeOrigin);
      await expect(command(companion, c, 'popup.video.stopButton')).toBeDisabled();
      await expect
        .poll(() =>
          popup.evaluate(
            async () =>
              (await chrome.storage.local.get('sniptale_video_settings')).sniptale_video_settings
                ?.teleprompterEnabled
          )
        )
        .toBe(true);
      await popup.close();
      popup = await openRealPopup(context, extensionId);
      await popup.locator('[data-ui="popup.app.tabs"] button[data-page="video"]').click();
      await expect(command(popup, c, 'popup.video.teleprompterLabel')).toHaveAttribute(
        'aria-pressed',
        'true'
      );
      await expect(command(popup, c, 'popup.video.modeTabLabel')).toHaveAttribute(
        'aria-pressed',
        'true'
      );
      await popup.close();
      await target.bringToFront();
      const action = await triggerExtensionAction(context, extensionId, target);
      await expect
        .poll(() =>
          evaluateInTarget(
            context,
            action,
            `Boolean(document.querySelector('[data-ui="popup.video.teleprompter-toggle"][aria-pressed="true"]'))`
          )
        )
        .toBe(true);
      await clickNativeStart(context, action);
      await expect(command(companion, c, 'popup.video.pauseButton')).toBeEnabled();
      await expect(command(companion, c, 'popup.video.stopButton')).toBeEnabled();
      await expect(companion.getByRole('status')).toHaveText(tr(c, 'popup.labels.statusRecording'));
      expect(await companion.evaluate(() => performance.timeOrigin)).toBe(timeOrigin);
      expect(await companion.evaluate(() => location.search + location.hash)).toBe('');
      expect(
        context.pages().filter((page) => new URL(page.url()).pathname === CAMERA_ROUTE)
      ).toHaveLength(1);
      await expect(editor).toHaveValue(script);
      await expect(companion.locator('video')).toHaveCount(0);
      await command(companion, c, 'popup.video.pauseButton').click();
      await expect(command(companion, c, 'popup.video.resumeButton')).toBeEnabled();
      await command(companion, c, 'popup.video.resumeButton').click();
      await expect(command(companion, c, 'popup.video.pauseButton')).toBeEnabled();
      await capture(companion, info, 'tab-teleprompter-retained-and-admitted');
      await savedResult(companion, c, info);
    },
    { fakeMediaDevices: false }
  );
});
