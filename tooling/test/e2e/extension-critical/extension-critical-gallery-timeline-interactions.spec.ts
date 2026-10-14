import { expect, test, type Locator, type Page } from '@playwright/test';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { betaV1Fixture } from '../../../../apps/extension/src/composition/persistence/infrastructure/indexed-db/fixtures/beta-v1';
import { startHostServer } from '../support/host-server';
import { seedReviewVideo } from '../support/quick-editor-media-fixture';
import { readNativeReviewWorkspace } from '../support/native-review-workspace';
import { persistedReviewContent } from '../support/voiceover-speech-fixture';
import { applyHarnessBootstrap, GALLERY_HARNESS_PATH } from '../extension-critical.helpers';

async function gesture(page: Page, lane: Locator, start: number, end?: number) {
  await lane.scrollIntoViewIfNeeded();
  const box = await lane.boundingBox();
  if (!box) throw new Error('Timeline lane is absent');
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width * start, y);
  await page.mouse.down();
  if (end !== undefined) await page.mouse.move(box.x + box.width * end, y, { steps: 6 });
  await page.mouse.up();
}

async function inspectResizeGuide(page: Page, dialog: Locator) {
  const block = dialog.locator('[data-ui="gallery.videoReview.editBlock"]').first();
  const edge = block.locator('[data-edge="end"]');
  await edge.scrollIntoViewIfNeeded();
  const box = await edge.boundingBox();
  if (!box) throw new Error('Source resize handle is absent');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 24, box.y + box.height / 2, { steps: 3 });
  const guide = dialog.locator('[data-ui="gallery.videoReview.hoverTime"][data-resizing]');
  await expect(guide).toBeVisible();
  const bounds = await block.boundingBox();
  const marker = await guide.boundingBox();
  if (!bounds || !marker) throw new Error('Resize geometry is absent');
  expect(Math.abs(marker.x - bounds.x - bounds.width)).toBeLessThanOrEqual(1);
  const viewport = dialog.locator('[data-ui="gallery.videoReview.timelineViewport"]');
  await viewport.evaluate((node) => {
    node.scrollTop = 60;
  });
  const viewportBox = await viewport.boundingBox();
  const labelBox = await guide.locator('span').boundingBox();
  if (!viewportBox || !labelBox) throw new Error('Resize label is absent');
  expect(labelBox.y).toBeGreaterThanOrEqual(viewportBox.y - 1);
  expect(labelBox.y + labelBox.height).toBeLessThanOrEqual(viewportBox.y + viewportBox.height + 1);
  const colors = await guide.evaluate((node) => {
    const probe = document.createElement('span');
    probe.style.backgroundColor =
      'color-mix(in srgb, var(--sniptale-color-text-primary) 60%, transparent)';
    node.append(probe);
    const expected = getComputedStyle(probe).backgroundColor;
    probe.remove();
    const playhead = document.querySelector('[data-ui="gallery.videoReview.playhead"]')!;
    return {
      actual: getComputedStyle(node).backgroundColor,
      expected,
      playhead: getComputedStyle(playhead).backgroundColor,
    };
  });
  expect(colors.actual).toBe(colors.expected);
  expect(colors.actual).not.toBe(colors.playhead);
  return guide;
}

