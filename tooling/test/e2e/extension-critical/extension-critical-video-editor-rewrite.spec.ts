import { writeFile } from 'node:fs/promises';
import { chooseInspectorValue } from '../support/inspector-utilities';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { parseHydratableVideoProject } from '../../../../apps/extension/src/features/video/project/validation/root';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { startHostServer } from '../support/host-server';
import { seedReviewVideo } from '../support/quick-editor-media-fixture';
import { installSpeechPortFixture } from '../support/voiceover-speech-fixture';
import {
  installTextPortFixture,
  textModelResponse,
  textRewriteRequests,
  releaseTextRewrite,
} from '../support/text-rewrite-fixture';
import {
  applyHarnessBootstrap,
  GALLERY_HARNESS_PATH,
  VIDEO_EDITOR_HARNESS_PATH,
} from '../extension-critical.helpers';

type Label = (key: Parameters<typeof translate>[0]) => string;

async function savedProject(page: Page) {
  const rows = await page.evaluate(
    () =>
      new Promise<unknown[]>((resolve, reject) => {
        const request = indexedDB.open('sniptale-db');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const read = db.transaction('video_projects').objectStore('video_projects').getAll();
          read.onerror = () => {
            db.close();
            reject(read.error);
          };
          read.onsuccess = () => {
            const values: unknown = read.result;
            db.close();
            resolve(
              Array.isArray(values)
                ? values.flatMap((value: unknown) =>
                    typeof value === 'object' && value !== null && 'project' in value
                      ? [value.project]
                      : []
                  )
                : []
            );
          };
        };
      })
  );
  return rows.map(parseHydratableVideoProject).find((project) => project !== null);
}

async function operate(button: Locator) {
  await button.scrollIntoViewIfNeeded();
  await expect(button).toBeInViewport();
  await button.click();
}

async function openSceneText(page: Page, label: Label) {
  await operate(
    page.getByRole('button', {
      name: label('videoEditor.sidebar.sceneProperties'),
      exact: true,
    })
  );
  await operate(
    page.getByRole('button', {
      name: label('videoEditor.sidebar.textDocuments'),
      exact: true,
    })
  );
  return page.locator('[data-ui="video-editor.text.panel"]');
}

async function recognizeSource(page: Page, label: Label, clipId: string) {
  await page.locator(`[data-project-timeline-clip="${clipId}"]`).click();
  await operate(
    page.getByRole('button', {
      name: label('gallery.videoReview.recognitionTitle'),
      exact: true,
    })
  );
  const panel = page.locator('[data-ui="video-editor.recognition.panel"]');
  await panel.locator('.sniptale-ai-model-selector-trigger').click();
  await page.getByRole('button', { name: 'Fixture recognition', exact: true }).click();
  await operate(
    panel.getByRole('button', {
      name: label('gallery.videoReview.recognitionStart'),
      exact: true,
    })
  );
  await operate(
    panel.getByRole('button', {
      name: label('gallery.videoReview.speechConsentContinue'),
      exact: true,
    })
  );
  const proposal = panel.locator('[data-ui="video-editor.recognition.proposal"]');
  await expect(proposal.getByRole('textbox')).toHaveCount(3);
  await operate(
    proposal.getByRole('button', {
      name: label('gallery.videoReview.recognitionApply'),
      exact: true,
    })
  );
  await expect.poll(async () => (await savedProject(page))?.textDocuments?.length).toBe(1);
}

async function refuseProjectSave(page: Page) {
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    let refused = true;
    Object.assign(window, {
      allowRewriteSave: () => {
        refused = false;
      },
    });
    IDBObjectStore.prototype.put = function (value: unknown, key?: IDBValidKey) {
      if (refused && this.name === 'video_projects')
        throw new DOMException('Local fixture write refusal', 'QuotaExceededError');
      return key === undefined ? put.call(this, value) : put.call(this, value, key);
    };
  });
}

