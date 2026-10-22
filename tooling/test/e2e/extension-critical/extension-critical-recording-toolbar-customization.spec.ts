import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import { VideoResolutionPreset } from '@sniptale/runtime-contracts/video/types/types';
import { RECORDING_TOOLBAR_CONTROLS } from '../../../../apps/extension/src/contracts/settings';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { closeExtensionBrowser, launchExtensionBrowser } from '../support/extension-browser-launch';
import { startHostServer } from '../support/host-server';
import {
  evaluateInTarget,
  sendRuntimeMessage,
  triggerExtensionAction,
} from '../support/recording-action';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { openDesignReview } from './extension-critical-page-toolbar.helpers';
import { parseRuntimeResponseForMessage } from '../../../../apps/extension/src/contracts/messaging/parsers/boundary';

test.setTimeout(120000);
test.use({ actionTimeout: 10000 });

async function openRecordingToolbarSettings(page: Page) {
  const trigger = page.locator('[data-ui="content.toolbar.settings-button"]');
  if ((await trigger.getAttribute('aria-expanded')) !== 'true') await trigger.click();
}

async function expectCursorSettings(page: Page, popup: Page, info: TestInfo) {
  const trigger = page.locator('[data-ui="content.toolbar.video-recording.cursor-settings"]');
  const panel = page.locator('[data-ui="content.toolbar.video-recording.cursor-panel"]');
  const open = async () => {
    if (!(await panel.isVisible())) await trigger.click();
    await expect(panel).toBeVisible();
  };
  const quick = page.locator('[data-ui="content.toolbar.video-recording.spotlight"]');
  await quick.click();
  await expect(
    page.locator('[data-ui="content.toolbar.video-recording.spotlight-halo"]')
  ).toBeVisible();
  await expect(panel).toHaveCount(0);
  const cursorChevron = (await trigger.boundingBox())!;
  const mediaChevron = (await page
    .locator('[data-ui="content.toolbar.video-recording.camera.menu"]')
    .boundingBox())!;
  expect(cursorChevron.width).toBeCloseTo(mediaChevron.width, 1);
  expect(cursorChevron.height).toBeCloseTo(mediaChevron.height, 1);
  await open();
  await expect(panel.locator('nav button')).toHaveCount(4);
  expect(
    await popup.evaluate(async () => {
      const stored = await chrome.storage.local.get('sniptale_video_settings');
      return stored.sniptale_video_settings.recordingSurface?.cursorEffects ?? null;
    })
  ).toBeNull();
  await expect(page.locator('[data-ui="content.toolbar.video-recording.start"]')).toBeVisible();
  expect(await trigger.evaluate((button) => button.matches(':focus-visible'))).toBe(false);
  const viewport = page.viewportSize()!;
  const bounds = (await panel.boundingBox())!;
  expect(bounds.width).toBeGreaterThanOrEqual(380);
  expect(bounds.x).toBeGreaterThanOrEqual(-1);
  expect(bounds.y).toBeGreaterThanOrEqual(-1);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height + 1);
  const rows = await panel.locator('.sniptale-parameter-row').evaluateAll((elements) =>
    elements.map((element) => {
      const label = element.firstElementChild!.getBoundingClientRect();
      const control = element
        .querySelector<HTMLElement>(
          'input[type="text"], button[role="switch"], [data-ui="shared.ui.color-selector.value-trigger"]'
        )!
        .getBoundingClientRect();
      return {
        centerDifference: Math.abs(label.y + label.height / 2 - control.y - control.height / 2),
        height: element.getBoundingClientRect().height,
      };
    })
  );
  expect(rows).toHaveLength(4);
  for (const row of rows) {
    expect(row.centerDifference).toBeLessThanOrEqual(1);
    expect(row.height).toBeCloseTo(40, 0);
  }
  const categories = panel.locator('nav button');
  const iconAlignment = await categories.evaluateAll((buttons) =>
    buttons.map((button) => {
      const bounds = button.getBoundingClientRect();
      const icon = button.querySelector('svg')!.getBoundingClientRect();
      const nav = button.closest('nav')!.getBoundingClientRect();
      return {
        horizontal: Math.abs(bounds.x + bounds.width / 2 - icon.x - icon.width / 2),
        vertical: Math.abs(bounds.y + bounds.height / 2 - icon.y - icon.height / 2),
        insets: Math.abs(bounds.x - nav.x - (nav.right - bounds.right)),
      };
    })
  );
  for (const icon of iconAlignment) {
    expect(icon.horizontal).toBeLessThanOrEqual(1);
    expect(icon.vertical).toBeLessThanOrEqual(1);
    expect(icon.insets).toBeLessThanOrEqual(1);
  }
  const closeAlignment = await panel
    .locator('[data-settings-action="close"]')
    .evaluate((button) => {
      const bounds = button.getBoundingClientRect();
      const icon = button.querySelector('svg')!.getBoundingClientRect();
      return {
        horizontal: Math.abs(bounds.x + bounds.width / 2 - icon.x - icon.width / 2),
        vertical: Math.abs(bounds.y + bounds.height / 2 - icon.y - icon.height / 2),
      };
    });
  expect(closeAlignment.horizontal).toBeLessThanOrEqual(1);
  expect(closeAlignment.vertical).toBeLessThanOrEqual(1);
  await categories.first().focus();
  await page.keyboard.press('ArrowDown');
  await expect(panel).toHaveAttribute('data-focus-modality', 'keyboard');
  await expect(categories.nth(1)).toBeFocused();
  await expect(categories.nth(1)).toHaveCSS('outline-width', '1px');
  await categories.first().click();
  await expect(panel).toHaveAttribute('data-focus-modality', 'pointer');
  await expect(categories.first()).toHaveCSS('outline-style', 'none');
  await expect(categories.first()).toHaveCSS('box-shadow', 'none');
  const choices = [
    {
      section: 0,
      fields: ['haloSize', 'haloOpacity'],
      values: ['66', '70'],
      colorKey: 'haloColor',
      color: '#2563eb',
    },
    {
      section: 1,
      fields: ['dimmingRadius', 'dimmingOpacity'],
      values: ['90', '45'],
      colorKey: 'dimmingColor',
      color: '#112233',
    },
    {
      section: 2,
      fields: ['clickSize', 'clickDuration'],
      values: ['60', '0.65'],
      colorKey: 'clickColor',
      color: '#ef4444',
    },
  ] as const;
  for (const choice of choices) {
    await open();
    await panel.locator('nav button').nth(choice.section).click();
    const colorField = panel.locator('[data-ui="shared.ui.compact-inspector.color-field"]');
    if (choice.section === 0) {
      const accent = await panel.evaluate((element) =>
        getComputedStyle(element).getPropertyValue('--sniptale-color-accent').trim().toUpperCase()
      );
      await expect(
        colorField.locator('[data-ui="shared.ui.color-selector.value-trigger"]')
      ).toHaveAttribute('title', accent);
      await colorField.locator('[data-ui="shared.ui.color-selector.picker-trigger"]').click();
      const picker = page.locator('[data-ui="shared.ui.color-selector.picker-layer"]');
      await expect(picker).toBeVisible();
      await picker.getByRole('textbox', { name: 'HEX', exact: true }).fill('#abcdef');
      const pickerBounds = (await picker.boundingBox())!;
      expect(pickerBounds.x).toBeGreaterThanOrEqual(-1);
      expect(pickerBounds.y).toBeGreaterThanOrEqual(-1);
      expect(pickerBounds.x + pickerBounds.width).toBeLessThanOrEqual(viewport.width + 1);
      expect(pickerBounds.y + pickerBounds.height).toBeLessThanOrEqual(viewport.height + 1);
      const panelBounds = (await panel.boundingBox())!;
      const hasSideRoom =
        Math.max(panelBounds.x, viewport.width - panelBounds.x - panelBounds.width) >=
        pickerBounds.width + 16;
      if (hasSideRoom)
        expect(
          pickerBounds.x >= panelBounds.x + panelBounds.width + 7 ||
            pickerBounds.x + pickerBounds.width <= panelBounds.x - 7
        ).toBe(true);
      await page.screenshot({ path: info.outputPath('cursor-color-picker.png'), fullPage: false });
      await page.keyboard.press('Escape');
      await expect(picker).toHaveCount(0);
      await expect(panel).toBeVisible();
      await expect(
        colorField.locator('[data-ui="shared.ui.color-selector.value-trigger"]')
      ).toHaveAttribute('title', accent);
      await colorField.locator('[data-ui="shared.ui.color-selector.picker-trigger"]').click();
      await picker.getByRole('textbox', { name: 'HEX', exact: true }).fill(choice.color);
      await picker.getByRole('button', { name: /^(Apply|Применить)$/u }).click();
    } else {
      await colorField.locator('[data-ui="shared.ui.color-selector.value-trigger"]').click();
      await page.screenshot({ path: info.outputPath('cursor-inline-color.png'), fullPage: false });
      const colorInput = colorField.getByRole('textbox');
      await colorInput.fill(choice.color);
      await colorInput.press('Enter');
    }
    await expect
      .poll(() =>
        popup.evaluate(async (key) => {
          const stored = await chrome.storage.local.get('sniptale_video_settings');
          return stored.sniptale_video_settings.recordingSurface.cursorEffects?.[key];
        }, choice.colorKey)
      )
      .toBe(choice.color);
    await open();
    await panel.locator('nav button').nth(choice.section).click();
    await expect(panel.locator('nav button').nth(choice.section)).toHaveCSS(
      'outline-style',
      'none'
    );
    const toggle = panel.getByRole('switch');
    if ((await toggle.getAttribute('aria-checked')) !== 'true') await toggle.click();
    for (const [index, field] of choice.fields.entries()) {
      await open();
      await panel.locator('nav button').nth(choice.section).click();
      const input = panel.locator('input[type="text"]').nth(index);
      await input.fill(choice.values[index]!);
      await input.press('Enter');
      const expected = Number(choice.values[index]) * (field === 'clickDuration' ? 1000 : 1);
      await expect
        .poll(() =>
          popup.evaluate(async (key) => {
            const stored = await chrome.storage.local.get('sniptale_video_settings');
            return stored.sniptale_video_settings.recordingSurface.cursorEffects?.[key];
          }, field)
        )
        .toBe(expected);
    }
    await open();
    await panel.locator('nav button').nth(choice.section).click();
    await page.screenshot({
      path: info.outputPath(`cursor-settings-${choice.section}.png`),
      fullPage: false,
    });
  }
  await panel.locator('nav button').nth(3).click();
  await expect(
    panel.locator('[data-ui="content.toolbar.video-recording.native-cursor"]')
  ).toBeVisible();
  await expect(panel.locator('input')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.mouse.move(viewport.width - 80, viewport.height - 80);
  const halo = page.locator('[data-ui="content.video-recording.spotlight-halo"]');
  await expect(halo).toHaveCSS('width', '66px');
  await expect(halo).toHaveCSS('opacity', '0.7');
  await expect(halo).toHaveCSS('border-top-color', 'rgb(37, 99, 235)');
  const dimming = page.locator('[data-ui="content.video-recording.spotlight-dimming"]');
  await expect(dimming).toHaveCSS('opacity', '0.45');
  await expect(dimming).toHaveCSS('background-color', 'rgb(17, 34, 51)');
  await expect(dimming).toHaveCSS('mask-image', /(?:circle )?90px at/u);
  await page.getByRole('button', { name: 'Host action', exact: true }).click();
  const ripple = page.locator('[data-ui="content.video-recording.spotlight-click"]');
  await expect(ripple).toHaveCSS('width', '60px');
  await expect(ripple).toHaveCSS('animation-duration', '0.65s');
  await expect(ripple).toHaveCSS('border-top-color', 'rgb(239, 68, 68)');
  await open();
  await expect(panel.locator('input[type="text"]').first()).toHaveValue('66');
  await page.keyboard.press('Escape');
}

