import { chooseInspectorValue } from '../support/inspector-utilities';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { seedReviewVideo } from '../support/quick-editor-media-fixture';
import { startHostServer } from '../support/host-server';
import { applyHarnessBootstrap, GALLERY_HARNESS_PATH } from '../extension-critical.helpers';
import {
  installSpeechPortFixture,
  persistedSpeech,
  persistedReviewContent,
  syntheticSpeechWav,
} from '../support/voiceover-speech-fixture';
import { installTextPortFixture, textModelResponse } from '../support/text-rewrite-fixture';

async function parseNativeSubtitles(page: Page, text: string) {
  return page.evaluate(async (content) => {
    const video = document.createElement('video');
    const track = document.createElement('track');
    const url = URL.createObjectURL(new Blob([content], { type: 'text/vtt' }));
    track.src = url;
    video.append(track);
    document.body.append(video);
    track.track.mode = 'hidden';
    try {
      await new Promise<void>((resolve, reject) => {
        track.onload = () => resolve();
        track.onerror = () => reject(new Error('Native WebVTT parser refused downloaded file'));
      });
      return [...(track.track.cues ?? [])].map((cue) => {
        if (!(cue instanceof VTTCue)) throw new Error('Unexpected native subtitle cue');
        return { start: cue.startTime, end: cue.endTime, text: cue.getCueAsHTML().textContent };
      });
    } finally {
      video.remove();
      URL.revokeObjectURL(url);
    }
  }, text);
}

async function checkSubtitles(
  page: Page,
  dialog: Locator,
  label: (key: Parameters<typeof translate>[0]) => string,
  outputPath: (name: string) => string,
  height: number
) {
  const document = dialog.locator('[data-ui="gallery.videoReview.textDocument"]');
  const second = document.locator('[data-ui="gallery.videoReview.textPhrase"]').nth(1);
  const expand = second.locator('button[aria-expanded]');
  if ((await expand.getAttribute('aria-expanded')) === 'false') await expand.click();
  const literal = 'Вторая фраза — Łukasz 中文 <b>& -->\n\nСледующая строка';
  await second
    .getByRole('textbox', { name: label('gallery.videoReview.speechText'), exact: true })
    .fill(literal);
  await expect
    .poll(async () => (await persistedReviewContent(page))!.text!.fragments[1]!.text)
    .toBe(literal);
  const before = (await persistedReviewContent(page))!;
  await document.getByRole('searchbox').fill('Вторая');
  await document
    .getByRole('button', { name: label('gallery.videoReview.subtitlesTitle'), exact: true })
    .click();
  const form = dialog.locator('[data-ui="gallery.videoReview.textSubtitles"]');
  await expect(document).toHaveCount(0);
  await form
    .getByRole('button', { name: label('gallery.videoReview.textVoiceBack'), exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: outputPath('subtitles-options.png'), fullPage: false });
  await expect(form).toContainText(
    label('gallery.videoReview.subtitlesCount').replace('{count}', '2')
  );
  await form
    .locator('summary')
    .filter({ hasText: label('gallery.videoReview.subtitlesPreview') })
    .click();
  await expect(form.locator('pre')).toContainText('Первая фраза');
  for (const width of [523, 524, 525]) {
    await resizeInspectorContent(page, dialog, width);
    await form
      .getByRole('button', { name: label('gallery.videoReview.subtitlesDownload'), exact: true })
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      path: outputPath(`subtitles-inspector-${width}.png`),
      fullPage: false,
    });
  }
  const launch = form.getByRole('button', {
    name: label('gallery.videoReview.subtitlesDownload'),
    exact: true,
  });
  await launch.scrollIntoViewIfNeeded();
  const box = (await launch.boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(height);
  const downloaded = page.waitForEvent('download');
  await launch.click();
  const file = await downloaded;
  expect(file.suggestedFilename()).toBe('subtitles.vtt');
  await file.saveAs(outputPath('subtitles.vtt'));
  const text = await readFile(outputPath('subtitles.vtt'), 'utf8');
  const cues = await parseNativeSubtitles(page, text);
  expect(cues).toHaveLength(2);
  expect(cues.map((cue) => cue.text?.replace(/\u00a0/g, ''))).toEqual(
    before.text!.fragments.map((fragment) => fragment.text)
  );
  expect(cues[0]).toMatchObject({
    start: before.text!.fragments[0]!.start,
    end: before.text!.fragments[0]!.end,
  });
  await expect(launch).toBeEnabled();
  await form
    .getByRole('button', { name: label('gallery.videoReview.subtitlesFormat'), exact: true })
    .click();
  await page.getByRole('option', { name: 'SRT', exact: true }).click();
  await expect(form).toContainText(label('gallery.videoReview.subtitlesOverlap'));
  await form
    .getByRole('switch', { name: label('gallery.videoReview.subtitlesNormalize'), exact: true })
    .click();
  await expect(form).toContainText(label('gallery.videoReview.subtitlesNormalized'));
  const srtDownload = page.waitForEvent('download');
  await launch.click();
  const srt = await srtDownload;
  await srt.saveAs(outputPath('subtitles.srt'));
  expect(await readFile(outputPath('subtitles.srt'), 'utf8')).toContain(
    'Первая фраза\nВторая фраза'
  );
  await form
    .getByRole('button', { name: label('gallery.videoReview.textVoiceBack'), exact: true })
    .click();
  await expect(
    document.getByRole('button', { name: label('gallery.videoReview.subtitlesTitle'), exact: true })
  ).toBeFocused();
  await expect(document.getByRole('searchbox')).toHaveValue('Вторая');
  await document.getByRole('searchbox').fill('');
  expect((await persistedReviewContent(page))!.text).toEqual(before.text);
  expect((await persistedReviewContent(page))!.audio).toEqual(before.audio);
}

