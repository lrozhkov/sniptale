import { expect, test, type Locator, type Page } from '@playwright/test';
import { launchExtensionBrowser, closeExtensionBrowser } from '../support/extension-browser-launch';
import { seedReviewVideo } from '../support/quick-editor-media-fixture';
import { translate } from '../../../../apps/extension/src/platform/i18n';

const label = (key: Parameters<typeof translate>[0]) => translate(key, 'ru');
const gallery = '/apps/extension/src/gallery/index.html';

async function openReview(page: Page, extensionId: string, theme: 'light' | 'dark') {
  await page.goto(`chrome-extension://${extensionId}${gallery}`);
  await expect(page.locator('[data-ui="gallery.page.root"]')).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        async () =>
          (await chrome.storage.local.get('sniptale-locale-preference'))[
            'sniptale-locale-preference'
          ]
      )
    )
    .toMatch(/^(ru|en)$/);
  await page.evaluate(async (theme) => {
    localStorage.setItem('sniptale-locale-preference', 'ru');
    await chrome.storage.local.set({
      'sniptale-locale-preference': 'ru',
      'sniptale-theme-preference': theme,
    });
  }, theme);
  await seedReviewVideo(
    page,
    'review-vp8-opus.webm',
    { width: 160, height: 90, duration: 12 },
    false,
    true
  );
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
  await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
  await page.locator('[data-ui="gallery.videoReview.enter"]').click();
  const review = page.locator('[data-ui="gallery.videoReview.dialog"]');
  const mode = review.getByRole('button', {
    name: label('gallery.videoReview.advancedEditing'),
    exact: true,
  });
  if ((await mode.getAttribute('aria-pressed')) !== 'true') await mode.click();
  await page.evaluate(() => document.fonts.ready);
  return review;
}

async function range(page: Page, lane: Locator, start: number, end: number) {
  await lane.scrollIntoViewIfNeeded();
  const box = (await lane.boundingBox())!;
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width * start, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * end, y, { steps: 5 });
  await page.mouse.up();
}