async function inspectTrackControls(
  page: Page,
  dialog: Locator,
  locale: 'ru' | 'en',
  screenshotPath: string
) {
  const label = (key: Parameters<typeof translate>[0]) => translate(key, locale);
  const settings = dialog.getByRole('button', {
    name: label('gallery.videoReview.trackSettings'),
    exact: true,
  });
  await settings.click();
  for (const track of [
    'source',
    'actions',
    'zoom',
    'text',
    'annotationEffects',
    'webcam',
    'originalAudio',
    'voiceover',
    'music',
  ]) {
    await expect(dialog.locator(`[data-review-track="${track}"]`)).toHaveCount(1);
  }
  const camera = dialog.locator('[data-review-track="webcam"] [role="switch"]');
  await expect(camera).toBeDisabled();
  await expect(camera).not.toBeChecked();
  const textToggle = dialog.locator('[data-review-track="text"] [role="switch"]');
  await textToggle.uncheck();
  await settings.click();
  await expect(dialog.locator('[data-review-track="text"]')).toHaveCount(0);
  await settings.click();
  await dialog.locator('[data-review-track="text"] [role="switch"]').check();
  await expect(dialog.locator('[data-review-track="text"] [role="switch"]')).toBeChecked();
  await page.screenshot({ path: screenshotPath, fullPage: false, animations: 'disabled' });
  await dialog.locator('[data-review-track="music"]').scrollIntoViewIfNeeded();
  await page.screenshot({
    path: screenshotPath.replace('.png', '-audio.png'),
    fullPage: false,
    animations: 'disabled',
  });
  await settings.click();
  const source = dialog.locator('[data-review-track="source"]');
  const lock = source.getByRole('button', {
    name: `${label('gallery.videoReview.trackLock')}: ${label('gallery.videoReview.sourceVideo')}`,
    exact: true,
  });
  const historyBefore = (
    await readNativeReviewWorkspace(page, `recording:${betaV1Fixture.records.recordings[0]!.id}`)
  )?.history.length;
  const guide = await inspectResizeGuide(page, dialog);
  await lock.focus();
  await lock.press('Enter');
  await expect(guide).toHaveCount(0);
  await page.mouse.up();
  await expect(source).toHaveAttribute('data-review-track-locked', 'true');
  expect(
    (await readNativeReviewWorkspace(page, `recording:${betaV1Fixture.records.recordings[0]!.id}`))
      ?.history.length
  ).toBe(historyBefore);
  await source
    .getByRole('button', {
      name: `${label('gallery.videoReview.trackUnlock')}: ${label('gallery.videoReview.sourceVideo')}`,
      exact: true,
    })
    .click();
  await expect(source).toHaveAttribute('data-review-track-locked', 'false');
}

async function inspectWorkspaceColor(
  page: Page,
  dialog: Locator,
  locale: 'ru' | 'en',
  screenshotPath: string
) {
  const label = (key: Parameters<typeof translate>[0]) => translate(key, locale);
  await dialog.locator('[data-ui="gallery.videoReview.previewSettings"]').click();
  const surface = dialog.locator('[data-ui="gallery.videoReview.workspaceSurface"]');
  const original = await surface.evaluate((node) => getComputedStyle(node).backgroundColor);
  const field = dialog
    .locator('[data-ui="shared.ui.compact-inspector.color-field"]')
    .filter({ hasText: label('gallery.videoReview.workspaceColor') });
  const open = () => field.locator('[data-ui="shared.ui.color-selector.picker-trigger"]').click();
  await open();
  const hex = page.getByRole('textbox', { name: label('shared.ui.colorSelectorHex'), exact: true });
  await hex.fill('#c83456');
  await expect(surface).toHaveCSS('background-color', 'rgb(200, 52, 86)');
  await page.screenshot({ path: screenshotPath, fullPage: false });
  await page.keyboard.press('Escape');
  await expect(surface).toHaveCSS('background-color', original);
  await open();
  await hex.fill('#123456');
  await page
    .getByRole('button', { name: label('shared.ui.colorSelectorApply'), exact: true })
    .click();
  await expect(surface).toHaveCSS('background-color', 'rgb(18, 52, 86)');
  const originalTheme = await surface.evaluate((node) => {
    const owner = node.closest<HTMLElement>('[data-theme]')!;
    const theme = owner.dataset['theme']!;
    owner.dataset['theme'] = theme === 'dark' ? 'light' : 'dark';
    return theme;
  });
  await expect(surface).not.toHaveCSS('background-color', 'rgb(18, 52, 86)');
  await open();
  await hex.fill('#abcdef');
  await page
    .getByRole('button', { name: label('shared.ui.colorSelectorApply'), exact: true })
    .click();
  await expect(surface).toHaveCSS('background-color', 'rgb(171, 205, 239)');
  await dialog
    .getByRole('button', {
      name: label('gallery.videoReview.workspaceColorAutomatic'),
      exact: true,
    })
    .click();
  await surface.evaluate((node, theme) => {
    node.closest<HTMLElement>('[data-theme]')!.dataset['theme'] = theme;
  }, originalTheme);
  await expect(surface).toHaveCSS('background-color', 'rgb(18, 52, 86)');
  return surface;
}