async function acceptSave(page: Page) {
  await page.evaluate(() => {
    const allow: unknown = Reflect.get(window, 'allowRewriteSave');
    if (typeof allow !== 'function') throw new Error('Save fixture unavailable');
    allow();
  });
}

async function undoRedo(page: Page, expected: unknown, accepted: unknown) {
  await page
    .locator('[data-ui="video-editor.timeline.surface"]')
    .click({ position: { x: 4, y: 4 } });
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await savedProject(page))?.textDocuments).toEqual(expected);
  await page.keyboard.press('Control+Shift+z');
  await expect.poll(async () => (await savedProject(page))?.textDocuments).toEqual(accepted);
}

async function inspectWidths(page: Page, panel: Locator, outputPath: (name: string) => string) {
  const inspector = page.locator('[data-ui="video-editor.floating.context-inspector"]');
  const handle = page.locator('[data-ui="video-editor.floating.context-inspector.resize"]');
  for (const width of [359, 360, 361]) {
    const current = (await inspector.boundingBox())!.width;
    const box = (await handle.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + 12);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + current - width, box.y + 12);
    await page.mouse.up();
    await expect.poll(async () => Math.round((await inspector.boundingBox())!.width)).toBe(width);
    expect(await panel.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
      true
    );
    await page.screenshot({ path: outputPath(`rewrite-inspector-${width}.png`), fullPage: false });
  }
}

async function inspectTextFit(page: Page, panel: Locator, outputPath: (name: string) => string) {
  const expanded = await panel.evaluateHandle((element) => {
    const changes: Array<{ node: Node; original: string }> = [];
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      // Choice fitting measures React option labels; direct DOM edits bypass that contract.
      if (node.parentElement?.closest('[data-ui="shared.ui.compact-inspector.segmented-row"]'))
        continue;
      const original = node.nodeValue ?? '';
      const text = original.trim();
      if (!/[A-Za-zА-Яа-я]/u.test(text)) continue;
      changes.push({ node, original });
      node.nodeValue = `⟦${text}${text.length <= 12 ? text : text.slice(0, Math.ceil(text.length / 2))}⟧`;
    }
    return changes;
  });
  try {
    await panel.getByRole('textbox').first().scrollIntoViewIfNeeded();
    const overflow = await panel.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return [...element.querySelectorAll('*')]
        .filter(
          (node) =>
            node.getClientRects().length && node.getBoundingClientRect().right > bounds.right + 1
        )
        .map((node) => ({
          tag: node.tagName,
          ui: node.getAttribute('data-ui'),
          className: node.getAttribute('class'),
          text: node.textContent?.slice(0, 140),
          width: node.getBoundingClientRect().width,
        }));
    });
    await writeFile(outputPath('rewrite-label-overflow.json'), JSON.stringify(overflow, null, 2));
    await page.screenshot({ path: outputPath('rewrite-label-stress.png'), fullPage: false });
    expect(await panel.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
      true
    );
  } finally {
    await expanded.evaluate((changes) => {
      for (const { node, original } of changes) if (node.isConnected) node.nodeValue = original;
    });
    await expanded.dispose();
  }
  const zoomed = await panel.evaluateHandle((element) => {
    const changes = [element, ...element.querySelectorAll<HTMLElement>('*')].map((node) => ({
      node,
      original: node.style.fontSize,
      size: Number.parseFloat(getComputedStyle(node).fontSize) * 1.5,
    }));
    for (const { node, size } of changes) node.style.fontSize = `${size}px`;
    return changes;
  });
  try {
    expect(await panel.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
      true
    );
    await page.screenshot({ path: outputPath('rewrite-text-zoom.png'), fullPage: false });
    await panel.getByRole('button').last().scrollIntoViewIfNeeded();
    await expect(panel.getByRole('button').last()).toBeInViewport();
  } finally {
    await zoomed.evaluate((changes) => {
      for (const { node, original } of changes) node.style.fontSize = original;
    });
    await zoomed.dispose();
  }
}