async function checkFullTextRewrite(
  page: Page,
  dialog: Locator,
  label: (key: Parameters<typeof translate>[0]) => string,
  capture: (name: string) => Promise<unknown>
) {
  const document = dialog.locator('[data-ui="gallery.videoReview.textDocument"]');
  const before = await persistedReviewContent(page);
  await document.getByRole('searchbox').fill('Вторая');
  await expect(document.locator('[data-ui="gallery.videoReview.textPhrase"]')).toHaveCount(1);
  await document
    .getByRole('button', { name: label('gallery.videoReview.textRewriteAll'), exact: true })
    .click();
  const form = dialog.locator('[data-ui="gallery.videoReview.textRewrite"]');
  await expect(form).toContainText(
    label('gallery.videoReview.textRewriteAllScope').replace('{count}', '2')
  );
  await form
    .getByRole('textbox', { name: label('gallery.videoReview.textRewritePrompt'), exact: true })
    .fill('Перепиши весь сценарий');
  await chooseInspectorValue(
    page,
    form,
    label('gallery.videoReview.textRewriteMode'),
    label('gallery.videoReview.textRewriteScript')
  );

  await expect(
    form.getByRole('switch', {
      name: label('gallery.videoReview.textRewriteStructure'),
      exact: true,
    })
  ).toHaveCount(0);
  await form
    .getByRole('switch', { name: label('gallery.videoReview.textRewriteTiming'), exact: true })
    .click();
  const structure = form.getByRole('switch', {
    name: label('gallery.videoReview.textRewriteStructure'),
    exact: true,
  });
  await expect(structure).toHaveAttribute('aria-checked', 'false');
  await structure.click();
  await expect(structure).toHaveAttribute('aria-checked', 'true');
  await capture('text-rewrite-permissions.png');
  await form
    .getByRole('button', { name: label('gallery.videoReview.textRewriteStart'), exact: true })
    .click();
  await expect(form).toContainText(
    label('gallery.videoReview.textRewritePreview').replace('{count}', '1')
  );
  await form
    .locator('summary')
    .filter({ hasText: label('gallery.videoReview.textRewriteMapping') })
    .click();
  const sourceName = label('gallery.videoReview.textRewriteSource').replace('{index}', '1');
  await expect(form.getByRole('button', { name: sourceName, exact: true })).toHaveCount(2);
  await form
    .getByRole('button', {
      name: label('gallery.videoReview.textRewriteSourceRemove').replace('{index}', '1'),
      exact: true,
    })
    .nth(1)
    .click();
  await form
    .getByRole('button', {
      name: label('gallery.videoReview.textRewriteSourceAdd').replace('{index}', '1'),
      exact: true,
    })
    .click();
  await page.getByRole('option').filter({ hasText: before!.text!.fragments[1]!.text }).click();
  await expect(form.getByRole('button', { name: sourceName, exact: true })).toHaveCount(2);
  await capture('text-rewrite-mapping.png');
  await form
    .getByRole('button', { name: label('gallery.videoReview.textRewriteVariant'), exact: true })
    .click();
  await expect(form).toContainText(label('gallery.videoReview.textRewriteApplied'));
  const after = (await persistedReviewContent(page))!;
  expect(after.audio).toEqual(before!.audio);
  expect(after.text!.fragments.slice(0, 2)).toEqual(before!.text!.fragments);
  expect(after.text!.fragments[2]).toMatchObject({
    showInVideo: false,
    timeDomain: 'result',
    derivedFrom: before!.text!.fragments.map((fragment) => fragment.id),
  });
  await form
    .getByRole('button', { name: label('gallery.videoReview.textVoiceBack'), exact: true })
    .click();
  await expect(document.getByRole('searchbox')).toHaveValue('Вторая');
  await document.getByRole('searchbox').fill('');
  await dialog
    .getByRole('button', { name: label('gallery.videoReview.undo'), exact: true })
    .click();
  await expect
    .poll(async () => (await persistedReviewContent(page))!.text!.fragments.length)
    .toBe(2);
}

