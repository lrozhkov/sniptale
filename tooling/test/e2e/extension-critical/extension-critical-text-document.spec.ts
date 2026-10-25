import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import { translate, type AppLocale } from '../../../../apps/extension/src/platform/i18n';
import {
  replayReviewHistory,
  reviewDocumentBaseline,
} from '../../../../apps/extension/src/features/video/review/document';
import type { ReviewTextFragment } from '../../../../apps/extension/src/features/video/review/text-document';
import { projectVideoProjectTextFragment } from '../../../../apps/extension/src/features/video/project/text/projection';
import { buildReviewTimeMap } from '../../../../apps/extension/src/features/video/review/timeline';
import { parseVideoWorkspace } from '../../../../apps/extension/src/composition/persistence/review-workspaces/parser';
import { seedReviewVideo } from '../support/quick-editor-media-fixture';
import {
  readNativeReviewWorkspace,
  replaceNativeReviewWorkspace,
} from '../support/native-review-workspace';
import { readNativeVideoProject } from '../support/native-video-project';
import { startHostServer } from '../support/host-server';
import {
  applyHarnessBootstrap,
  GALLERY_HARNESS_PATH,
  VIDEO_EDITOR_HARNESS_PATH,
} from '../extension-critical.helpers';

const aggregateId = 'recording:beta-v1-recording';
type Message = Parameters<typeof translate>[0];
const fragments: ReviewTextFragment[] = Array.from({ length: 56 }, (_, index) => ({
  id: `document-phrase-${index}`,
  start: 0.5 + index * 0.18,
  end: 0.66 + index * 0.18,
  text: `Phrase ${index + 1}: readable words for selection and navigation.${index % 8 === 7 ? '\n' : ''}`,
  originalText: `Phrase ${index + 1}: readable words for selection and navigation.`,
  revision: 0,
  timingRevision: 0,
  alignment: 'manual',
  timeDomain: 'source',
  showInVideo: true,
}));

async function reviewDocument(page: Page) {
  const workspace = await readNativeReviewWorkspace(page, aggregateId);
  if (!workspace) throw new Error('Expected retained review workspace');
  return {
    workspace,
    document: replayReviewHistory(
      workspace.history,
      workspace.cursor,
      workspace.source,
      reviewDocumentBaseline(workspace)
    ),
  };
}

/** Replace only a stopped fixture's content; retain its actual source and project metadata. */
async function seedDocument(page: Page) {
  const { workspace, document } = await reviewDocument(page);
  const text = { version: 1 as const, fragments };
  const candidate = {
    ...workspace,
    formatVersion: 4,
    revision: workspace.revision + 1,
    history: [],
    cursor: 0,
    advanced: { ...workspace.advanced, ...document.advancedContent, text },
    baseline: { ...document, advancedContent: { ...document.advancedContent, text } },
  };
  const admitted = parseVideoWorkspace(candidate);
  expect(admitted).not.toBeNull();
  await replaceNativeReviewWorkspace(page, aggregateId, admitted);
  const retained = await readNativeReviewWorkspace(page, aggregateId);
  expect(retained?.source).toEqual(workspace.source);
  expect(retained?.sourceAssetId).toBe(workspace.sourceAssetId);
  expect(retained?.revision).toBe(workspace.revision + 1);
  expect(retained?.advanced.ui).toMatchObject({ mode: 'advanced', modeSelectionPending: false });
  expect((await reviewDocument(page)).document.advancedContent.text?.fragments).toEqual(fragments);
}

const phrase = (root: Locator, index: number) =>
  root.locator(`[data-text-phrase-id="document-phrase-${index}"]`);
const actions = (root: Locator) => root.locator('[data-ui="text-document.actions"]');
const galleryTime = (page: Page) =>
  page
    .locator('[data-ui="gallery.videoReview.stage"] video')
    .evaluate((video: HTMLVideoElement) => video.currentTime);
const nativeTime = async (page: Page) =>
  Number(
    await page
      .locator('[data-ui="video-editor.timeline.playhead-handle"]')
      .getAttribute('aria-valuenow')
  );

async function textPoint(node: Locator, end: boolean) {
  return node.evaluate((element, last) => {
    const text = [...element.childNodes].find((child) => child.nodeType === Node.TEXT_NODE);
    if (!text?.textContent) throw new Error('Expected selectable phrase text');
    const offset = last ? Math.max(1, text.textContent.trimEnd().length - 2) : 2;
    const range = element.ownerDocument.createRange();
    range.setStart(text, offset);
    range.setEnd(text, offset + 1);
    const box = range.getBoundingClientRect();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }, end);
}