async function checkSelectedPhrases(page: Page, label: Label) {
  const before = await savedProject(page);
  const fragments = before?.textDocuments?.[0]?.document.fragments;
  if (!fragments || fragments.length < 3) throw new Error('Selection fixture unavailable');
  const text = page.locator('[data-ui="video-editor.text.panel"]');
  await operate(
    text.getByRole('button', { name: label('gallery.videoReview.speechBatch'), exact: true })
  );
  const selected = [fragments[0]!, fragments[2]!];
  for (const fragment of selected)
    await text.locator(`article[data-text-id="${fragment.id}"]`).getByRole('checkbox').check();
  await operate(text.locator('[data-project-text-rewrite="selected"]'));
  const form = page.locator('[data-ui="video-editor.text-rewrite.panel"]');
  await expect(form).toContainText(
    label('gallery.videoReview.textRewriteSelectedScope').replace('{count}', '2')
  );
  await form.locator('.sniptale-ai-model-selector-trigger').click();
  await page.getByRole('button', { name: 'Fixture text', exact: true }).click();
  await form
    .getByRole('textbox', { name: label('gallery.videoReview.textRewritePrompt'), exact: true })
    .fill('Rewrite only the two explicitly selected phrases.');
  await operate(
    form.getByRole('button', { name: label('gallery.videoReview.textRewriteStart'), exact: true })
  );
  const proposal = form.locator('[data-ui="video.text-rewrite.proposal"]');
  await expect(proposal.getByRole('textbox')).toHaveCount(2);
  const requests = await textRewriteRequests(page);
  expect(requests.at(-1)?.context.wholeDocument).toBe(false);
  expect(requests.at(-1)?.context.fragments.map((fragment) => fragment.id)).toEqual(
    selected.map((fragment) => fragment.id)
  );
  expect((await savedProject(page))?.textDocuments).toEqual(before?.textDocuments);
  await operate(
    form.getByRole('button', { name: label('gallery.videoReview.textVoiceBack'), exact: true })
  );
}