async function checkTextRewrite(
  page: Page,
  dialog: Locator,
  label: (key: Parameters<typeof translate>[0]) => string,
  capture: (name: string) => Promise<unknown>,
  viewportHeight: number
) {
  const before = await persistedReviewContent(page);
  const audio = structuredClone(before!.audio);
  const originalText = before!.text!.fragments[0]!.text;
  await dialog
    .getByRole('button', { name: label('gallery.videoReview.textRewriteTitle'), exact: true })
    .click();
  const form = dialog.locator('[data-ui="gallery.videoReview.textRewrite"]');
  await expect(form).toBeVisible();
  await expect(form).not.toContainText(
    label('gallery.videoReview.textRewriteSelectedScope').replace('{count}', '1')
  );
  await expect(form).toContainText(label('gallery.videoReview.textRewriteDisclosure'));
  await expect(
    form.getByText(label('gallery.videoReview.textRewriteDisclosure'), { exact: true })
  ).toContainText(/В истории AI|AI history/);
  await expect(form.locator('pre')).toHaveCount(0);
  await expect(dialog.locator('[data-ui="gallery.videoReview.textVoice"]')).toHaveCount(0);
  await expect(
    form.getByRole('switch', { name: label('gallery.videoReview.textRewriteTiming'), exact: true })
  ).toHaveAttribute('aria-checked', 'false');
  await expect(
    form.getByRole('switch', {
      name: label('gallery.videoReview.textRewriteStructure'),
      exact: true,
    })
  ).toHaveCount(0);
  await form
    .getByRole('textbox', { name: label('gallery.videoReview.textRewritePrompt'), exact: true })
    .fill('Сократи текст');
  const start = form.getByRole('button', {
    name: label('gallery.videoReview.textRewriteStart'),
    exact: true,
  });
  await expect(start).toBeEnabled();
  await capture('text-rewrite-form.png');
  await start.click();
  await expect(form.locator('svg.animate-spin')).toBeVisible();
  await form.getByRole('button', { name: label('common.actions.cancel'), exact: true }).click();
  await expect(form.locator('svg.animate-spin')).toHaveCount(0);
  await expect(start).toBeEnabled();
  await start.click();
  await expect(form.locator('svg.animate-spin')).toBeVisible();
  await capture('text-rewrite-waiting.png');
  const result = form.getByRole('textbox', {
    name: label('gallery.videoReview.textRewriteResult').replace('{index}', '1'),
    exact: true,
  });
  await expect(result).toHaveValue(`AI: ${originalText}`);
  expect((await persistedReviewContent(page))!.text).toEqual(before!.text);
  const replacement = `Изменено: ${originalText}`;
  await result.fill(replacement);
  const replace = form.getByRole('button', {
    name: label('gallery.videoReview.textRewriteReplace'),
    exact: true,
  });
  await replace.scrollIntoViewIfNeeded();
  const box = (await replace.boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(viewportHeight);
  await capture('text-rewrite-preview.png');
  await replace.click();
  await expect(form).toContainText(label('gallery.videoReview.textRewriteApplied'));
  const after = (await persistedReviewContent(page))!;
  expect(after.audio).toEqual(audio);
  expect(after.text!.fragments[0]!.text).toBe(replacement);
  expect(after.text!.fragments[0]!.id).toBe(before!.text!.fragments[0]!.id);
  await form
    .getByRole('button', { name: label('gallery.videoReview.textVoiceBack'), exact: true })
    .click();
  await expect(
    dialog.getByRole('button', { name: label('gallery.videoReview.textRewriteTitle'), exact: true })
  ).toBeFocused();
  await dialog
    .getByRole('button', { name: label('gallery.videoReview.undo'), exact: true })
    .click();
  await expect(
    dialog.getByRole('textbox', { name: label('gallery.videoReview.speechText'), exact: true })
  ).toHaveValue(originalText);
  expect((await persistedReviewContent(page))!.text).toEqual(before!.text);
  await dialog
    .getByRole('button', { name: label('gallery.videoReview.textRewriteTitle'), exact: true })
    .click();
  await form
    .getByRole('textbox', { name: label('gallery.videoReview.textRewritePrompt'), exact: true })
    .fill('Предложи альтернативу');
  await start.click();
  await expect(result).toHaveValue(`AI: ${originalText}`);
  await form
    .getByRole('button', { name: label('gallery.videoReview.textRewriteVariant'), exact: true })
    .click();
  await expect(form).toContainText(label('gallery.videoReview.textRewriteApplied'));
  const alternative = (await persistedReviewContent(page))!;
  expect(alternative.audio).toEqual(audio);
  expect(alternative.text!.fragments.slice(0, 2)).toEqual(before!.text!.fragments);
  expect(alternative.text!.fragments[2]!.showInVideo).toBe(false);
  await form
    .getByRole('button', { name: label('gallery.videoReview.textVoiceBack'), exact: true })
    .click();
  await dialog
    .getByRole('button', { name: label('gallery.videoReview.undo'), exact: true })
    .click();
  await expect
    .poll(async () => (await persistedReviewContent(page))!.text!.fragments.length)
    .toBe(2);
  expect((await persistedReviewContent(page))!.text).toEqual(before!.text);
}

async function checkLocalTakes(
  page: Page,
  voice: Locator,
  takes: Locator,
  label: (key: Parameters<typeof translate>[0]) => string,
  capture: (name: string) => Promise<unknown>
) {
  const button = (key: Parameters<typeof translate>[0]) =>
    voice.getByRole('button', { name: label(key), exact: true });
  const muteSource = voice.getByRole('switch', {
    name: label('gallery.videoReview.textVoiceMuteSource'),
    exact: true,
  });
  await expect(muteSource).toBeEnabled();
  if ((await muteSource.getAttribute('aria-checked')) === 'false') await muteSource.click();
  await button('gallery.videoReview.textVoiceMicrophone').click();
  const recording = voice.locator('[data-ui="gallery.videoReview.textVoiceRecording"]');
  await expect(recording).toBeVisible();
  await expect(recording.locator('dialog')).toHaveCount(0);
  await page.evaluate(() => {
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      configurable: true,
      value: async () => {
        const context = new AudioContext();
        const oscillator = context.createOscillator();
        const destination = context.createMediaStreamDestination();
        oscillator.connect(destination);
        oscillator.start();
        return destination.stream;
      },
    });
  });
  await button('videoEditor.app.recordAudioStart').click();
  await expect(recording.getByRole('meter')).toBeVisible();
  await button('videoEditor.app.recordAudioPause').click();
  const dialog = voice.locator('xpath=ancestor::dialog[1]');
  const inspectorWidth = await dialog
    .locator('.review-inspector-scroll')
    .evaluate((element) => Number.parseFloat(getComputedStyle(element).width));
  for (const width of [420, 640, inspectorWidth]) {
    await resizeInspectorContent(page, dialog, width);
    await expect(recording.getByRole('meter')).toBeVisible();
  }
  await button('videoEditor.app.recordAudioResume').click();
  // MediaRecorder needs elapsed media time to produce an actual decodable take.
  await page.waitForTimeout(1200);
  await button('videoEditor.app.recordAudioStop').click();
  const apply = button('gallery.videoReview.textVoiceLocalSave');
  await expect(apply).toBeEnabled();
  await apply.scrollIntoViewIfNeeded();
  await capture('text-voice-microphone.png');
  await expect(takes).toHaveCount(1);
  await apply.click();
  await expect(takes).toHaveCount(2);
  await button('gallery.videoReview.textVoiceGallery').click();
  await button('gallery.videoReview.textVoiceChooseAudio').click();
  const drawer = page.getByRole('dialog', {
    name: label('gallery.videoReview.textVoiceAudioGallery'),
    exact: true,
  });
  await expect(drawer).toBeVisible();
  await drawer.locator('input[type="file"]').setInputFiles({
    name: 'text-gallery.wav',
    mimeType: 'audio/wav',
    buffer: syntheticSpeechWav(1),
  });
  await expect(drawer).toHaveCount(0);
  await expect(takes).toHaveCount(2);
  await voice
    .getByRole('button', { name: label('gallery.videoReview.speechApply'), exact: true })
    .click();
  await expect(takes).toHaveCount(3);
  await button('gallery.videoReview.textVoiceChooseAudio').click();
  await expect(drawer).toBeVisible();
  await drawer.getByRole('searchbox').fill('text-gallery');
  await expect(drawer.locator('li')).toHaveCount(1);
  const play = drawer.getByRole('button', {
    name: `${label('gallery.videoReview.musicPlay')}: text-gallery.wav`,
    exact: true,
  });
  await play.click();
  await expect(
    drawer.getByRole('button', {
      name: `${label('gallery.videoReview.musicStop')}: text-gallery.wav`,
      exact: true,
    })
  ).toBeVisible();
  await capture('text-voice-gallery.png');
  await drawer
    .getByRole('button', {
      name: `${label('gallery.videoReview.musicAdd')}: text-gallery.wav`,
      exact: true,
    })
    .click();
  await expect(drawer).toHaveCount(0);
  await expect(takes).toHaveCount(3);
  await voice
    .getByRole('button', { name: label('gallery.videoReview.speechApply'), exact: true })
    .click();
  await expect(takes).toHaveCount(4);
  for (const width of [420, 640, inspectorWidth]) {
    await resizeInspectorContent(page, dialog, width);
    await expect(takes).toHaveCount(4);
  }
  const persisted = await persistedSpeech(page);
  expect(persisted?.clips.map((clip) => clip.textSnapshot?.kind)).toEqual([
    'ai',
    'microphone',
    'gallery',
    'gallery',
  ]);
  expect(persisted?.clips[3]?.assetId).toBe(persisted?.clips[2]?.assetId);
  const sourceRanges = page.locator('[data-original-audio-lane] button[data-audio-id]');
  await expect(sourceRanges).toHaveCount(4);
  const rectangles = await sourceRanges.evaluateAll((items) =>
    items.map((item) => {
      const { x, y, width, height } = item.getBoundingClientRect();
      return { x, y, width, height };
    })
  );
  for (const [index, rectangle] of rectangles.entries())
    for (const other of rectangles.slice(index + 1)) {
      if (rectangle.x < other.x + other.width && other.x < rectangle.x + rectangle.width)
        expect(
          rectangle.y + rectangle.height <= other.y || other.y + other.height <= rectangle.y
        ).toBe(true);
    }
  const lowest = await sourceRanges.evaluateAll(
    (items) =>
      items.reduce(
        (chosen, item, index) =>
          Number.parseFloat((item as HTMLElement).style.top) > chosen.top
            ? { index, top: Number.parseFloat((item as HTMLElement).style.top) }
            : chosen,
        { index: 0, top: -1 }
      ).index
  );
  await sourceRanges.nth(lowest).scrollIntoViewIfNeeded();
  await expect(sourceRanges.nth(lowest)).toBeInViewport();
  await capture('text-voice-source-mute-rows.png');
  expect(
    persisted?.clips.slice(1).every((clip) => clip.textSnapshot?.text === 'Первая фраза')
  ).toBe(true);
}