for (const variant of [
  { width: 1280, height: 560, theme: 'light', locale: 'ru' },
  { width: 1280, height: 560, theme: 'dark', locale: 'en' },
  { width: 1920, height: 900, theme: 'light', locale: 'en' },
  { width: 1920, height: 900, theme: 'dark', locale: 'ru' },
  { width: 1200, height: 560, theme: 'light', locale: 'ru' },
] as const) {
  test(`Gallery timeline lanes ${variant.width} ${variant.theme}`, async ({ page }, info) => {
    await page.setViewportSize({ width: variant.width, height: variant.height });
    const host = await startHostServer();
    const label = (key: Parameters<typeof translate>[0]) => translate(key, variant.locale);
    const history = async () =>
      (
        await readNativeReviewWorkspace(
          page,
          `recording:${betaV1Fixture.records.recordings[0]!.id}`
        )
      )?.history.length ?? 0;
    try {
      await applyHarnessBootstrap(page, {
        preserveMediaLibrary: true,
        storage: {
          'sniptale-locale-preference': variant.locale,
          'sniptale-theme-preference': variant.theme,
        },
      });
      await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}?theme=${variant.theme}`);
      await page.locator('[data-ui="gallery.page.root"]').waitFor();
      await seedReviewVideo(page, 'review-vp8-opus.webm', { width: 160, height: 90, duration: 12 });
      await page.reload();
      await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      const dialog = page.locator('dialog');
      const button = (key: Parameters<typeof translate>[0]) =>
        dialog.getByRole('button', { name: label(key), exact: true });
      const advanced = button('gallery.videoReview.advancedEditing');
      if ((await advanced.getAttribute('aria-pressed')) !== 'true') await advanced.click();
      await expect.poll(async () => (await persistedReviewContent(page))?.zoom.enabled).toBe(true);
      const resize = dialog.locator('[data-review-panel-resize="timeline"]');
      await resize.focus();
      for (let index = 0; index < 5; index++) await resize.press('ArrowUp');
      await expect
        .poll(() => dialog.locator('video').evaluate((node: HTMLVideoElement) => node.readyState))
        .toBeGreaterThanOrEqual(2);
      const text = dialog.locator('[data-ui="gallery.videoReview.textTrack"]');
      const annotations = dialog.locator('[data-ui="gallery.videoReview.annotationEffectsLane"]');
      const plane = dialog.locator('[data-ui="gallery.videoReview.timePlane"]');
      const beforeSeek = await history();
      await gesture(page, text, 0.25);
      await expect
        .poll(async () => Number(await plane.getAttribute('aria-valuenow')))
        .toBeCloseTo(3, 1);
      await expect
        .poll(() => dialog.locator('video').evaluate((node: HTMLVideoElement) => node.currentTime))
        .toBeCloseTo(3, 1);
      await gesture(page, annotations, 0.5);
      await expect
        .poll(async () => Number(await plane.getAttribute('aria-valuenow')))
        .toBeCloseTo(6, 1);
      expect(await history()).toBe(beforeSeek);
      const density = button('gallery.videoReview.compactTrackHeight');
      for (const count of [0, 1, 2]) {
        if (count) await button('gallery.videoReview.textFragmentAdd').click();
        await expect(text.locator('[data-text-id]')).toHaveCount(count);
        if (count)
          await expect
            .poll(async () => (await persistedReviewContent(page))?.text?.fragments.length)
            .toBe(count);
        for (const compact of [false, true]) {
          if (((await density.getAttribute('aria-pressed')) === 'true') !== compact)
            await density.click();
          const step = compact ? 28 : 36;
          await expect(text).toHaveCSS('height', `${Math.max(1, count) * step - 4}px`);
          await expect(annotations).toHaveCSS('height', `${step - 4}px`);
          const textColor = await text.evaluate((node) => getComputedStyle(node).backgroundColor);
          await expect(annotations).toHaveCSS('background-color', textColor);
          expect(textColor).not.toBe('rgba(0, 0, 0, 0)');
          const tops = await text
            .locator('[data-text-id]')
            .evaluateAll((nodes) =>
              nodes
                .map(
                  (node) =>
                    node.getBoundingClientRect().top -
                    node.parentElement!.getBoundingClientRect().top
                )
                .sort((a, b) => a - b)
            );
          expect(tops).toEqual(Array.from({ length: count }, (_, index) => index * step + 2));
          const insets = await text.locator('[data-text-id]').evaluateAll((nodes) =>
            nodes.map((node) => {
              const style = getComputedStyle(node);
              return [style.paddingLeft, style.paddingRight];
            })
          );
          expect(insets).toEqual(Array.from({ length: count }, () => ['12px', '12px']));
          await text.scrollIntoViewIfNeeded();
          await page.screenshot({
            path: info.outputPath(`text-${count}-${compact ? 'compact' : 'normal'}.png`),
            fullPage: false,
          });
        }
      }
      const beforeRange = await history();
      const ruler = dialog.locator('[data-ui="gallery.videoReview.ruler"]');
      await gesture(page, ruler, 0.1, 0.2);
      await expect(
        dialog.locator('[data-ui="gallery.videoReview.playbackRangeOverlay"]')
      ).toHaveCount(1);
      const source = dialog.locator('[data-ui="gallery.videoReview.sourceLane"]');
      await gesture(page, source, 0.3, 0.5);
      await expect(dialog.locator('[data-ui="gallery.videoReview.sourceRange"]')).toHaveCount(0);
      await expect(dialog.locator('[data-ui="gallery.videoReview.sourceDrawPreview"]')).toHaveCount(
        0
      );
      expect(await history()).toBe(beforeRange);
      await expect(
        dialog.locator('[data-ui="gallery.videoReview.playbackRangeOverlay"]')
      ).toHaveCount(0);
      await button('gallery.videoReview.speedMode').click();
      await gesture(page, source, 0.4, 0.6);
      await expect(source.locator('[data-ui="gallery.videoReview.editBlock"]')).toHaveCount(1);
      await expect(dialog.locator('[data-ui="gallery.videoReview.sourceDrawPreview"]')).toHaveCount(
        0
      );
      await button('gallery.videoReview.undo').click();
      await expect(source.locator('[data-ui="gallery.videoReview.editBlock"]')).toHaveCount(0);
      await button('gallery.videoReview.redo').click();
      await expect(source.locator('[data-ui="gallery.videoReview.editBlock"]')).toHaveCount(1);
      const guide = await inspectResizeGuide(page, dialog);
      await page.screenshot({ path: info.outputPath('resize-guide.png'), fullPage: false });
      await page.keyboard.press('Escape');
      await page.mouse.up();
      await expect(guide).toHaveCount(0);
      await page.screenshot({
        path: info.outputPath('source-tools-and-ruler.png'),
        fullPage: false,
      });
      await inspectTrackControls(
        page,
        dialog,
        variant.locale,
        info.outputPath('track-settings.png')
      );
      const workspaceSurface = await inspectWorkspaceColor(
        page,
        dialog,
        variant.locale,
        info.outputPath('workspace-picker.png')
      );
      await page.screenshot({ path: info.outputPath('workspace-color.png'), fullPage: false });
      await expect
        .poll(
          async () =>
            (
              await readNativeReviewWorkspace(
                page,
                `recording:${betaV1Fixture.records.recordings[0]!.id}`
              )
            )?.advanced.ui.workspaceColors
        )
        .toEqual({ [variant.theme]: '#123456ff' });
      await page.reload();
      await page
        .locator('[data-gallery-keyboard-id="recording:beta-v1-recording"]')
        .getByRole('button', { name: 'beta-v1.webm', exact: true })
        .first()
        .click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      await expect(workspaceSurface).toHaveCSS('background-color', 'rgb(18, 52, 86)');
      if (variant.width < 1280) {
        const scroll = dialog.locator('[data-ui="gallery.videoReview.workspaceScroll"]');
        expect(await scroll.evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(true);
        await scroll.evaluate((node) => {
          node.scrollLeft = node.scrollWidth - node.clientWidth;
        });
        await expect.poll(() => scroll.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);
        await page.screenshot({
          path: info.outputPath('timeline-horizontal-scroll.png'),
          fullPage: false,
        });
      }
    } finally {
      await new Promise<void>((resolve, reject) =>
        host.server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });
}