async function hoverPhrase(page: Page, node: Locator) {
  await node.scrollIntoViewIfNeeded();
  const background = () => node.evaluate((element) => getComputedStyle(element).backgroundColor);
  const original = await background();
  const point = await textPoint(node, false);
  await page.mouse.move(point.x, point.y);
  await expect.poll(background).not.toBe(original);
  await page.mouse.move(0, 0);
  await expect.poll(background).toBe(original);
}

/** Real pointer selection retains native Copy and must never activate the phrase transport. */
async function copyBlock(
  page: Page,
  root: Locator,
  readTime: () => Promise<number>,
  first: number
) {
  await page.evaluate(() => {
    const native: unknown = Reflect.get(window, '__video007NativeClipboard');
    if (!(native instanceof Clipboard)) throw new Error('Native browser Clipboard unavailable');
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: native });
  });
  await phrase(root, first).evaluate((node) => node.scrollIntoView({ block: 'center' }));
  // Centering a multiline phrase can put its first line behind the sticky commands.
  const commandsBottom = await root
    .locator('[data-ui="text-document.commands"]')
    .evaluate((node) => node.getBoundingClientRect().bottom);
  const start = await textPoint(phrase(root, first), false);
  if (start.y < commandsBottom + 8) {
    await phrase(root, first).evaluate(
      (node, delta) => {
        for (let owner = node.parentElement; owner; owner = owner.parentElement) {
          if (
            /(auto|scroll)/.test(getComputedStyle(owner).overflowY) &&
            owner.scrollHeight > owner.clientHeight
          ) {
            owner.scrollTop += delta;
            break;
          }
        }
      },
      start.y - commandsBottom - 8
    );
  }
  await expect(phrase(root, first)).toBeInViewport();
  await expect(phrase(root, first + 1)).toBeInViewport();
  const a = await textPoint(phrase(root, first), false);
  const b = await textPoint(phrase(root, first + 1), true);
  for (const [index, point] of [a, b].entries()) {
    const hit = await page.evaluate(({ x, y }) => {
      if (x < 0 || x >= innerWidth || y < 0 || y >= innerHeight) return null;
      return document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-text-phrase-id]')
        ?.dataset['textPhraseId'];
    }, point);
    expect(hit).toBe(`document-phrase-${first + index}`);
  }
  const before = await readTime();
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 12 });
  await page.mouse.up();
  await expect(actions(root)).toHaveAttribute('data-selected-count', '2');
  const selected = await page.evaluate(() => document.getSelection()?.toString() ?? '');
  expect(selected).toContain(`Phrase ${first + 2}`);
  await page.keyboard.press('Control+c');
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(selected);
  expect(await readTime()).toBeCloseTo(before, 3);
}

async function view(root: Locator, locale: AppLocale, mode: 'document' | 'cards') {
  const control = root.getByRole('button', {
    name: translate(
      mode === 'document'
        ? 'gallery.videoReview.textViewDocument'
        : 'gallery.videoReview.textViewCards',
      locale
    ),
    exact: true,
  });
  await expect(control).toBeInViewport();
  expect(
    await control.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      return (
        rect.top >= 0 &&
        rect.bottom <= innerHeight &&
        node.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2))
      );
    })
  ).toBe(true);
  await control.click();
}

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

async function galleryWidths(
  page: Page,
  dialog: Locator,
  locale: AppLocale,
  info: TestInfo,
  width: number
) {
  if (width === 1280) {
    await page.setViewportSize({ width: 1100, height: 560 });
    await phrase(dialog, 55).scrollIntoViewIfNeeded();
    await noOverflow(page);
    await page.screenshot({
      path: info.outputPath('gallery-document-narrow.png'),
      fullPage: false,
    });
    await page.setViewportSize({ width: 1280, height: 560 });
    return;
  }
  const owner = dialog.locator('.review-inspector-scroll');
  const handle = dialog.locator('[data-ui="gallery.videoReview.resizeInspector"]');
  const contentWidth = () =>
    owner.evaluate((node) => {
      const style = getComputedStyle(node);
      return node.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    });
  const initial = await contentWidth();
  for (const target of [523, 524, 525, initial]) {
    const current = await contentWidth();
    const box = (await handle.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + 12);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + current - target, box.y + 12);
    await page.mouse.up();
    await expect.poll(async () => Math.round(await contentWidth())).toBe(Math.round(target));
    await phrase(dialog, 55).scrollIntoViewIfNeeded();
    await noOverflow(page);
    await page.screenshot({
      path: info.outputPath(`gallery-document-${Math.round(target)}.png`),
      fullPage: false,
    });
  }
  await expect(
    dialog.getByRole('button', {
      name: translate('gallery.videoReview.textViewDocument', locale),
      exact: true,
    })
  ).toHaveAttribute('aria-pressed', 'true');
}