async function checkTextGesture(page: Page, block: Locator, undo: Locator, redo: Locator) {
  await block.scrollIntoViewIfNeeded();
  await block.evaluate((element) => {
    const viewport = element.closest<HTMLElement>(
      '[data-ui="gallery.videoReview.timelineViewport"]'
    )!;
    const ruler = viewport.querySelector<HTMLElement>('[data-ui="gallery.videoReview.rulerRow"]')!;
    viewport.scrollLeft = 0;
    viewport.scrollTop +=
      element.getBoundingClientRect().top -
      viewport.getBoundingClientRect().top -
      ruler.getBoundingClientRect().height -
      4;
  });
  const initial = (await block.boundingBox())!;
  await expect
    .poll(() =>
      block.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return element.contains(document.elementFromPoint(rect.x + 20, rect.y + rect.height / 2));
      })
    )
    .toBe(true);
  const drag = async () => {
    await page.mouse.move(initial.x + 20, initial.y + initial.height / 2);
    await page.mouse.down();
    await page.mouse.move(initial.x + 50, initial.y + initial.height / 2, { steps: 5 });
  };
  await drag();
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect.poll(async () => (await block.boundingBox())!.x).toBeCloseTo(initial.x, 0);
  await drag();
  await page.mouse.up();
  await expect.poll(async () => (await block.boundingBox())!.x).toBeGreaterThan(initial.x + 20);
  await undo.click();
  await expect.poll(async () => (await block.boundingBox())!.x).toBeCloseTo(initial.x, 0);
  await redo.click();
  await expect.poll(async () => (await block.boundingBox())!.x).toBeGreaterThan(initial.x + 20);
}