async function checkIndependentVariant(
  page: Page,
  label: Label,
  outputPath: (name: string) => string
) {
  const form = page.locator('[data-ui="video-editor.text-rewrite.panel"]');
  await operate(
    form.getByRole('button', { name: label('gallery.videoReview.textVoiceBack'), exact: true })
  );
  const text = page.locator('[data-ui="video-editor.text.panel"]');
  const before = await savedProject(page);
  const source = before?.textDocuments?.[0];
  if (!before || !source) throw new Error('Source document unavailable');
  await operate(text.locator('[data-project-text-rewrite="all"]'));
  await expect(form).toContainText(
    label('gallery.videoReview.textRewriteAllScope').replace(
      '{count}',
      String(source.document.fragments.length)
    )
  );
  await chooseInspectorValue(
    page,
    form,
    label('gallery.videoReview.textRewriteMode'),
    label('gallery.videoReview.textRewriteScript')
  );

  await operate(
    form.getByRole('switch', { name: label('gallery.videoReview.textRewriteTiming'), exact: true })
  );
  await expect(form).toContainText(label('videoEditor.sidebar.textRewriteProjectTiming'));
  await operate(
    form.getByRole('switch', {
      name: label('gallery.videoReview.textRewriteStructure'),
      exact: true,
    })
  );
  await form
    .getByRole('textbox', { name: label('gallery.videoReview.textRewritePrompt'), exact: true })
    .fill('Собери единый самостоятельный сценарий, сохрани смысл.');
  await page.screenshot({
    path: outputPath('rewrite-independent-permissions.png'),
    fullPage: false,
  });
  await operate(
    form.getByRole('button', { name: label('gallery.videoReview.textRewriteStart'), exact: true })
  );
  const proposal = form.locator('[data-ui="video.text-rewrite.proposal"]');
  const result = proposal.getByRole('textbox', {
    name: label('gallery.videoReview.textRewriteResult').replace('{index}', '1'),
    exact: true,
  });
  await expect(result).toHaveValue(
    `AI: ${source.document.fragments.map((fragment) => fragment.text).join(' ')}`
  );
  const requests = await textRewriteRequests(page);
  expect(requests.at(-1)?.context).toMatchObject({
    wholeDocument: true,
    mode: 'script',
    changeIntervals: true,
    resegment: true,
  });
  expect(requests.at(-1)?.context.fragments.map((fragment) => fragment.id)).toEqual(
    source.document.fragments.map((fragment) => fragment.id)
  );
  await result.fill('Hidden independent project alternative / Самостоятельный вариант');
  expect((await savedProject(page))?.textDocuments).toEqual(before.textDocuments);
  await operate(
    proposal.getByRole('button', {
      name: label('gallery.videoReview.textRewriteVariant'),
      exact: true,
    })
  );
  await expect(form).toContainText(label('gallery.videoReview.textRewriteApplied'));
  await expect(form.getByRole('alert')).toHaveCount(0);
  await expect.poll(async () => (await savedProject(page))?.textDocuments?.length).toBe(2);
  const accepted = await savedProject(page);
  expect(accepted?.textDocuments?.[0]).toEqual(source);
  expect(accepted?.textDocuments?.[1]?.binding).toEqual({ kind: 'project' });
  expect(accepted?.textDocuments?.[1]?.document.fragments).toHaveLength(1);
  expect(accepted?.textDocuments?.[1]?.document.fragments[0]).toMatchObject({
    text: 'Hidden independent project alternative / Самостоятельный вариант',
    timeDomain: 'result',
    showInVideo: false,
    derivedFrom: source.document.fragments.map((fragment) => fragment.id),
  });
  expect(accepted?.clips).toEqual(before.clips);
  expect(accepted?.assets).toEqual(before.assets);
  await page.screenshot({ path: outputPath('rewrite-independent-accepted.png'), fullPage: false });
  await undoRedo(page, before.textDocuments, accepted?.textDocuments);
}

async function prepareRecognizedProject(
  page: Page,
  origin: string,
  variant: (typeof variants)[number],
  label: Label
) {
  await applyHarnessBootstrap(page, {
    preserveMediaLibrary: true,
    storage: {
      'sniptale-locale-preference': variant.locale,
      'sniptale-theme-preference': variant.theme,
    },
    runtimeResponses: {
      AI_SETTINGS_QUERY: textModelResponse,
      REQUEST_LLM_SESSION: { success: true, token: 'fixture-review-text-token' },
    },
  });
  await page.addInitScript(
    (locale) => localStorage.setItem('sniptale-locale-preference', locale),
    variant.locale
  );
  await page.goto(`${origin}${GALLERY_HARNESS_PATH}?theme=${variant.theme}`);
  await page.locator('[data-ui="gallery.page.root"]').waitFor();
  await seedReviewVideo(page, 'review-vp8-opus.webm', { width: 160, height: 90, duration: 12 });
  await page.goto(
    `${origin}${VIDEO_EDITOR_HARNESS_PATH}?id=beta-v1-recording&theme=${variant.theme}`
  );
  await expect(page.locator('[data-ui="video-editor.timeline.surface"]')).toBeVisible();
  await installSpeechPortFixture(page);
  await expect.poll(async () => (await savedProject(page))?.clips.length ?? 0).toBeGreaterThan(0);
  const initial = await savedProject(page);
  const clip = initial?.clips.find(
    (entry) =>
      (entry.type === 'VIDEO' || entry.type === 'AUDIO') &&
      initial.assets.find((asset) => asset.id === entry.assetId)?.metadata.hasAudio
  );
  if (!initial || !clip) throw new Error('Audible recording unavailable');
  await recognizeSource(page, label, clip.id);
  const before = await savedProject(page);
  const entry = before?.textDocuments?.[0];
  const fragment = entry?.document.fragments[0];
  if (!before || !entry || !fragment) throw new Error('Recognized text unavailable');
  expect(entry.binding.kind).toBe('source');
  return { before, entry, fragment };
}