async function expectAutomaticRecordingFade(page: Page, info: TestInfo) {
  const toolbar = page.locator('[data-ui="content.toolbar.root"]');
  const opacity = () => toolbar.evaluate((element) => Number(getComputedStyle(element).opacity));
  await expect(toolbar).toHaveAttribute('data-recording-fade', 'true');
  await toolbar.hover();
  await expect.poll(opacity).toBe(1);
  const before = (await toolbar.boundingBox())!;
  const viewport = page.viewportSize()!;
  await page.mouse.move(viewport.width - 4, viewport.height - 4);
  await expect.poll(opacity).toBeCloseTo(0.2, 2);
  await expect(toolbar).toHaveCSS('transition-property', 'opacity');
  await expect(toolbar).toHaveCSS('transition-duration', '0.25s');
  const after = (await toolbar.boundingBox())!;
  for (const dimension of ['x', 'y', 'width', 'height'] as const) {
    expect(Math.abs(after[dimension] - before[dimension])).toBeLessThanOrEqual(1);
  }
  await page.screenshot({ path: info.outputPath('faded-recording-controls.png'), fullPage: false });
  await page.locator('[data-ui="content.toolbar.video-recording.navigation"]').focus();
  await page.keyboard.press('Tab');
  expect(await toolbar.evaluate((element) => element.matches(':focus-within'))).toBe(true);
  await expect.poll(opacity).toBe(1);
  await page.getByRole('button', { name: 'Host action', exact: true }).click();
  await expect.poll(opacity).toBeCloseTo(0.2, 2);
  await page.locator('[data-ui="content.toolbar.video-recording.spotlight"]').click();
  await page.locator('[data-ui="content.toolbar.video-recording.spotlight-halo"]').hover();
  await expect(toolbar).toHaveAttribute('data-menu-open', 'true');
  await expect.poll(opacity).toBe(1);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Host action', exact: true }).click();
  await expect.poll(opacity).toBeCloseTo(0.2, 2);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(toolbar).toHaveCSS('transition-property', 'none');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const grip = (await toolbar.locator('.sniptale-drag-handle').boundingBox())!;
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(grip.x + grip.width / 2 + 16, grip.y + grip.height / 2 + 16, { steps: 3 });
  await expect(toolbar).toHaveClass(/sniptale-toolbar-dragging/u);
  await expect.poll(opacity).toBe(1);
  await page.mouse.up();
  await toolbar.hover();
  await expect.poll(opacity).toBe(1);
}

