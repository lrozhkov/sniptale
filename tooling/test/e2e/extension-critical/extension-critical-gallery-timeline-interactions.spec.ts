import { createQuickEditSpotlight } from '../../../../apps/extension/src/features/video/project/scene/focus-appearance';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { replaceNativeReviewWorkspace } from '../support/native-review-workspace';
import { seedReviewWebcamBundle } from '../support/quick-editor-media-fixture';
import { inspectVideoWorkspace } from '../../../../apps/extension/src/composition/persistence/review-workspaces/parser';
import {
  replayReviewHistory,
  reviewAdvancedContentBaseline,
} from '../../../../apps/extension/src/features/video/review/document';
import {
  addReviewTextFragment,
  type ReviewTextDocument,
} from '../../../../apps/extension/src/features/video/review/text-document';
import { createQuickEditZoomRegion } from '../../../../apps/extension/src/features/video/review/advanced/zoom';

import { readReviewAnnotationEffectDocument } from '../../../../apps/extension/src/features/video/review/annotation-effects/validation';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { betaV1Fixture } from '../../../../apps/extension/src/composition/persistence/infrastructure/indexed-db/fixtures/beta-v1';
import { startHostServer } from '../support/host-server';
import { seedReviewVideo } from '../support/quick-editor-media-fixture';
import { readNativeReviewWorkspace } from '../support/native-review-workspace';
import { persistedReviewContent, syntheticSpeechWav } from '../support/voiceover-speech-fixture';
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
  await edge.hover();
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