for (const size of [
  { width: 1280, height: 560 },
  { width: 1920, height: 900 },
])
  for (const theme of ['light', 'dark'] as const) {
    test(`native video control geometry ${size.width} ${theme}`, async ({}, info) => {
      test.setTimeout(90_000);
      const launched = await launchExtensionBrowser({ viewport: size });
      const page = await launched.context.newPage();
      page.setDefaultTimeout(10_000);
      try {
        const review = await openReview(page, launched.extensionId, theme);
        const command = (key: Parameters<typeof translate>[0]) =>
          review.getByRole('button', { name: label(key), exact: true });
        const fit = command('gallery.videoReview.fit');
        await expect(fit).toHaveAttribute('title', label('gallery.videoReview.fit'));
        await expect(fit.locator('[data-review-toolbar-label]')).toHaveCount(0);
        await command('gallery.videoReview.speedMode').hover();
        await expect(command('gallery.videoReview.speedMode')).toHaveCSS(
          'border-top-color',
          'rgba(0, 0, 0, 0)'
        );
        const source = review.locator('[data-ui="gallery.videoReview.sourceLane"]');
        const ruler = review.locator('[data-ui="gallery.videoReview.ruler"]');
        await command('gallery.videoReview.speedMode').click();
        await range(page, source, 0.4, 0.6);
        const block = source.locator('[data-ui="gallery.videoReview.editBlock"]');
        await expect(block).toHaveCount(1);
        await command('gallery.videoReview.pointerTool').click();
        await range(page, ruler, 0.3, 0.7);
        const selected = review.locator('[data-ui="gallery.videoReview.playbackRangeOverlay"]');
        await expect(selected).toBeVisible();
        const boundary = (await selected.boundingBox())!;
        const edge = (await block.locator('[data-edge="start"]').boundingBox())!;
        await page.mouse.move(edge.x + edge.width / 2, edge.y + edge.height / 2);
        await page.mouse.down();
        await expect(selected).toBeVisible();
        await page.mouse.move(boundary.x + 4, edge.y + edge.height / 2, { steps: 5 });
        expect(Math.abs((await block.boundingBox())!.x - boundary.x)).toBeLessThanOrEqual(1);
        await page.mouse.up();
        await expect(command('gallery.videoReview.pointerTool')).toBeEnabled();
        await expect
          .poll(async () => Math.abs((await block.boundingBox())!.x - boundary.x))
          .toBeLessThanOrEqual(1);
        const rulerBox = (await ruler.boundingBox())!;
        const pointerX = rulerBox.x + rulerBox.width * 0.7;
        await ruler.hover({ position: { x: rulerBox.width * 0.7, y: 10 } });
        const time = review.locator('[data-ui="gallery.videoReview.hoverTime"] > span');
        await expect(time).toBeVisible();
        const timeBox = (await time.boundingBox())!;
        expect(timeBox.x + timeBox.width).toBeLessThanOrEqual(pointerX - 4);
        await page.screenshot({
          path: info.outputPath('range-magnet-and-time-label.png'),
          fullPage: false,
        });

        await command('gallery.videoReview.scene').click();
        const header = review.locator('[data-ui="window-header-settings"]');
        const browser = header.getByRole('button', {
          name: label('windowHeader.browser'),
          exact: true,
        });
        if (await browser.count()) await browser.click();
        else {
          await header
            .getByRole('button', { name: label('windowHeader.type'), exact: true })
            .click();
          await page
            .getByRole('option', { name: label('windowHeader.browser'), exact: true })
            .click();
        }
        await header
          .getByRole('textbox', { name: label('windowHeader.tabTitle'), exact: true })
          .fill('Проверка шапки');
        await review.locator('[data-ui="gallery.videoReview.previewSettings"]').click();
        const panel = review.locator('[data-ui="gallery.videoReview.previewInspector"]');
        const actual = panel.locator('output[aria-label]');
        await expect(actual).toBeVisible();
        await expect(actual).toHaveCSS('white-space', 'nowrap');
        await expect(actual).toHaveCSS('font-size', '13px');
        expect(
          await panel
            .locator('.sniptale-parameter-row')
            .first()
            .evaluate((node) => !!node.querySelector('output'))
        ).toBe(true);
        await page.screenshot({
          path: info.outputPath('preview-raster-first.png'),
          fullPage: false,
          animations: 'disabled',
        });
        const actualRow = actual.locator('..').locator('..');
        await expect(actualRow.locator('[aria-haspopup]')).toHaveCount(0);
        const toggle = panel.getByRole('switch', {
          name: label('gallery.videoReview.previewShowFrameRate'),
          exact: true,
        });
        const thumb = toggle.locator('.sniptale-glass-switch-thumb');
        const toggleBox = (await toggle.boundingBox())!;
        const thumbBox = (await thumb.boundingBox())!;
        expect(
          Math.abs(toggleBox.y + toggleBox.height / 2 - thumbBox.y - thumbBox.height / 2)
        ).toBeLessThanOrEqual(0.5);
        await panel
          .getByRole('button', { name: label('gallery.videoReview.previewPaused'), exact: true })
          .click();
        await page
          .getByRole('option', {
            name: label('gallery.videoReview.previewPausedDetailed'),
            exact: true,
          })
          .click();
        await expect(
          review.locator('[data-ui="gallery.videoReview.manualPreview"] canvas')
        ).toBeVisible();
        await expect(actual).toContainText('×');
        await command('gallery.videoReview.play').click();
        const frames = await review
          .locator('[data-ui="gallery.videoReview.stage"]')
          .evaluate(async (stage) => {
            const frames = [];
            for (let index = 0; index < 8; index++) {
              await new Promise(requestAnimationFrame);
              const image = stage.querySelector<HTMLImageElement>('img[src^="data:image/svg+xml"]');
              frames.push(Boolean(image?.complete && image.naturalWidth));
            }
            return frames;
          });
        expect(frames).toEqual(Array.from({ length: 8 }, () => true));
        await command('gallery.videoReview.pause').click();
        await expect(
          review.locator('[data-ui="gallery.videoReview.manualPreview"] canvas')
        ).toBeVisible();
        await page.screenshot({
          path: info.outputPath('preview-readonly-raster-and-detailed-header.png'),
          fullPage: false,
        });
      } catch (error) {
        await page.screenshot({ path: info.outputPath('control-failure.png'), fullPage: false });
        throw error;
      } finally {
        await closeExtensionBrowser(launched);
      }
    });
  }