async function resizeInspectorContent(page: Page, dialog: Locator, width: number) {
  const content = dialog.locator('.review-inspector-scroll');
  const readWidth = () =>
    content.evaluate((element) => Number.parseFloat(getComputedStyle(element).width));
  const current = await readWidth();
  const handle = (await dialog
    .locator('[data-ui="gallery.videoReview.resizeInspector"]')
    .boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + 20);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2 - (width - current), handle.y + 20, {
    steps: 12,
  });
  await page.mouse.up();
  await expect.poll(readWidth).toBe(width);
}

async function inspectTextSearch(
  document: Locator,
  page: Page,
  locale: 'ru' | 'en',
  screenshot: string
) {
  const label = (key: Parameters<typeof translate>[0]) => translate(key, locale);
  const search = document.getByRole('searchbox');
  const commands = [
    'gallery.videoReview.subtitlesTitle',
    'gallery.videoReview.textRewriteAll',
    'gallery.videoReview.textFragmentAdd',
  ] as const;
  const searchBox = (await search.boundingBox())!;
  for (const key of commands) {
    const command = document.getByRole('button', { name: label(key), exact: true });
    const box = (await command.boundingBox())!;
    expect(
      Math.abs(box.y + box.height / 2 - searchBox.y - searchBox.height / 2)
    ).toBeLessThanOrEqual(1);
    expect(box.x).toBeGreaterThan(searchBox.x + searchBox.width);
    await expect(command).toHaveCSS('border-top-color', 'rgba(0, 0, 0, 0)');
  }
  await expect(search).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(search).toHaveCSS('border-top-width', '0px');
  const geometry = await search.evaluate((node) => {
    const parent = node.parentElement!;
    const style = getComputedStyle(parent);
    const icon = parent.querySelector('svg')!;
    return {
      width: node.getBoundingClientRect().width,
      available:
        parent.clientWidth -
        parseFloat(style.paddingLeft) -
        parseFloat(style.paddingRight) -
        icon.getBoundingClientRect().width -
        parseFloat(style.columnGap),
    };
  });
  expect(Math.abs(geometry.width - geometry.available)).toBeLessThanOrEqual(1);
  const toggle = document.getByRole('button', {
    name: label('gallery.videoReview.textFragmentFilters'),
    exact: true,
  });
  const dot = toggle.locator('.review-history-filter-dot');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(toggle).not.toHaveAttribute('data-active', 'true');
  await expect(dot).toHaveCount(0);
  await toggle.click();
  await expect(toggle).toHaveAttribute('data-active', 'true');
  await expect(dot).toHaveCount(0);
  await search.fill('Длинный поисковый запрос для проверки ширины');
  await expect(dot).toBeVisible();
  await expect(toggle).toHaveAttribute(
    'aria-description',
    label('gallery.videoReview.historyFiltersActive')
  );
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(toggle).not.toHaveAttribute('data-active', 'true');
  await expect(dot).toBeVisible();
  await expect(search).toHaveValue('Длинный поисковый запрос для проверки ширины');
  await document
    .getByRole('button', { name: label('gallery.videoReview.historySearchClear'), exact: true })
    .click();
  await expect(search).toBeFocused();
  await expect(dot).toHaveCount(0);
  await toggle.click();
  await search.focus();
  const activeColor = await toggle.evaluate((node) => {
    const probe = document.createElement('span');
    probe.style.color = 'var(--sniptale-color-text-primary)';
    node.append(probe);
    const expected = getComputedStyle(probe).color;
    probe.remove();
    return expected;
  });
  await expect(toggle).toHaveCSS('color', activeColor);
  await expect(search).toHaveCSS('outline-style', 'none');
  await page.screenshot({ path: screenshot, fullPage: false });
  await toggle.click();
}