async function inspectTimelinePanes(dialog: Locator, scroll = false) {
  const panes = dialog.locator('[data-ui="gallery.videoReview.timelinePanes"]');
  const aligned = async () => {
    await expect
      .poll(() =>
        panes.evaluate((node) => {
          const headers = [...node.querySelectorAll<HTMLElement>('[data-review-header-track]')];
          return Math.max(
            0,
            ...headers.map((header) => {
              const body = node.querySelector<HTMLElement>(
                `[data-review-track="${header.dataset.reviewHeaderTrack}"]`
              );
              if (!body) return Infinity;
              const a = header.getBoundingClientRect();
              const b = body.getBoundingClientRect();
              return Math.max(
                Math.abs(a.top - b.top),
                Math.abs(a.bottom - b.bottom),
                Math.abs(a.right - b.left)
              );
            })
          );
        })
      )
      .toBeLessThanOrEqual(1);
  };
  await aligned();
  if (!scroll) return;
  const left = dialog.locator('[data-ui="gallery.videoReview.trackListViewport"]');
  const right = dialog.locator('[data-ui="gallery.videoReview.timelineViewport"]');
  await expect
    .poll(() => left.evaluate((node) => node.scrollHeight - node.clientHeight))
    .toBeGreaterThan(0);
  for (const [surface, amount] of [
    [left, 1],
    [right, 0.5],
    [left, 0],
  ] as const) {
    await surface.evaluate((node, fraction) => {
      node.scrollTop = (node.scrollHeight - node.clientHeight) * fraction;
    }, amount);
    await expect
      .poll(async () =>
        Math.abs(
          (await left.evaluate((node) => node.scrollTop)) -
            (await right.evaluate((node) => node.scrollTop))
        )
      )
      .toBeLessThanOrEqual(1);
    await aligned();
  }
  const clipping = await panes.evaluate((node) => {
    const left = node.querySelector<HTMLElement>(
      '[data-ui="gallery.videoReview.trackListViewport"]'
    )!;
    const right = node.querySelector<HTMLElement>(
      '[data-ui="gallery.videoReview.timelineViewport"]'
    )!;
    const header = left.querySelector<HTMLElement>('[data-ui="gallery.videoReview.trackHeader"]')!;
    return {
      separated: header.getBoundingClientRect().right <= right.getBoundingClientRect().left + 1,
      labelOverflow: getComputedStyle(left).overflowX,
      labelBar: left.offsetWidth - left.clientWidth,
      timeBar: right.offsetWidth - right.clientWidth,
      rangeDifference: Math.abs(
        left.scrollHeight - left.clientHeight - (right.scrollHeight - right.clientHeight)
      ),
    };
  });
  expect(clipping).toMatchObject({ separated: true, labelOverflow: 'hidden' });
  expect(clipping.rangeDifference).toBeLessThanOrEqual(1);
  expect(clipping.labelBar).toBe(0);
  expect(clipping.timeBar).toBeGreaterThan(0);
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
  const camera = dialog.locator('[data-review-header-track="webcam"] [role="switch"]');
  await expect(camera).toBeDisabled();
  await expect(camera).not.toBeChecked();
  await inspectTimelinePanes(dialog);
  const textToggle = dialog.locator('[data-review-header-track="text"] [role="switch"]');
  await textToggle.uncheck();
  await settings.click();
  await expect(dialog.locator('[data-review-track="text"]')).toHaveCount(0);
  await settings.click();
  await dialog.locator('[data-review-header-track="text"] [role="switch"]').check();
  await expect(dialog.locator('[data-review-header-track="text"] [role="switch"]')).toBeChecked();
  await page.screenshot({ path: screenshotPath, fullPage: false, animations: 'disabled' });
  await dialog.locator('[data-review-track="music"]').scrollIntoViewIfNeeded();
  await page.screenshot({
    path: screenshotPath.replace('.png', '-audio.png'),
    fullPage: false,
    animations: 'disabled',
  });
  await settings.click();
  const source = dialog.locator('[data-review-track="source"]');
  const sourceHeader = dialog.locator('[data-review-header-track="source"]');
  const lock = sourceHeader.getByRole('button', {
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
  await sourceHeader
    .getByRole('button', {
      name: `${label('gallery.videoReview.trackUnlock')}: ${label('gallery.videoReview.sourceVideo')}`,
      exact: true,
    })
    .click();
  await expect(source).toHaveAttribute('data-review-track-locked', 'false');
}

async function inspectNotes(page: Page, dialog: Locator, locale: 'ru' | 'en', basic: boolean) {
  const button = (key: Parameters<typeof translate>[0]) =>
    dialog.getByRole('button', { name: translate(key, locale), exact: true }).first();
  await button('gallery.videoReview.trackSettings').click();
  await dialog.locator('[data-review-header-track="actions"] [role="switch"]').uncheck();
  await button('gallery.videoReview.trackSettings').click();
  if (basic) await button('gallery.videoReview.advancedEditing').click();
  await expect(dialog.locator('[data-ui="gallery.videoReview.historyTrack"]')).toHaveCount(0);
  const ruler = dialog.locator('[data-ui="gallery.videoReview.ruler"]');
  const duration = Number(await ruler.getAttribute('aria-valuemax'));
  await gesture(page, ruler, 0.4, 0.6);
  await button('gallery.videoReview.addComment').click();
  const field = dialog.getByRole('textbox', {
    name: translate('gallery.videoReview.commentText', locale),
    exact: true,
  });
  await field.fill('Ruler note');
  await button('gallery.videoReview.save').click();
  const readNote = async () => {
    const workspace = await readNativeReviewWorkspace(page, 'recording:beta-v1-recording');
    const operation = workspace?.history.filter((item) => item.target === 'annotation').at(-1);
    return operation?.target === 'annotation' ? operation.after : null;
  };
  await expect.poll(readNote).toMatchObject({ text: 'Ruler note', anchor: { kind: 'range' } });
  const note = await readNote();
  if (note?.anchor.kind !== 'range') throw new Error('Saved range note is absent');
  expect(note.anchor.start).toBeCloseTo(duration * 0.4, 1);
  expect(note.anchor.end).toBeCloseTo(duration * 0.6, 1);
  await dialog
    .locator('[data-ui="gallery.videoReview.sourceLane"] button[title="Ruler note"]')
    .click();
  await button('gallery.videoReview.clearPlaybackRange').click();
  await gesture(page, ruler, 0.7);
  await dialog.locator('[data-ui="gallery.videoReview.timePlane"]').focus();
  await page.keyboard.press('m');
  await field.fill('Playhead note');
  await button('gallery.videoReview.save').click();
  await expect.poll(readNote).toMatchObject({ text: 'Playhead note', anchor: { kind: 'point' } });
  const point = await readNote();
  if (point?.anchor.kind !== 'point') throw new Error('Saved point note is absent');
  expect(point.anchor.time).toBeCloseTo(duration * 0.7, 1);
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
          await expect(text).toHaveCSS('height', `${Math.max(1, count) * step}px`);
          await expect(annotations).toHaveCSS('height', `${step}px`);
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
      await inspectTimelinePanes(dialog);
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
      await inspectNotes(page, dialog, variant.locale, variant.width === 1920);
      await page.screenshot({
        path: info.outputPath('notes-range-and-point.png'),
        fullPage: false,
      });
      await page.reload();
      await page
        .locator('[data-gallery-keyboard-id="recording:beta-v1-recording"]')
        .getByRole('button', { name: 'beta-v1.webm', exact: true })
        .first()
        .click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      await expect(workspaceSurface).toHaveCSS('background-color', 'rgb(18, 52, 86)');
      await dialog
        .locator('[data-ui="gallery.videoReview.sourceLane"] button[title="Ruler note"]')
        .click();
      await expect(dialog.getByText('Ruler note', { exact: true }).first()).toBeVisible();
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

async function seedDensityRows(page: Page, count: number, adjacent = false) {
  const saved = await readNativeReviewWorkspace(page, 'recording:beta-v1-recording');
  if (!saved) throw new Error('Density workspace is absent');
  const before = replayReviewHistory(
    saved.history,
    saved.cursor,
    saved.source,
    reviewAdvancedContentBaseline(saved.advanced)
  ).advancedContent;
  const source = await readFile(
    'packages/runtime-contracts/src/effect-v1/fixtures/valid/neutral-standalone.sniptale-effect.json',
    'utf8'
  );
  const document = readReviewAnnotationEffectDocument(source);
  if (!document) throw new Error('Density effect is invalid');
  const sha256 = createHash('sha256').update(source).digest('hex');
  const snapshot = {
    id: `effect:${sha256}`,
    schemaVersion: 'sniptale.effect.v1' as const,
    kind: 'standalone' as const,
    documentId: document.id,
    sha256,
    source,
    retainedByteLength: Buffer.byteLength(source),
    assets: [],
  };
  const ranges = Array.from({ length: count }, (_, i) => ({
    start: adjacent ? i + 1 : 1,
    end: adjacent ? i + 2 : 4,
  }));
  let text: ReviewTextDocument = { version: 1, fragments: [] };
  for (const [i, range] of ranges.entries()) {
    const result = addReviewTextFragment(text, {
      id: `density-text-${i}`,
      ...range,
      text: `Text ${i}`,
      timeDomain: 'source',
    });
    if (!result.ok) throw new Error('Density text is invalid');
    text = result.document;
  }
  const clips = ranges.map((range, i) => ({
    id: `density-audio-${i}`,
    assetId: before.audio.voiceover[0]!.assetId,
    timelineStart: range.start,
    duration: range.end - range.start,
    sourceOffset: 0,
    volume: 1,
    muted: false,
    fadeIn: 0,
    fadeOut: 0,
  }));
  const after = {
    ...before,
    text,
    zoom: {
      ...before.zoom,
      enabled: true,
      regions: ranges.map((range, i) => ({
        ...createQuickEditZoomRegion({
          id: `density-focus-${i}`,
          at: range.start,
          duration: range.end - range.start,
        }),
        ...(i ? { spotlight: createQuickEditSpotlight() } : {}),
      })),
    },
    annotationEffects: {
      enabled: true,
      instances: ranges.map((range, i) => ({
        id: `density-effect-${i}`,
        snapshotId: snapshot.id,
        enabled: true,
        ...range,
        attachment: 'viewport' as const,
        transform: { x: 0.1, y: 0.1, width: 0.3, height: 0.2, rotation: 0 },
        controls: { accent: '#5f7cff' },
        order: i,
      })),
    },
    webcam: { ...before.webcam!, hiddenRanges: [{ id: 'density-hidden', start: 1, end: 4 }] },
    audio: {
      ...before.audio,
      original: {
        ...before.audio.original,
        ranges: [],
        mutes: ranges.map((range, i) => ({
          id: `density-gain-${i}`,
          kind: 'range' as const,
          ...range,
          volume: 0.5,
        })),
      },
      voiceover: clips,
      music: clips.map((clip) => ({ ...clip, id: `music-${clip.id}` })),
    },
  };
  const history = [
    ...saved.history.slice(0, saved.cursor),
    { id: crypto.randomUUID(), at: Date.now(), target: 'advancedContent' as const, before, after },
  ];
  const inspected = inspectVideoWorkspace({
    ...saved,
    revision: saved.revision + 1,
    updatedAt: Date.now(),
    history,
    cursor: history.length,
    effectSnapshots: [snapshot],
  });
  const row = inspected.workspace;
  if (!row)
    throw new Error(`Density fixture failed workspace admission: ${JSON.stringify(inspected)}`);
  await replaceNativeReviewWorkspace(page, row.aggregateId, row);
}

for (const variant of [
  { width: 1280, height: 560, theme: 'light', locale: 'ru' },
  { width: 1920, height: 900, theme: 'dark', locale: 'en' },
] as const) {
  test(`interval track density ${variant.width}`, async ({ page }, info) => {
    await page.setViewportSize({ width: variant.width, height: variant.height });
    const host = await startHostServer();
    const label = (key: Parameters<typeof translate>[0]) => translate(key, variant.locale);
    const dialog = page.locator('dialog');
    const open = async () => {
      await page.reload();
      await page.getByRole('button', { name: /: Screen$/ }).click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
    };
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
      await seedReviewWebcamBundle(page);
      await open();
      await dialog
        .getByRole('button', { name: label('gallery.videoReview.advancedEditing'), exact: true })
        .click();
      await expect
        .poll(
          async () =>
            (await readNativeReviewWorkspace(page, 'recording:beta-v1-recording'))?.advanced.ui.mode
        )
        .toBe('advanced');
      const settings = dialog.getByRole('button', {
        name: label('gallery.videoReview.trackSettings'),
        exact: true,
      });
      await settings.click();
      await dialog.locator('[data-review-header-track="webcam"] [role="switch"]').click();
      await expect
        .poll(async () => (await persistedReviewContent(page))?.webcam?.assetId)
        .toMatch(/^project-asset:/);
      await settings.click();
      await dialog
        .locator('[data-review-header-track="voiceover"]')
        .getByRole('button', { name: label('gallery.videoReview.audioImport'), exact: true })
        .click();
      const drawer = page.locator('[data-ui="music.library.drawer"]');
      await drawer.locator('input[type="file"]').setInputFiles({
        name: 'density.wav',
        mimeType: 'audio/wav',
        buffer: syntheticSpeechWav(4),
      });
      await expect(drawer).toHaveCount(0);
      await expect
        .poll(async () => (await persistedReviewContent(page))?.audio.voiceover.length)
        .toBe(1);
      for (const [count, adjacent] of [
        [1, false],
        [2, false],
        [3, false],
        [3, true],
      ] as const) {
        await seedDensityRows(page, count, adjacent);
        await open();
        for (const compact of [false, true]) {
          const density = dialog.getByRole('button', {
            name: label('gallery.videoReview.compactTrackHeight'),
            exact: true,
          });
          if (((await density.getAttribute('aria-pressed')) === 'true') !== compact)
            await density.click();
          const rows = adjacent ? 1 : count;
          const step = compact ? 28 : 36;
          for (const [laneSelector, bodySelector, rowCount] of [
            ['[data-ui="gallery.videoReview.zoomLane"]', ':scope > [role="button"]', rows],
            ['[data-ui="gallery.videoReview.textTrack"]', '[data-text-id]', rows],
            [
              '[data-ui="gallery.videoReview.annotationEffectsLane"]',
              '[data-annotation-effect-id]',
              rows,
            ],
            [
              '[data-original-audio-lane]',
              '[data-ui="gallery.videoReview.originalAudioRange"]',
              rows,
            ],
            ['[data-audio-lane="voiceover"]', '[data-audio-id]', rows],
            ['[data-audio-lane="music"]', '[data-audio-id]', rows],
            ['[data-ui="gallery.videoReview.webcamTrack"]', ':scope > button', 1],
          ] as const) {
            const lane = dialog.locator(laneSelector);
            await expect(lane).toBeAttached();
            await expect(lane).toHaveCSS('height', `${rowCount * step}px`);
            const bodies = lane.locator(bodySelector);
            await expect(bodies).toHaveCount(
              rowCount === 1 && laneSelector.includes('webcam') ? 1 : count
            );
            const rects = await bodies.evaluateAll((nodes) =>
              nodes.map((node) => {
                const box = node.getBoundingClientRect();
                const lane = node.parentElement!.getBoundingClientRect();
                return { top: box.top - lane.top, height: box.height };
              })
            );
            for (const rect of rects)
              expect(Math.abs(rect.height - (step - 4))).toBeLessThanOrEqual(1);
            const tops = [...new Set(rects.map((rect) => rect.top))].sort((a, b) => a - b);
            expect(tops).toHaveLength(rowCount);
            for (const [i, top] of tops.entries())
              expect(Math.abs(top - (2 + i * step))).toBeLessThanOrEqual(1);
            if (
              count === 3 &&
              !adjacent &&
              (laneSelector.includes('zoomLane') || laneSelector.includes('music'))
            ) {
              await lane.scrollIntoViewIfNeeded();
              await page.screenshot({
                path: info.outputPath(
                  `density-${compact}-${laneSelector.includes('zoomLane') ? 'top' : 'bottom'}.png`
                ),
                fullPage: false,
              });
            }
          }
          await inspectTimelinePanes(dialog, count === 3 && !adjacent);
          if (count === 3 && !adjacent) {
            const zoom = dialog.getByRole('slider', {
              name: label('videoEditor.timeline.zoom'),
              exact: true,
            });
            await zoom.fill('50');
            const viewport = dialog.locator('[data-ui="gallery.videoReview.timelineViewport"]');
            await viewport.evaluate((node) => {
              node.scrollLeft = node.scrollWidth;
            });
            await expect
              .poll(() => viewport.evaluate((node) => node.scrollLeft))
              .toBeGreaterThan(0);
            await inspectTimelinePanes(dialog, true);
            await page.screenshot({
              path: info.outputPath(`panes-${compact}.png`),
              fullPage: false,
            });
            await zoom.fill('0');
          }
        }
      }
    } finally {
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}