async function expectRecordingControlOrder(
  page: Page,
  orientation: 'horizontal' | 'vertical',
  phase: 'idle' | 'recording' | 'paused',
  compact = false
) {
  const recordingPrefix = 'content.toolbar.video-recording.';
  const tools = ['select', 'pencil', 'marker', 'text', 'shape', 'arrow', 'blur'].map(
    (tool) => `content.toolbar.drawing.${tool}`
  );
  const lifecycle =
    phase === 'idle' ? ['start'] : [phase === 'paused' ? 'resume' : 'pause', 'stop'];
  const expected = [
    ...(phase === 'idle'
      ? [
          'content.toolbar.mode-selector-button',
          'content.toolbar.settings-button',
          `${recordingPrefix}customize`,
        ]
      : []),
    `${recordingPrefix}navigation`,
    ...(!compact
      ? [
          ...tools,
          ...(phase === 'idle' ? [`${recordingPrefix}auto-hide`] : []),
          ...[
            'eraser',
            'clear',
            'spotlight',
            'cursor-settings',
            'microphone.toggle',
            'microphone.menu',
            'camera.toggle',
            'camera.menu',
          ].map((control) => `${recordingPrefix}${control}`),
        ]
      : []),
    ...lifecycle.map((control) => `${recordingPrefix}${control}`),
  ];
  const toolbar = page.locator('[data-ui="content.toolbar.root"]');
  await expect
    .poll(() =>
      toolbar
        .locator('button[data-ui]')
        .evaluateAll((buttons) => buttons.map((button) => button.getAttribute('data-ui')))
    )
    .toEqual(expected);
  const landmarks = compact
    ? [`${recordingPrefix}navigation`, `${recordingPrefix}lifecycle`]
    : [
        `${recordingPrefix}navigation`,
        'content.toolbar.drawing.blur',
        `${recordingPrefix}spotlight`,
        `${recordingPrefix}camera.toggle`,
        `${recordingPrefix}lifecycle`,
      ];
  const boxes = [];
  for (const landmark of landmarks) {
    const bounds = await toolbar.locator(`[data-ui="${landmark}"]`).boundingBox();
    expect(bounds).not.toBeNull();
    boxes.push(bounds!);
  }
  for (let index = 1; index < boxes.length; index += 1) {
    const previous = boxes[index - 1]!;
    const current = boxes[index]!;
    expect(
      orientation === 'vertical' ? previous.y + previous.height : previous.x + previous.width
    ).toBeLessThanOrEqual((orientation === 'vertical' ? current.y : current.x) + 1);
  }
}