for (const variant of [
  { width: 1280, height: 560, locale: 'ru', theme: 'light' },
  { width: 1920, height: 900, locale: 'en', theme: 'dark' },
  { width: 1280, height: 560, locale: 'ru', theme: 'dark' },
  { width: 1920, height: 900, locale: 'en', theme: 'light' },
  { width: 960, height: 560, locale: 'ru', theme: 'dark' },
] as const) {
  test(`text search filters ${variant.width} ${variant.locale} ${variant.theme}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: variant.width, height: variant.height });
    const host = await startHostServer();
    const label = (key: Parameters<typeof translate>[0]) => translate(key, variant.locale);
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
      await dialog
        .getByRole('button', { name: label('gallery.videoReview.advancedEditing'), exact: true })
        .click();
      await dialog
        .getByRole('button', { name: label('gallery.videoReview.textTrackOpen'), exact: true })
        .click();
      await inspectTextSearch(
        dialog.locator('[data-ui="gallery.videoReview.textDocument"]'),
        page,
        variant.locale,
        info.outputPath('text-search-filters.png')
      );
      const document = dialog.locator('[data-ui="gallery.videoReview.textDocument"]');
      for (const text of ['Первая фраза', 'Вторая фраза с длинным названием']) {
        await document
          .getByRole('button', {
            name: label('gallery.videoReview.textFragmentAdd'),
            exact: true,
          })
          .click();
        const field = document.getByRole('textbox', {
          name: label('gallery.videoReview.speechText'),
          exact: true,
        });
        await field.fill(text);
        await field.press('Tab');
      }
      const cards = document.locator('[data-ui="gallery.videoReview.textPhrase"]');
      const second = cards.nth(1);
      const expand = second.locator('button[aria-expanded]');
      await expand.click();
      await expect(expand).toHaveAttribute('aria-expanded', 'false');
      const jump = second.getByRole('button', {
        name: label('gallery.videoReview.speechJump'),
        exact: true,
      });
      await expect(jump).toContainText('2');
      await expect(jump).toHaveAttribute('aria-description', /^2 · \d{2}:/);
      await expect(jump).toContainText(/\d{2}:\d{2}\.\d{2}–\d{2}:\d{2}\.\d{2}/);
      await jump.click();
      await expect(expand).toHaveAttribute('aria-expanded', 'false');
      const inspector = dialog.locator('.review-inspector-scroll');
      const initialWidth = await inspector.evaluate((node) =>
        Number.parseFloat(getComputedStyle(node).width)
      );
      for (const width of [initialWidth, 523, 524, 525]) {
        if (variant.width !== 1920 && width !== initialWidth) continue;
        if (width !== initialWidth) await resizeInspectorContent(page, dialog, width);
        await jump.scrollIntoViewIfNeeded();
        const bounds = (await inspector.boundingBox())!;
        for (const control of [jump, expand]) {
          const box = (await control.boundingBox())!;
          expect(box.x).toBeGreaterThanOrEqual(bounds.x);
          expect(box.x + box.width).toBeLessThanOrEqual(bounds.x + bounds.width);
        }
      }
      await page.screenshot({ path: info.outputPath('text-list-jump.png'), fullPage: false });
    } finally {
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}

for (const variant of [
  { width: 1280, height: 560, locale: 'ru', theme: 'light' },
  { width: 1920, height: 900, locale: 'en', theme: 'dark' },
  { width: 1024, height: 560, locale: 'ru', theme: 'light' },
] as const) {
  test(`manual track text ${variant.width}x${variant.height} ${variant.locale}`, async ({
    page,
  }, info) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: variant.width, height: variant.height });
    const runtimeErrors: string[] = [];
    page.on('pageerror', (error) => runtimeErrors.push(error.message));
    page.on('console', (message) => {
      if (
        message.type() === 'error' &&
        /Minified React error|Maximum update depth/i.test(message.text())
      )
        runtimeErrors.push(message.text());
    });
    const host = await startHostServer();
    const label = (key: Parameters<typeof translate>[0]) => translate(key, variant.locale);
    try {
      await applyHarnessBootstrap(page, {
        preserveMediaLibrary: true,
        storage: {
          'sniptale-locale-preference': variant.locale,
          'sniptale-theme-preference': variant.theme,
          ...(variant.width === 1920
            ? {
                sniptale_quick_preview_preferences: {
                  rasterPreset: '720p',
                  frameRate: '30',
                  pausedQuality: 'detailed',
                  showFrameRate: false,
                },
              }
            : {}),
        },
        runtimeResponses: {
          AI_SETTINGS_QUERY: textModelResponse,
          REQUEST_LLM_SESSION: { success: true, token: 'fixture-review-text-token' },
        },
      });
      await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}?theme=${variant.theme}`);
      await page.locator('[data-ui="gallery.page.root"]').waitFor();
      await seedReviewVideo(page, 'review-vp8-opus.webm', { width: 160, height: 90, duration: 12 });
      await page.reload();
      await installSpeechPortFixture(page);
      await installTextPortFixture(page);
      await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      const dialog = page.locator('dialog');
      const button = (key: Parameters<typeof translate>[0]) =>
        dialog.getByRole('button', { name: label(key), exact: true });
      await button('gallery.videoReview.advancedEditing').click();
      await button('gallery.videoReview.textTrackOpen').click();
      const document = dialog.locator('[data-ui="gallery.videoReview.textDocument"]');
      const track = dialog.locator('[data-ui="gallery.videoReview.textTrack"]');
      await expect(document).toBeVisible();
      await document
        .getByRole('button', { name: label('gallery.videoReview.textFragmentAdd'), exact: true })
        .click();
      const textbox = document.getByRole('textbox', {
        name: label('gallery.videoReview.speechText'),
        exact: true,
      });
      await expect(textbox).toBeFocused();
      await expect
        .poll(async () => (await persistedReviewContent(page))?.text?.fragments[0]?.text)
        .toBe('');
      await textbox.pressSequentially('Первая фраза', { delay: 400 });
      await expect(textbox).toHaveValue('Первая фраза');
      await expect
        .poll(async () => (await persistedReviewContent(page))?.text?.fragments[0]?.text)
        .toBe('Первая фраза');
      await document
        .getByRole('button', { name: label('gallery.videoReview.textFragmentAdd'), exact: true })
        .click();
      await expect(textbox).toHaveCount(1);
      await textbox.fill('Вторая фраза');
      await expect(track.locator('[data-text-id]')).toHaveCount(2);
      const blocks = track.locator('[data-text-id]');
      const first = (await blocks.nth(0).boundingBox())!;
      const second = (await blocks.nth(1).boundingBox())!;
      expect(first.y + first.height <= second.y || second.y + second.height <= first.y).toBe(true);
      const cards = document.locator('[data-ui="gallery.videoReview.textPhrase"]');
      await cards.nth(0).locator('button[aria-expanded]').click();
      await expect(textbox).toHaveValue('Первая фраза');
      await cards.nth(0).locator('button[aria-expanded]').click();
      await expect(textbox).toHaveCount(0);
      await document.getByRole('searchbox').fill('Вторая');
      await expect(cards).toHaveCount(1);
      await document.getByRole('searchbox').fill('');
      await expect(cards).toHaveCount(2);
      await cards.nth(1).locator('button[aria-expanded]').click();
      await expect(textbox).toHaveValue('Вторая фраза');
      const visibility = document.getByRole('switch', {
        name: label('gallery.videoReview.textFragmentShown'),
        exact: true,
      });
      await visibility.scrollIntoViewIfNeeded();
      await expect(visibility).toBeVisible();
      const switchBox = (await visibility.boundingBox())!;
      expect(switchBox.y + switchBox.height).toBeLessThanOrEqual(variant.height);
      await page.screenshot({ path: info.outputPath('text-document.png'), fullPage: false });
      await document
        .getByRole('button', {
          name: label('gallery.videoReview.speechGenerate'),
          exact: true,
        })
        .press('Enter');
      const voice = dialog.locator('[data-ui="gallery.videoReview.textVoice"]');
      await expect(voice).toBeVisible();
      await expect(button('gallery.videoReview.textVoiceBack')).toBeFocused();
      await expect(voice.locator('svg.animate-spin')).toHaveCount(0);
      const format = voice.getByRole('button', {
        name: label('gallery.videoReview.speechFormat'),
        exact: true,
      });
      await format.click();
      await page.getByRole('option', { name: 'MP3', exact: true }).click();
      await expect(format).toBeFocused();
      const initialInspectorWidth = await dialog
        .locator('.review-inspector-scroll')
        .evaluate((element) => Number.parseFloat(getComputedStyle(element).width));
      for (const width of [420, 523, 524, 525, 640, initialInspectorWidth]) {
        await resizeInspectorContent(page, dialog, width);
        await expect(voice).toBeVisible();
        expect(runtimeErrors).toEqual([]);
      }
      const muteSource = voice.getByRole('switch', {
        name: label('gallery.videoReview.textVoiceMuteSource'),
        exact: true,
      });
      await expect(muteSource).toBeEnabled();
      await expect(muteSource).toHaveAttribute('aria-checked', 'false');
      await muteSource.click();
      await expect(muteSource).toHaveAttribute('aria-checked', 'true');
      await expect(document).toHaveCount(0);
      await expect(
        dialog.locator('[data-ui="gallery.videoReview.inspectorNavigation"] button')
      ).toHaveCount(3);
      await button('gallery.videoReview.textVoiceBack').scrollIntoViewIfNeeded();
      await page.screenshot({ path: info.outputPath('text-voice-form.png'), fullPage: false });
      await voice
        .getByRole('button', {
          name: label('gallery.videoReview.speechGenerate'),
          exact: true,
        })
        .click();
      await expect(voice).toContainText('Local speech fixture');
      const requestCount = () =>
        page.evaluate(() => {
          const requests = Reflect.get(window, 'speechFixtureRequests');
          return Array.isArray(requests) ? requests.length : -1;
        });
      expect(await requestCount()).toBe(0);
      await voice
        .getByRole('button', {
          name: label('gallery.videoReview.speechConsentContinue'),
          exact: true,
        })
        .scrollIntoViewIfNeeded();
      await page.screenshot({ path: info.outputPath('text-voice-consent.png'), fullPage: false });
      await voice
        .getByRole('button', {
          name: label('gallery.videoReview.speechConsentContinue'),
          exact: true,
        })
        .click();
      await expect(voice.locator('audio')).toHaveCount(1);
      expect(await requestCount()).toBe(1);
      await button('videoEditor.app.panelFullHeight').click();
      for (const width of [420, 523, 524, 525, 640, initialInspectorWidth]) {
        await resizeInspectorContent(page, dialog, width);
        await expect(voice.locator('audio')).toHaveCount(1);
        expect(runtimeErrors).toEqual([]);
      }
      await button('videoEditor.app.panelRestoreHeight').click();
      const apply = voice.getByRole('button', {
        name: label('gallery.videoReview.speechApply'),
        exact: true,
      });
      await apply.scrollIntoViewIfNeeded();
      const applyBox = (await apply.boundingBox())!;
      expect(applyBox.y + applyBox.height).toBeLessThanOrEqual(variant.height);
      await page.screenshot({ path: info.outputPath('text-voice-preview.png'), fullPage: false });
      await apply.click();
      await expect(voice).toContainText(label('gallery.videoReview.textVoiceAccepted'));
      const takes = dialog.locator('[data-audio-lane="voiceover"] [data-audio-id]');
      await expect(takes).toHaveCount(1);
      await expect(dialog.locator('[data-original-audio-lane] button[data-audio-id]')).toHaveCount(
        1
      );
      await button('gallery.videoReview.textVoiceBack').press('Enter');
      await expect(document).toBeVisible();
      await expect(
        document.getByRole('button', {
          name: label('gallery.videoReview.speechGenerate'),
          exact: true,
        })
      ).toBeFocused();
      await expect(
        document.getByRole('button', {
          name: label('gallery.videoReview.speechGenerate'),
          exact: true,
        })
      ).toBeInViewport();
      await expect(textbox).toHaveValue('Вторая фраза');
      if (variant.width === 1920) {
        for (const width of [523, 524, 525]) {
          await resizeInspectorContent(page, dialog, width);
          await expect(
            dialog.locator('[data-ui="gallery.videoReview.inspectorNavigation"] button')
          ).toHaveCount(3);
          await expect(document).toBeVisible();
          for (const control of [
            document.getByRole('searchbox'),
            document.getByRole('button', {
              name: label('gallery.videoReview.textFragmentAdd'),
              exact: true,
            }),
          ]) {
            const bounds = (await control.boundingBox())!;
            expect(bounds.x + bounds.width).toBeLessThanOrEqual(variant.width);
          }
          await page.screenshot({
            path: info.outputPath(`text-inspector-${width}.png`),
            fullPage: false,
          });
        }
      }
      await blocks.nth(0).press('Enter');
      await expect(document).toHaveCount(0);
      await expect(
        dialog.getByRole('textbox', { name: label('gallery.videoReview.speechText'), exact: true })
      ).toHaveValue('Первая фраза');
      await button('gallery.videoReview.speechGenerate').press('Enter');
      await expect(voice).toBeVisible();
      await expect(button('gallery.videoReview.textVoiceBack')).toBeFocused();
      await checkLocalTakes(page, voice, takes, label, (name) =>
        page.screenshot({ path: info.outputPath(name), fullPage: false })
      );
      await button('gallery.videoReview.textVoiceBack').press('Enter');
      await expect(voice).toHaveCount(0);
      await expect(button('gallery.videoReview.speechGenerate')).toBeFocused();
      await expect(button('gallery.videoReview.speechGenerate')).toBeInViewport();
      await checkTextRewrite(
        page,
        dialog,
        label,
        (name) =>
          page.screenshot({ path: info.outputPath(name), fullPage: false, animations: 'disabled' }),
        variant.height
      );
      await button('gallery.videoReview.textTrackOpen').click();
      await expect(document).toBeVisible();
      await expect(
        dialog.getByRole('textbox', { name: label('gallery.videoReview.speechText'), exact: true })
      ).toHaveCount(0);
      await checkFullTextRewrite(page, dialog, label, (name) =>
        page.screenshot({ path: info.outputPath(name), fullPage: false, animations: 'disabled' })
      );
      await checkSubtitles(page, dialog, label, (name) => info.outputPath(name), variant.height);
      await document
        .getByRole('button', {
          name: label('gallery.videoReview.speechBatch'),
          exact: true,
        })
        .press('Enter');
      await document
        .getByRole('button', {
          name: label('gallery.videoReview.textFragmentSelectFound'),
          exact: true,
        })
        .press('Enter');
      await document
        .getByRole('button', {
          name: label('gallery.videoReview.speechGenerateSelected'),
          exact: true,
        })
        .press('Enter');
      await expect(button('gallery.videoReview.textVoiceBack')).toBeFocused();
      await button('gallery.videoReview.textVoiceBack').press('Enter');
      await expect(
        document.getByRole('button', {
          name: label('gallery.videoReview.speechGenerateSelected'),
          exact: true,
        })
      ).toBeFocused();
      await expect(
        document.getByRole('button', {
          name: label('gallery.videoReview.speechGenerateSelected'),
          exact: true,
        })
      ).toBeInViewport();
      await document
        .getByRole('button', {
          name: label('gallery.videoReview.speechBatch'),
          exact: true,
        })
        .press('Enter');
      await checkTextGesture(
        page,
        blocks.nth(0),
        button('gallery.videoReview.undo'),
        button('gallery.videoReview.redo')
      );
      expect(runtimeErrors).toEqual([]);
      if (variant.width < 1280) {
        await dialog
          .getByRole('slider', { name: label('videoEditor.timeline.zoom'), exact: true })
          .press('End');
        const viewport = dialog.locator('[data-ui="gallery.videoReview.timelineViewport"]');
        await expect
          .poll(() => viewport.evaluate((element) => element.scrollWidth > element.clientWidth))
          .toBe(true);
        await viewport.hover();
        await page.mouse.wheel(600, 0);
        await expect
          .poll(() => viewport.evaluate((element) => element.scrollLeft))
          .toBeGreaterThan(0);
        await page.screenshot({
          path: info.outputPath('text-horizontal-scroll.png'),
          fullPage: false,
        });
        await button('gallery.videoReview.fit').click();
      }
      // Reload exercises the actual advanced writer and persisted history, not a test-only text state.
      await page.reload();
      // The retained route restores review directly; do not click the gallery behind its dialog.
      await expect(dialog).toBeVisible();
      await button('gallery.videoReview.textTrackOpen').click();
      await expect(cards).toHaveCount(2);
      await expect(cards.nth(0)).toContainText('Первая фраза');
      await expect(cards.nth(1)).toContainText('Вторая фраза');
      await expect(takes).toHaveCount(4);
      await page.screenshot({ path: info.outputPath('text-restored.png'), fullPage: false });
    } finally {
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}