const variants = [
  { size: PRIMARY_BROWSER_VIEWPORTS[0].size, locale: 'en', theme: 'dark' },
  { size: PRIMARY_BROWSER_VIEWPORTS[1].size, locale: 'ru', theme: 'light' },
  { size: { width: 1200, height: 560 }, locale: 'en', theme: 'light' },
  { size: PRIMARY_BROWSER_VIEWPORTS[0].size, locale: 'ru', theme: 'dark' },
] as const;

for (const variant of variants) {
  test(`Montage explicit rewrite and project text Apply ${variant.size.width} ${variant.locale}`, async ({
    page,
  }, info) => {
    if (variant.size.width === 1920) test.setTimeout(90_000);
    const host = await startHostServer();
    const label: Label = (key) => translate(key, variant.locale);
    const recovery = variant.size.width === 1280 && variant.locale === 'ru';
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize({ ...variant.size });
    await page.emulateMedia({ colorScheme: variant.theme });
    try {
      const { before, entry, fragment } = await prepareRecognizedProject(
        page,
        host.origin,
        variant,
        label
      );
      const text = await openSceneText(page, label);
      await installTextPortFixture(page, recovery);
      if (variant.size.width === 1920) await checkSelectedPhrases(page, label);
      const earlierRequests = (await textRewriteRequests(page)).length;
      await operate(text.locator(`[data-project-text-rewrite="${fragment.id}"]`));
      const form = page.locator('[data-ui="video-editor.text-rewrite.panel"]');
      await expect(form).toBeVisible();
      await form.locator('.sniptale-ai-model-selector-trigger').click();
      await page.getByRole('button', { name: 'Fixture text', exact: true }).click();
      await form
        .getByRole('textbox', { name: label('gallery.videoReview.textRewritePrompt'), exact: true })
        .fill('Shorten the phrase. Сохранить имена и смысл. Łukasz 中文');
      await expect(form).toContainText(label('gallery.videoReview.textRewriteDisclosure'));
      await form.getByRole('textbox').first().scrollIntoViewIfNeeded();
      await page.screenshot({ path: info.outputPath('rewrite-settings-top.png'), fullPage: false });
      if (variant.size.width !== 1200) {
        await inspectTextFit(page, form, (name) => info.outputPath(name));
      }
      const start = form.getByRole('button', {
        name: label('gallery.videoReview.textRewriteStart'),
        exact: true,
      });
      await start.scrollIntoViewIfNeeded();
      await page.screenshot({ path: info.outputPath('rewrite-settings.png'), fullPage: false });
      await operate(start);
      if (recovery) {
        await expect.poll(async () => (await textRewriteRequests(page)).length).toBe(1);
        await operate(
          form.getByRole('button', { name: label('common.actions.cancel'), exact: true })
        );
        await expect(start).toBeEnabled();
        expect((await savedProject(page))?.textDocuments).toEqual(before.textDocuments);
        await operate(start);
        await expect.poll(async () => (await textRewriteRequests(page)).length).toBe(2);
        await page.screenshot({ path: info.outputPath('rewrite-pending.png'), fullPage: false });
        await releaseTextRewrite(page);
      }
      const proposal = form.locator('[data-ui="video.text-rewrite.proposal"]');
      const result = proposal.getByRole('textbox', {
        name: label('gallery.videoReview.textRewriteResult').replace('{index}', '1'),
        exact: true,
      });
      await expect(result).toHaveValue(`AI: ${fragment.text}`);
      const requests = await textRewriteRequests(page);
      expect(requests).toHaveLength(earlierRequests + (recovery ? 2 : 1));
      expect(requests.at(-1)?.scope).toMatchObject({
        kind: 'project-text',
        projectId: before.id,
        documentId: entry.id,
      });
      expect(requests.at(-1)?.context.fragments.map((value) => value.id)).toEqual([fragment.id]);
      expect(requests.at(-1)?.context.changeIntervals).toBe(false);
      const replacement = 'Edited proposal / Отредактированное предложение Łukasz 中文';
      await result.fill(replacement);
      expect((await savedProject(page))?.textDocuments).toEqual(before.textDocuments);
      // Completed work survives category navigation, inspector collapse and export presentation.
      await operate(
        page.getByRole('button', {
          name: label('videoEditor.sidebar.inspectorGroupCanvas'),
          exact: true,
        })
      );
      await operate(
        page.getByRole('button', {
          name: label('videoEditor.sidebar.textDocuments'),
          exact: true,
        })
      );
      await expect(result).toHaveValue(replacement);
      await page.locator('[data-ui="video-editor.inspector.close"]').click();
      await page.locator('[data-ui="video-editor.viewer.open-inspector"]').click();
      await expect(result).toHaveValue(replacement);
      await page.locator('[data-ui="video-editor.timeline.toolbar.project-menu"]').click();
      await page
        .getByRole('button', { name: label('videoEditor.app.exportButton'), exact: true })
        .click();
      await expect(form).toBeHidden();
      await page.locator('[data-ui="video-editor.inspector.close"]').click();
      await page.locator('[data-ui="video-editor.viewer.open-inspector"]').click();
      await expect(result).toHaveValue(replacement);
      const apply = proposal.getByRole('button', {
        name: label('gallery.videoReview.textRewriteReplace'),
        exact: true,
      });
      await apply.scrollIntoViewIfNeeded();
      await page.screenshot({ path: info.outputPath('rewrite-proposal.png'), fullPage: false });
      if (recovery) await refuseProjectSave(page);
      await operate(apply);
      if (recovery) {
        await expect(form.getByRole('alert')).toBeVisible();
        await page.keyboard.press('Escape');
        await form.getByRole('alert').scrollIntoViewIfNeeded();
        await page.screenshot({ path: info.outputPath('rewrite-save-retry.png'), fullPage: false });
        await expect(result).toBeDisabled();
        expect((await savedProject(page))?.textDocuments).toEqual(before.textDocuments);
        await acceptSave(page);
        await operate(apply);
      }
      await expect(form).toContainText(label('gallery.videoReview.textRewriteApplied'));
      await expect(form.getByRole('alert')).toHaveCount(0);
      await expect
        .poll(
          async () => (await savedProject(page))?.textDocuments?.[0]?.document.fragments[0]?.text
        )
        .toBe(replacement);
      const accepted = await savedProject(page);
      const changed = accepted?.textDocuments?.[0];
      expect(changed?.binding).toEqual(entry.binding);
      expect(changed?.document.fragments[0]).toMatchObject({
        id: fragment.id,
        start: fragment.start,
        end: fragment.end,
        timeDomain: 'source',
      });
      expect(accepted?.clips).toEqual(before.clips);
      expect(accepted?.assets).toEqual(before.assets);
      expect((await textRewriteRequests(page)).length).toBe(earlierRequests + (recovery ? 2 : 1));
      await undoRedo(page, before.textDocuments, accepted?.textDocuments);
      if (variant.size.width === 1920) {
        await inspectWidths(page, form, (name) => info.outputPath(name));
        await checkIndependentVariant(page, label, (name) => info.outputPath(name));
      }
      await page.goto(
        `${host.origin}${VIDEO_EDITOR_HARNESS_PATH}?project=${before.id}&theme=${variant.theme}`
      );
      const reopened = await openSceneText(page, label);
      await reopened.locator('article > button').first().click();
      const field = reopened
        .getByRole('textbox', { name: label('gallery.videoReview.speechText'), exact: true })
        .first();
      await expect(field).toHaveValue(replacement);
      await field.scrollIntoViewIfNeeded();
      await page.screenshot({ path: info.outputPath('rewrite-reopened.png'), fullPage: false });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true
      );
      expect(errors).toEqual([]);
    } finally {
      host.server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        host.server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });
}