for (const { name, size } of [
  ...PRIMARY_BROWSER_VIEWPORTS,
  { name: '960x560', size: { width: 960, height: 560 } },
]) {
  for (const orientation of ['horizontal', 'vertical'] as const) {
    if (size.width < 1280 && orientation === 'vertical') continue;
    test(`recording controls customization ${name} ${orientation}`, async ({}, info) => {
      const host = await startHostServer();
      const launched = await launchExtensionBrowser({ viewport: size });
      const diagnostics: string[] = [];
      launched.context.on('console', (message) => {
        if (message.type() === 'warning' || message.type() === 'error') {
          diagnostics.push(message.text().slice(0, 2000));
        }
      });
      try {
        const { page, popup } = await openDesignReview(
          launched.context,
          launched.extensionId,
          host.origin,
          size
        );
        await popup.evaluate(
          async ({ defaults, dark }) => {
            await chrome.storage.local.set({
              sniptale_video_settings: {
                ...defaults,
                microphoneEnabled: false,
                webcamEnabled: false,
                systemAudioEnabled: false,
                warnWithoutMicrophone: false,
                countdownSeconds: 0,
                qualityProfileId: null,
                outputProfile: defaults.outputProfile,
              },
              'sniptale-theme-preference': dark ? 'dark' : 'light',
              'sniptale-locale-preference': dark ? 'ru' : 'en',
            });
          },
          {
            defaults: {
              ...DEFAULT_VIDEO_SETTINGS,
              outputProfile: {
                ...DEFAULT_VIDEO_SETTINGS.outputProfile,
                resolution: VideoResolutionPreset.P240,
              },
            },
            dark: size.width === 1920,
          }
        );
        await page.locator('[data-ui="content.toolbar.mode-selector-button"]').click();
        await page.locator('[data-ui="content.toolbar.mode-option.video-recording"]').click();
        const action = await triggerExtensionAction(launched.context, launched.extensionId, page);
        await evaluateInTarget(launched.context, action, 'window.close()').catch(() => undefined);
        await page.bringToFront();
        const toolbar = page.locator('[data-ui="content.toolbar.root"]');
        await page.locator('[data-ui="content.toolbar.settings-button"]').click();
        if (
          !(await page.getByRole('button', { name: /Vertical view|Вертикальный вид/u }).isVisible())
        ) {
          await page
            .getByRole('button', { name: /Free toolbar placement|Свободное размещение/u })
            .click();
        }
        await page
          .getByRole('button', {
            name:
              orientation === 'vertical'
                ? /Vertical view|Вертикальный вид/u
                : /Horizontal view|Горизонтальный вид/u,
          })
          .click();
        await page.keyboard.press('Escape');
        await expect(toolbar).toHaveAttribute('data-display-mode', orientation);
        await expectRecordingControlOrder(page, orientation, 'idle');
        await expectCursorSettings(page, popup, info);
        const bounds = await toolbar.boundingBox();
        expect(bounds).not.toBeNull();
        expect(bounds!.x).toBeGreaterThanOrEqual(-1);
        expect(bounds!.y).toBeGreaterThanOrEqual(-1);
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(size.width + 1);
        expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(size.height + 1);
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
        ).toBe(true);
        const customize = page.locator('[data-ui="content.toolbar.video-recording.customize"]');
        await expect(customize).toBeEnabled();
        const fadeSetting = page.locator('[data-ui="content.toolbar.settings.recording-fade"]');
        await page.locator('[data-ui="content.toolbar.settings-button"]').click();
        await expect(fadeSetting).toHaveAttribute('aria-pressed', 'true');
        await page.screenshot({
          path: info.outputPath('recording-fade-setting.png'),
          fullPage: false,
        });
        await page.keyboard.press('Escape');
        await page.locator('[data-ui="content.toolbar.video-recording.start"]').click();
        await expect(page.locator('[data-ui="content.toolbar.video-recording.pause"]')).toBeVisible(
          { timeout: 30000 }
        );
        await expectRecordingControlOrder(page, orientation, 'recording');
        await expectAutomaticRecordingFade(page, info);
        await page.screenshot({
          path: info.outputPath('full-recording-controls.png'),
          fullPage: false,
        });
        await page.locator('[data-ui="content.toolbar.video-recording.pause"]').click();
        await expectRecordingControlOrder(page, orientation, 'paused');
        await page.mouse.move(size.width - 4, size.height - 4);
        await expect(toolbar).toHaveCSS('opacity', '1');
        await page.locator('[data-ui="content.toolbar.video-recording.resume"]').click();
        await expectRecordingControlOrder(page, orientation, 'recording');
        await page.locator('[data-ui="content.toolbar.video-recording.stop"]').click();
        await expect(page.locator('[data-ui="content.toolbar.video-recording.start"]')).toBeVisible(
          { timeout: 30000 }
        );
        await expectRecordingControlOrder(page, orientation, 'idle');
        const readResult = async () =>
          parseRuntimeResponseForMessage(
            VideoMessageType.GET_RECORDING_STATE,
            await sendRuntimeMessage(popup, { type: VideoMessageType.GET_RECORDING_STATE })
          );
        await expect
          .poll(async () => (await readResult()).postRecordResult?.recordingId ?? null)
          .not.toBeNull();
        const previousResult = (await readResult()).postRecordResult;
        if (!previousResult) throw new Error('Saved recording result is unavailable');
        expect(
          parseRuntimeResponseForMessage(
            VideoMessageType.ACKNOWLEDGE_POST_RECORD_RESULT,
            await sendRuntimeMessage(popup, {
              type: VideoMessageType.ACKNOWLEDGE_POST_RECORD_RESULT,
              recordingId: previousResult.recordingId,
            })
          )
        ).toMatchObject({ success: true, result: 'acknowledged' });
        await page.locator('[data-ui="content.toolbar.settings-button"]').click();
        await fadeSetting.click();
        await expect
          .poll(() =>
            popup.evaluate(
              async () =>
                (await chrome.storage.sync.get('sniptale_settings'))['sniptale_settings']
                  .contentToolbar.fadeDuringRecording
            )
          )
          .toBe(false);
        await openRecordingToolbarSettings(page);
        await expect(fadeSetting).toHaveAttribute('aria-pressed', 'false');
        await page.keyboard.press('Escape');
        await customize.click();
        await expect(customize).toHaveAttribute('aria-pressed', 'true');
        await expect(
          page.locator('[data-ui="content.toolbar.mode-selector-button"]')
        ).toBeDisabled();
        for (const control of RECORDING_TOOLBAR_CONTROLS) {
          const toggle = page.locator(
            `[data-ui="content.toolbar.video-recording.visibility.${control}"]`
          );
          await expect(toggle).toHaveAttribute('aria-pressed', 'true');
          await toggle.click();
          await expect(toggle).toHaveAttribute('aria-pressed', 'false');
          expect(await toggle.evaluate((button) => button.matches(':focus-visible'))).toBe(false);
        }
        await page.evaluate(async () => document.fonts.ready);
        await page.screenshot({
          path: info.outputPath('customizing-controls.png'),
          fullPage: false,
        });
        await customize.click();
        await expect(page.locator('[data-ui="content.toolbar.drawing.pencil"]')).toBeVisible();
        await expect(
          page.locator('[data-ui="content.toolbar.video-recording.camera.toggle"]')
        ).toBeVisible();
        const saved = await popup.evaluate(async () => {
          const stored = await chrome.storage.sync.get('sniptale_settings');
          return stored['sniptale_settings'].contentToolbar.recordingControls;
        });
        expect(saved).toEqual(
          Object.fromEntries(RECORDING_TOOLBAR_CONTROLS.map((control) => [control, false]))
        );
        await page.locator('[data-ui="content.toolbar.video-recording.start"]').click();
        const pause = page.locator('[data-ui="content.toolbar.video-recording.pause"]');
        try {
          await expect(pause).toBeVisible({ timeout: 30000 });
        } catch (error) {
          await info.attach('recording-start-diagnostics', {
            body: JSON.stringify(
              {
                state: await sendRuntimeMessage(popup, {
                  type: VideoMessageType.GET_RECORDING_STATE,
                }),
                diagnostics,
              },
              null,
              2
            ),
            contentType: 'application/json',
          });
          throw error;
        }
        await expect(customize).toHaveCount(0);
        await expectRecordingControlOrder(page, orientation, 'recording', true);
        await page.mouse.move(size.width - 4, size.height - 4);
        await expect(toolbar).toHaveCSS('opacity', '1');
        expect(await toolbar.getAttribute('data-recording-fade')).toBeNull();
        await expect(page.locator('[data-ui="content.toolbar.mode-selector-button"]')).toHaveCount(
          0
        );
        await expect(page.locator('[data-ui="content.toolbar.settings-button"]')).toHaveCount(0);
        await expect(page.locator('[data-ui="content.toolbar.drawing.pencil"]')).toHaveCount(0);
        await expect(
          page.locator('[data-ui="content.toolbar.video-recording.microphone.toggle"]')
        ).toHaveCount(0);
        await expect(
          page.locator('[data-ui="content.toolbar.video-recording.camera.toggle"]')
        ).toHaveCount(0);
        await expect(
          page.locator('[data-ui="content.toolbar.video-recording.auto-hide"]')
        ).toHaveCount(0);
        await expect(
          page.locator('[data-ui="content.toolbar.video-recording.navigation"]')
        ).toBeVisible();
        await page.screenshot({
          path: info.outputPath('compact-recording-controls.png'),
          fullPage: false,
        });
        await pause.click();
        const resume = page.locator('[data-ui="content.toolbar.video-recording.resume"]');
        await expect(resume).toBeVisible();
        await expectRecordingControlOrder(page, orientation, 'paused', true);
        await resume.click();
        await expect(pause).toBeVisible();
        await page.locator('[data-ui="content.toolbar.video-recording.stop"]').click();
        await expect(page.locator('[data-ui="content.toolbar.video-recording.start"]')).toBeVisible(
          { timeout: 30000 }
        );
        await expect(customize).toBeVisible();
        await expectRecordingControlOrder(page, orientation, 'idle');
        await expect(page.locator('[data-ui="content.toolbar.drawing.pencil"]')).toBeVisible();
        await expect(page.locator('[data-ui="content.toolbar.settings-button"]')).toBeVisible();
        await page.screenshot({
          path: info.outputPath('restored-idle-controls.png'),
          fullPage: false,
        });
        await page.locator('[data-ui="content.toolbar.mode-selector-button"]').click();
        await page.locator('[data-ui="content.toolbar.mode-option.drawing"]').click();
        await page.locator('[data-ui="content.toolbar.mode-selector-button"]').click();
        await page.locator('[data-ui="content.toolbar.mode-option.video-recording"]').click();
        await expect(customize).toBeEnabled();
        await customize.click();
        await expect(
          page.locator('[data-ui="content.toolbar.video-recording.visibility.pencil"]')
        ).toHaveAttribute('aria-pressed', 'false');
        const text = page.locator('[data-ui="content.toolbar.video-recording.visibility.text"]');
        await text.focus();
        await page.keyboard.press('Enter');
        await expect(text).toHaveAttribute('aria-pressed', 'true');
        await customize.click();
        await page.locator('[data-ui="content.toolbar.settings-button"]').click();
        await expect(fadeSetting).toHaveAttribute('aria-pressed', 'false');
        await fadeSetting.focus();
        await page.keyboard.press('Enter');
        await expect
          .poll(() =>
            popup.evaluate(
              async () =>
                (await chrome.storage.sync.get('sniptale_settings'))['sniptale_settings']
                  .contentToolbar.fadeDuringRecording
            )
          )
          .toBe(true);
        await openRecordingToolbarSettings(page);
        await expect(fadeSetting).toHaveAttribute('aria-pressed', 'true');
        await fadeSetting.focus();
        await page.keyboard.press('Space');
        await expect
          .poll(() =>
            popup.evaluate(
              async () =>
                (await chrome.storage.sync.get('sniptale_settings'))['sniptale_settings']
                  .contentToolbar.fadeDuringRecording
            )
          )
          .toBe(false);
        await openRecordingToolbarSettings(page);
        await expect(fadeSetting).toHaveAttribute('aria-pressed', 'false');
        await page.keyboard.press('Escape');
        const media = await popup.evaluate(
          async () =>
            (await chrome.storage.local.get('sniptale_video_settings'))['sniptale_video_settings']
        );
        expect(media.microphoneEnabled).toBe(false);
        expect(media.webcamEnabled).toBe(false);
      } finally {
        await closeExtensionBrowser(launched);
        await new Promise<void>((resolve, reject) =>
          host.server.close((error) => (error ? reject(error) : resolve()))
        );
      }
    });
  }
}