for (const variant of [
  { width: 1280, height: 560, locale: 'en', theme: 'dark' },
  { width: 1920, height: 900, locale: 'ru', theme: 'light' },
] as const) {
  test(`Text document navigation and cut ${variant.width} ${variant.locale}`, async ({
    page,
  }, info) => {
    test.setTimeout(180_000);
    page.setDefaultTimeout(15_000);
    await page.setViewportSize(variant);
    const host = await startHostServer();
    const label = (key: Message) => translate(key, variant.locale);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    try {
      await page
        .context()
        .grantPermissions(['clipboard-read', 'clipboard-write'], { origin: host.origin });
      await page.addInitScript(() => {
        Object.defineProperty(window, '__video007NativeClipboard', {
          configurable: true,
          value: navigator.clipboard,
        });
      });
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
      const openGallery = async () => {
        await page.reload();
        // The retained review adds a newer project with the same name; the original video stays last.
        await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).last().click();
        await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      };
      await openGallery();
      const dialog = page.locator('dialog');
      await dialog
        .getByRole('button', { name: label('gallery.videoReview.advancedEditing'), exact: true })
        .click();
      await expect
        .poll(async () => (await readNativeReviewWorkspace(page, aggregateId))?.advanced.ui)
        .toMatchObject({ mode: 'advanced', modeSelectionPending: false });
      await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}?theme=${variant.theme}`);
      await seedDocument(page);
      await openGallery();
      await dialog
        .getByRole('button', { name: label('gallery.videoReview.textTrackOpen'), exact: true })
        .click();
      const document = dialog.locator('[data-ui="gallery.videoReview.textDocument"]');
      await expect(document.locator('[data-text-phrase-id]')).toHaveCount(56);
      await hoverPhrase(page, phrase(document, 0));
      await expect(
        document.getByRole('button', {
          name: label('gallery.videoReview.textViewDocument'),
          exact: true,
        })
      ).toHaveAttribute('aria-pressed', 'true');
      await phrase(document, 55).click();
      await expect(phrase(document, 55)).toBeInViewport();
      await expect.poll(() => galleryTime(page)).toBeCloseTo(fragments[55]!.start, 2);
      await expect
        .poll(() =>
          dialog
            .locator('[data-ui="gallery.videoReview.stage"] video')
            .evaluate((node: HTMLVideoElement) => node.readyState >= 2 && !node.seeking)
        )
        .toBe(true);
      await view(document, variant.locale, 'cards');
      await expect(document.locator('[data-ui="text-document"]')).toHaveCount(0);
      await view(document, variant.locale, 'document');
      await expect(phrase(document, 55)).toHaveAttribute('aria-pressed', 'true');
      await page.screenshot({
        path: info.outputPath('gallery-document-last-phrase.png'),
        fullPage: false,
      });
      await phrase(document, 10).click();
      await expect.poll(() => galleryTime(page)).toBeCloseTo(fragments[10]!.start, 2);
      await phrase(document, 12).focus();
      await phrase(document, 12).press('Enter');
      await expect.poll(() => galleryTime(page)).toBeCloseTo(fragments[12]!.start, 2);
      await copyBlock(page, document, () => galleryTime(page), 3);
      const cut = actions(document).getByRole('button', {
        name: label('gallery.videoReview.textCut'),
        exact: true,
      });
      await expect(cut).toBeEnabled();
      await phrase(document, 3).click();
      await phrase(document, 5).click({ modifiers: ['Control'] });
      await expect(actions(document)).toHaveAttribute('data-selected-count', '2');
      await expect(cut).toBeDisabled();
      const subtitles = actions(document).getByRole('button', {
        name: label('gallery.videoReview.subtitlesSelected'),
        exact: true,
      });
      await subtitles.click();
      const form = dialog.locator('[data-ui="gallery.videoReview.textSubtitles"]');
      await expect(form).toBeVisible();
      await expect(form).toContainText(
        label('gallery.videoReview.textRewriteSelectedScope').replace('{count}', '2')
      );
      await form
        .getByRole('button', { name: label('gallery.videoReview.textVoiceBack'), exact: true })
        .click();
      await expect(subtitles).toBeFocused();
      await copyBlock(page, document, () => galleryTime(page), 3);
      const before = await reviewDocument(page);
      await cut.click();
      await expect
        .poll(
          async () =>
            (await reviewDocument(page)).document.edits.filter((edit) => edit.kind === 'cut').length
        )
        .toBe(1);
      const after = await reviewDocument(page);
      expect(after.document.advancedContent.text).toEqual(before.document.advancedContent.text);
      const mapped = buildReviewTimeMap(after.workspace.source.duration, after.document.edits);
      expect(mapped.at(-1)!.resultEnd).toBeLessThan(after.workspace.source.duration);
      const resultClock = dialog.locator('[data-toolbar-transport] output');
      await expect(resultClock).toHaveAttribute(
        'title',
        label('gallery.videoReview.resultDuration')
      );
      // The existing reviewTimeLabel readout uses tenths; this fixture remains below one minute.
      expect(mapped.at(-1)!.resultEnd).toBeLessThan(60);
      const resultTenths = Math.round(mapped.at(-1)!.resultEnd * 10) / 10;
      await expect(resultClock).toHaveText(`→ ${resultTenths.toFixed(1)}`);
      const retainedCut = after.document.edits.find((edit) => edit.kind === 'cut')!;
      expect(retainedCut.requestedStart).toBeCloseTo(fragments[3]!.start, 6);
      expect(retainedCut.requestedEnd).toBeCloseTo(fragments[4]!.end, 6);
      await dialog
        .getByRole('button', { name: label('gallery.videoReview.undo'), exact: true })
        .click();
      await expect.poll(async () => (await reviewDocument(page)).document.edits.length).toBe(0);
      await dialog
        .getByRole('button', { name: label('gallery.videoReview.redo'), exact: true })
        .click();
      await expect.poll(async () => (await reviewDocument(page)).document.edits.length).toBe(1);
      await dialog
        .getByRole('button', { name: label('gallery.videoReview.textTrackOpen'), exact: true })
        .click();
      await galleryWidths(page, dialog, variant.locale, info, variant.width);
      await phrase(document, 10).click();
      await actions(document)
        .getByRole('button', { name: label('gallery.videoReview.textPlayFromHere'), exact: true })
        .click();
      const video = dialog.locator('[data-ui="gallery.videoReview.stage"] video');
      await expect.poll(() => video.evaluate((node: HTMLVideoElement) => node.paused)).toBe(false);
      await video.evaluate((node: HTMLVideoElement) => node.pause());
      await expect.poll(() => video.evaluate((node: HTMLVideoElement) => node.paused)).toBe(true);
      await view(document, variant.locale, 'cards');
      await expect(document.locator('[data-ui="text-document"]')).toHaveCount(0);
      await view(document, variant.locale, 'document');
      await expect(document.locator('[data-text-phrase-id]')).toHaveCount(56);
      await dialog.locator('[data-ui="gallery.videoReview.openExport"]').click();
      await dialog.locator('[data-ui="gallery.videoReview.openVideoEditor"]').click();
      await expect
        .poll(
          async () =>
            (await page.evaluate(() => window.__sniptaleHarness?.getCreatedTabs() ?? [])).length
        )
        .toBe(1);
      const [tab] = await page.evaluate(() => window.__sniptaleHarness?.getCreatedTabs() ?? []);
      const target = new URL(tab!.url!);
      await page.goto(`${host.origin}${VIDEO_EDITOR_HARNESS_PATH}${target.search}`);
      await expect(page.locator('[data-ui="video-editor.timeline.surface"]')).toBeVisible();
      await expect.poll(() => readNativeVideoProject(page)).toBeDefined();
      await page
        .getByRole('button', { name: label('videoEditor.sidebar.sceneProperties'), exact: true })
        .click();
      await page
        .getByRole('button', { name: label('videoEditor.sidebar.textDocuments'), exact: true })
        .click();
      const native = page.locator('[data-ui="video-editor.text.panel"]');
      await expect(native.locator('[data-text-phrase-id]')).toHaveCount(56);
      await expect(
        actions(native).getByRole('button', {
          name: label('gallery.videoReview.textCut'),
          exact: true,
        })
      ).toHaveCount(0);
      await phrase(native, 55).click();
      await expect(phrase(native, 55)).toBeInViewport();
      await expect.poll(() => nativeTime(page)).toBeGreaterThan(9);
      await view(native, variant.locale, 'cards');
      await view(native, variant.locale, 'document');
      await expect(phrase(native, 55)).toHaveAttribute('aria-pressed', 'true');
      await page.screenshot({
        path: info.outputPath('native-document-last-phrase.png'),
        fullPage: false,
      });
      await phrase(native, 10).click();
      const project = (await readNativeVideoProject(page))!;
      const entry = project.textDocuments!.find((item) =>
        item.document.fragments.some((fragment) => fragment.id === fragments[10]!.id)
      )!;
      expect(entry.document.fragments).toEqual(fragments);
      const projected = projectVideoProjectTextFragment(project, entry, fragments[10]!);
      await expect.poll(() => nativeTime(page)).toBeCloseTo(projected.ranges[0]!.start, 2);
      await copyBlock(page, native, () => nativeTime(page), 10);
      await phrase(native, 12).focus();
      await phrase(native, 12).press('Space');
      const keyboardProjection = projectVideoProjectTextFragment(project, entry, fragments[12]!);
      await expect.poll(() => nativeTime(page)).toBeCloseTo(keyboardProjection.ranges[0]!.start, 2);
      await phrase(native, 10).focus();
      await phrase(native, 10).press('Enter');
      await expect.poll(() => nativeTime(page)).toBeCloseTo(projected.ranges[0]!.start, 2);
      await actions(native)
        .getByRole('button', { name: label('gallery.videoReview.textPlayFromHere'), exact: true })
        .click();
      await expect.poll(() => nativeTime(page)).toBeGreaterThan(projected.ranges[0]!.start + 0.03);
      await page
        .locator('[data-ui="video-editor.timeline.toolbar"]')
        .getByRole('button', { name: label('videoEditor.timeline.pause'), exact: true })
        .click();
      await actions(native)
        .getByRole('button', { name: label('gallery.videoReview.textPhraseEdit'), exact: true })
        .click();
      const field = native.getByRole('textbox', {
        name: label('gallery.videoReview.speechText'),
        exact: true,
      });
      const invalid = 'x'.repeat(16_001);
      await field.fill(invalid);
      await expect(field).toHaveAttribute('aria-invalid', 'true');
      await view(native, variant.locale, 'cards');
      await expect(field).toHaveValue(invalid);
      await view(native, variant.locale, 'document');
      await expect(field).toHaveValue(invalid);
      const repaired = 'Repaired document phrase';
      await field.fill(repaired);
      await field.press('Tab');
      await expect
        .poll(
          async () =>
            (await readNativeVideoProject(page))?.textDocuments
              ?.find((item) => item.id === entry.id)
              ?.document.fragments.find((fragment) => fragment.id === fragments[10]!.id)?.text
        )
        .toBe(repaired);
      await expect(field).toHaveAttribute('aria-invalid', 'false');
      await page.screenshot({
        path: info.outputPath('native-document-repaired.png'),
        fullPage: false,
      });
      if (variant.width === 1280) {
        await page.setViewportSize({ width: 1100, height: 560 });
        await field.scrollIntoViewIfNeeded();
        await noOverflow(page);
        await page.screenshot({
          path: info.outputPath('native-document-narrow.png'),
          fullPage: false,
        });
        await page.setViewportSize({ width: 1280, height: 560 });
      }
      if (variant.width === 1920) {
        const inspector = page.locator('[data-ui="video-editor.floating.context-inspector"]');
        const handle = page.locator('[data-ui="video-editor.floating.context-inspector.resize"]');
        for (const width of [359, 360, 361]) {
          const current = (await inspector.boundingBox())!.width;
          const box = (await handle.boundingBox())!;
          await page.mouse.move(box.x + box.width / 2, box.y + 12);
          await page.mouse.down();
          await page.mouse.move(box.x + box.width / 2 + current - width, box.y + 12);
          await page.mouse.up();
          await expect
            .poll(async () => Math.round((await inspector.boundingBox())!.width))
            .toBe(width);
          await phrase(native, 55).scrollIntoViewIfNeeded();
          await expect(phrase(native, 55)).toBeInViewport();
          expect(await inspector.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(
            true
          );
          await page.screenshot({
            path: info.outputPath(`native-document-${width}.png`),
            fullPage: false,
          });
        }
      }
      const saved = (await readNativeVideoProject(page))!;
      await page.goto(`${host.origin}${VIDEO_EDITOR_HARNESS_PATH}?project=${saved.id}`);
      await page
        .getByRole('button', { name: label('videoEditor.sidebar.sceneProperties'), exact: true })
        .click();
      await page
        .getByRole('button', { name: label('videoEditor.sidebar.textDocuments'), exact: true })
        .click();
      await expect(phrase(native, 10)).toHaveText(repaired);
      await expect(native.locator('[data-text-phrase-id]')).toHaveCount(56);
      expect(errors).toEqual([]);
    } finally {
      await new Promise<void>((resolve, reject) =>
        host.server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });
}