for (const size of [
  { width: 1280, height: 560 },
  { width: 1920, height: 900 },
])
  for (const theme of ['light', 'dark'] as const) {
    test(`native track settings and reorder ${size.width} ${theme}`, async ({}, info) => {
      test.setTimeout(90_000);
      const launched = await launchExtensionBrowser({ viewport: size });
      const page = await launched.context.newPage();
      page.setDefaultTimeout(10_000);
      try {
        const review = await openReview(page, launched.extensionId, theme);
        await review.locator('[data-ui="gallery.videoReview.resizeTimeline"]').press('End');
        await review
          .getByRole('button', { name: label('gallery.videoReview.trackSettings'), exact: true })
          .click();
        const list = review.locator('[data-ui="gallery.videoReview.trackListViewport"]');
        const headers = list.locator('[data-review-header-track]');
        const order = () =>
          headers.evaluateAll((nodes) =>
            nodes.map((node) => node.getAttribute('data-review-header-track'))
          );
        const expected = [
          'actions',
          'source',
          'webcam',
          'zoom',
          'originalAudio',
          'annotationEffects',
          'text',
          'voiceover',
          'music',
        ];
        await expect.poll(order).toEqual(expected);
        const row = (track: string) => list.locator(`[data-review-header-track="${track}"]`);
        const source = row('source').getByRole('switch');
        await expect(source).toBeDisabled();
        await expect(source).toHaveAttribute('aria-checked', 'true');
        await expect(review.locator('.lucide-lock,.lucide-unlock')).toHaveCount(0);
        for (const toggle of await headers.getByRole('switch').all()) {
          const geometry = await toggle.evaluate((node) => {
            const box = node.getBoundingClientRect();
            const thumb = node
              .querySelector('.sniptale-glass-switch-thumb')!
              .getBoundingClientRect();
            return {
              width: box.width,
              height: box.height,
              thumb: thumb.width,
              center: Math.abs(box.y + box.height / 2 - thumb.y - thumb.height / 2),
            };
          });
          expect(geometry.width).toBeLessThanOrEqual(28);
          expect(geometry.height).toBe(24);
          expect(geometry.thumb).toBe(12);
          expect(geometry.center).toBeLessThanOrEqual(0.5);
        }
        for (const track of expected) {
          const handle = row(track).locator('.review-track-reorder');
          await expect(handle).toBeEnabled();
          const handleBox = (await handle.boundingBox())!;
          const switchBox = (await row(track).getByRole('switch').boundingBox())!;
          expect(handleBox.x + handleBox.width).toBeLessThanOrEqual(switchBox.x);
        }
        const sourceHandle = row('source').locator('.review-track-reorder');
        await sourceHandle.press('ArrowDown');
        await expect.poll(order).toEqual(['actions', 'webcam', 'source', ...expected.slice(3)]);
        await sourceHandle.press('ArrowUp');
        await expect.poll(order).toEqual(expected);
        await sourceHandle.scrollIntoViewIfNeeded();
        const start = (await sourceHandle.boundingBox())!;
        const target = (await row('actions').boundingBox())!;
        const drag = async () => {
          await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
          await page.mouse.down();
          await page.mouse.move(start.x + start.width / 2, target.y + target.height / 2, {
            steps: 4,
          });
          expect(
            await page.evaluate(
              ({ x, y }) => {
                const node = document.elementFromPoint(x, y);
                return node ? getComputedStyle(node).cursor : null;
              },
              { x: start.x + start.width / 2, y: target.y + target.height / 2 }
            )
          ).toBe('grabbing');
        };
        await drag();
        await expect.poll(order).toEqual(['source', 'actions', ...expected.slice(2)]);
        const movedBody = review.locator('[data-review-track="source"]');
        await expect
          .poll(async () =>
            Math.abs((await row('source').boundingBox())!.y - (await movedBody.boundingBox())!.y)
          )
          .toBeLessThanOrEqual(1);
        await page.keyboard.press('Escape');
        await expect(review).not.toHaveClass(/review-track-reordering/);
        await page.mouse.up();
        await expect.poll(order).toEqual(expected);
        await drag();
        await page.mouse.up();
        await expect(review).not.toHaveClass(/review-track-reordering/);
        await expect.poll(order).toEqual(['source', 'actions', ...expected.slice(2)]);
        const bodies = review.locator('[data-review-track]');
        await expect
          .poll(() =>
            bodies.evaluateAll((nodes) =>
              nodes.map((node) => node.getAttribute('data-review-track'))
            )
          )
          .toEqual(['source', 'actions', ...expected.slice(2)]);
        const zoom = row('zoom');
        await zoom.getByRole('switch').click();
        await expect(zoom.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
        await expect(
          zoom.getByRole('button', { name: label('gallery.videoReview.zoomEnabled'), exact: true })
        ).toBeDisabled();
        const zoomHandle = zoom.locator('.review-track-reorder');
        await expect(zoomHandle).toBeEnabled();
        const offStart = (await zoomHandle.boundingBox())!;
        const offTarget = (await row('webcam').boundingBox())!;
        await page.mouse.move(offStart.x + offStart.width / 2, offStart.y + offStart.height / 2);
        await page.mouse.down();
        await page.mouse.move(offStart.x + offStart.width / 2, offTarget.y + offTarget.height / 2, {
          steps: 4,
        });
        await page.mouse.up();
        await expect
          .poll(order)
          .toEqual(['source', 'actions', 'zoom', 'webcam', ...expected.slice(4)]);
        await expect(zoom.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
        await zoomHandle.press('ArrowDown');
        await expect.poll(order).toEqual(['source', 'actions', ...expected.slice(2)]);
        await zoom.getByRole('switch').click();
        await expect(
          zoom.getByRole('button', { name: label('gallery.videoReview.zoomEnabled'), exact: true })
        ).toBeEnabled();
        await sourceHandle.scrollIntoViewIfNeeded();
        await page.screenshot({
          path: info.outputPath('compact-track-settings-reordered.png'),
          fullPage: false,
        });
      } finally {
        await closeExtensionBrowser(launched);
      }
    });
  }

for (const size of [
  { width: 1280, height: 560 },
  { width: 1920, height: 900 },
])
  for (const theme of ['light', 'dark'] as const) {
    test(`native voiceover inspector ${size.width} ${theme}`, async ({}, info) => {
      test.setTimeout(90_000);
      const launched = await launchExtensionBrowser({ viewport: size, fakeMediaDevices: true });
      const page = await launched.context.newPage();
      page.setDefaultTimeout(10_000);
      try {
        const review = await openReview(page, launched.extensionId, theme);
        const normalInspector = await review
          .locator('[data-ui="gallery.videoReview.inspector"]')
          .elementHandle();
        const entry = review.getByRole('button', {
          name: label('gallery.videoReview.recordVoiceover'),
          exact: true,
        });
        await entry.scrollIntoViewIfNeeded();
        await entry.click();
        const panel = review.locator('[data-ui="gallery.videoReview.voiceoverInspector"]');
        await expect(panel).toBeVisible();
        await expect(
          review.locator('[data-ui="gallery.videoReview.workspace"]')
        ).not.toHaveAttribute('inert');
        await expect(review.locator('[inert]')).toHaveCount(5);
        const workspace = (await review
          .locator('[data-ui="gallery.videoReview.workspace"]')
          .boundingBox())!;
        const inspector = review.locator('[data-ui="gallery.videoReview.inspector"]');
        const inspectorBox = (await inspector.boundingBox())!;
        expect(inspectorBox.x + inspectorBox.width).toBeCloseTo(workspace.x + workspace.width, 0);
        expect(inspectorBox.height).toBeCloseTo(workspace.height, 0);
        await expect(inspector.locator('header h2')).toBeVisible();
        const navigation = inspector.locator('[data-ui="gallery.videoReview.inspectorNavigation"]');
        await expect(
          navigation.getByRole('button', {
            name: label('gallery.videoReview.comments'),
            exact: true,
          })
        ).toBeVisible();
        await navigation
          .getByRole('button', { name: label('gallery.videoReview.scene'), exact: true })
          .click();
        await expect(panel).toBeHidden();
        await navigation
          .getByRole('button', { name: label('gallery.videoReview.recordVoiceover'), exact: true })
          .click();
        await expect(panel).toBeVisible();
        expect(await panel.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
        const limit = panel.getByRole('spinbutton', {
          name: label('gallery.videoReview.voiceoverDurationLimit'),
          exact: true,
        });
        const numericBox = (await limit.boundingBox())!;
        const unitBox = (await limit.locator('xpath=following-sibling::span').boundingBox())!;
        expect(unitBox.x).toBeGreaterThanOrEqual(numericBox.x + numericBox.width + 4);
        await limit.fill('');
        const start = panel.getByRole('button', {
          name: label('videoEditor.app.recordAudioStart'),
          exact: true,
        });
        await expect(start).toBeDisabled();
        await limit.fill('60');
        await panel.locator('[data-ui="audio-recording.play-video"]').click();
        await start.click();
        const pause = panel.getByRole('button', {
          name: label('videoEditor.app.recordAudioPause'),
          exact: true,
        });
        await expect(pause).toBeVisible();
        const closeRecording = panel.getByRole('button', {
          name: label('common.actions.close'),
          exact: true,
        });
        const recordingTab = navigation.getByRole('button', {
          name: label('gallery.videoReview.recordVoiceover'),
          exact: true,
        });
        await closeRecording.focus();
        await page.keyboard.press('Shift+Tab');
        await expect(recordingTab).toBeFocused();
        const captureText = await panel.textContent();
        await expect.poll(() => panel.textContent()).not.toBe(captureText);
        await expect(recordingTab).toBeFocused();
        await page.keyboard.press('Shift+Tab');
        await page.keyboard.press('Enter');
        await expect(panel).toBeHidden();
        await page.keyboard.press('Tab');
        await page.keyboard.press('Enter');
        await expect(pause).toBeVisible();
        await expect
          .poll(() => panel.getByRole('meter').getAttribute('aria-valuenow'))
          .not.toBe('0');
        await page.screenshot({
          path: info.outputPath('voiceover-inspector-recording.png'),
          fullPage: false,
        });
        await pause.click();
        await panel
          .getByRole('button', { name: label('videoEditor.app.recordAudioResume'), exact: true })
          .click();
        await panel
          .getByRole('button', { name: label('videoEditor.app.recordAudioStop'), exact: true })
          .click();
        const save = panel.getByRole('button', {
          name: label('videoEditor.app.recordAudioSave'),
          exact: true,
        });
        await expect(save).toBeVisible();
        await navigation
          .getByRole('button', { name: label('gallery.videoReview.scene'), exact: true })
          .click();
        await expect(panel).toBeHidden();
        await navigation
          .getByRole('button', { name: label('gallery.videoReview.recordVoiceover'), exact: true })
          .click();
        await expect(save).toBeVisible();
        await panel.press('Escape');
        const confirmation = review.getByRole('alertdialog');
        await expect(confirmation).toBeVisible();
        await confirmation
          .getByRole('button', { name: label('videoEditor.app.recordAudioKeep'), exact: true })
          .click();
        await expect(save).toBeVisible();
        await save.scrollIntoViewIfNeeded();
        await expect(save).toBeInViewport({ ratio: 1 });
        expect(await panel.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
        await page.screenshot({
          path: info.outputPath('voiceover-inspector-take.png'),
          fullPage: false,
        });
        await save.click();
        await expect(panel).toHaveCount(0);
        await expect(review.locator('[inert]')).toHaveCount(0);
        await expect(review.locator('[data-audio-lane="voiceover"] [data-audio-id]')).toHaveCount(
          1
        );
        await expect(entry).toBeFocused();
        expect(
          await review
            .locator('[data-ui="gallery.videoReview.inspector"]')
            .evaluate((node, previous) => node === previous, normalInspector)
        ).toBe(true);
      } finally {
        await closeExtensionBrowser(launched);
      }
    });
  }

for (const size of [
  { width: 1280, height: 560 },
  { width: 1920, height: 900 },
])
  for (const theme of ['light', 'dark'] as const) {
    test(`native interval and text detail ${size.width} ${theme}`, async ({}, info) => {
      const launched = await launchExtensionBrowser({ viewport: size });
      const page = await launched.context.newPage();
      page.setDefaultTimeout(10_000);
      try {
        const review = await openReview(page, launched.extensionId, theme);
        const command = (key: Parameters<typeof translate>[0]) =>
          review.getByRole('button', { name: label(key), exact: true });
        await command('gallery.videoReview.cutMode').click();
        await range(page, review.locator('[data-ui="gallery.videoReview.sourceLane"]'), 0.2, 0.4);
        const bounds = review.locator('[data-ui="gallery.videoReview.editRangeFields"]');
        const transition = review
          .locator('summary')
          .filter({ hasText: label('gallery.videoReview.cutTransition') });
        await expect(bounds).toBeVisible();
        expect((await bounds.boundingBox())!.y).toBeLessThan((await transition.boundingBox())!.y);
        await expect(review.locator('[data-ui="gallery.videoReview.interval"]')).toHaveCSS(
          'border-bottom-width',
          '1px'
        );
        const start = bounds.getByRole('textbox', {
          name: label('gallery.videoReview.rangeStart'),
          exact: true,
        });
        await start.fill('2.5');
        await start.press('Enter');
        await expect(start).toHaveValue('2.5');
        const end = bounds.getByRole('textbox', {
          name: label('gallery.videoReview.rangeEnd'),
          exact: true,
        });
        const previous = await end.inputValue();
        await end.fill('5');
        await end.press('Escape');
        await expect(end).toHaveValue(previous);
        await page.screenshot({
          path: info.outputPath('cut-bounds-first.png'),
          fullPage: false,
          animations: 'disabled',
        });
        await transition.click();
        const settings = review.locator('[data-ui="gallery.videoReview.cutTransition"]');
        await settings
          .getByRole('button', {
            name: label('gallery.videoReview.zoomTransitionType'),
            exact: true,
          })
          .click();
        await page
          .getByRole('option', { name: label('gallery.videoReview.cutDissolve'), exact: true })
          .click();
        const hint = settings.getByRole('status');
        await hint.scrollIntoViewIfNeeded();
        await expect(hint).toHaveCSS('padding-left', '8px');
        const hintBounds = (await hint.boundingBox())!;
        const settingsBounds = (await settings.boundingBox())!;
        expect(hintBounds.x).toBeGreaterThanOrEqual(settingsBounds.x - 1);
        expect(hintBounds.x + hintBounds.width).toBeLessThanOrEqual(
          settingsBounds.x + settingsBounds.width + 1
        );
        await page.screenshot({
          path: info.outputPath('cut-transition-status.png'),
          fullPage: false,
          animations: 'disabled',
        });
        await command('gallery.videoReview.textTrackOpen').click();
        const document = review.locator('[data-ui="gallery.videoReview.textDocument"]');
        await document
          .getByRole('button', { name: label('gallery.videoReview.textFragmentAdd'), exact: true })
          .click();
        await document
          .getByRole('textbox', { name: label('gallery.videoReview.speechText'), exact: true })
          .fill('Один фрагмент текста');
        await review
          .locator('[data-ui="gallery.videoReview.textTrack"] [data-text-id]')
          .first()
          .click();
        const detail = review.locator('[data-ui="gallery.videoReview.textPhrase"]');
        await expect(
          detail.locator(':scope > div').first().locator('button[aria-expanded]')
        ).toHaveCount(0);
        await expect(detail).toHaveCSS('border-top-width', '0px');
        const text = detail.getByRole('textbox', {
          name: label('gallery.videoReview.speechText'),
          exact: true,
        });
        expect((await text.boundingBox())!.height).toBeGreaterThanOrEqual(120);
        await text.focus();
        await text.scrollIntoViewIfNeeded();
        await text.press('Tab');
        await page.keyboard.press('Shift+Tab');
        await expect(text).toBeFocused();
        await expect(text).toHaveCSS('outline-style', 'solid');
        const neutral = await text.evaluate((node) => {
          const probe = document.createElement('span');
          probe.style.color = 'var(--sniptale-color-border-soft)';
          node.parentElement!.appendChild(probe);
          const color = getComputedStyle(probe).color;
          probe.remove();
          return color;
        });
        await expect(text).toHaveCSS('border-top-color', neutral);
        await expect(text).toHaveCSS('box-shadow', 'none');
        await expect(text).toHaveCSS('outline-width', '1px');
        await page.screenshot({
          path: info.outputPath('single-text-editor.png'),
          fullPage: false,
          animations: 'disabled',
        });
        await detail
          .getByRole('button', { name: label('gallery.videoReview.speechJump'), exact: true })
          .click();
        await expect(detail).toBeVisible();
        await detail
          .locator('summary')
          .filter({ hasText: label('gallery.videoReview.intervalBounds') })
          .click();
        const time = detail.getByRole('textbox', {
          name: label('gallery.videoReview.textFragmentStart'),
          exact: true,
        });
        await time.scrollIntoViewIfNeeded();
        const unit = time.locator('..').locator(':scope > span');
        await expect(unit).toBeVisible();
        expect((await unit.innerText()).trim()).not.toBe('');
        expect(
          await review
            .locator('.review-inspector-scroll')
            .evaluate((node) => node.scrollWidth <= node.clientWidth + 1)
        ).toBe(true);
        await page.screenshot({
          path: info.outputPath('single-text-bounds.png'),
          fullPage: false,
          animations: 'disabled',
        });
      } finally {
        await closeExtensionBrowser(launched);
      }
    });
  }
