import { expect, type Page, type TestInfo } from '@playwright/test';
import type { AIScenarioSelection } from '../../../../apps/extension/src/contracts/settings/ai-catalog';
import { parseGuideProject } from '@sniptale/runtime-contracts/scenario/guide-parser';
import { createTranslator } from '../../../../apps/extension/src/platform/i18n';
import { test } from '../support/extension-fixture';
import { materializeScenarioUnitStorage } from '../../../../apps/extension/src/composition/persistence/scenario/storage-units';
import {
  applyHarnessBootstrap,
  SCENARIO_EDITOR_VISUAL_HARNESS_PATH,
} from '../extension-critical.helpers';
import { speechModelResponse, syntheticSpeechWav } from '../support/voiceover-speech-fixture';
import { openVisualHarness, createPageIssueCollector } from './scenario-editor-visual.helpers';

const texts = ['First authored action.', 'Second authored action.', 'Third authored action.'];
const alternateProvider = '00000000-0000-4000-8000-000000000104';
const selection = speechModelResponse.modelSelection!;
const speech = selection.models.find((model) => model.operation === 'speech')!;
const catalog = {
  ...speechModelResponse,
  modelSelection: {
    ...selection,
    providers: [
      ...selection.providers.map((entry) => ({ ...entry, incarnation: entry.id })),
      {
        ...selection.providers[0]!,
        id: alternateProvider,
        incarnation: alternateProvider,
        name: 'Alternate fixture provider',
      },
    ],
    models: [
      {
        ...speech,
        audio: { speech: { voiceId: 'fixture', responseFormat: 'pcm' as const, speed: 1 } },
      },
      {
        ...speech,
        id: '00000000-0000-4000-8000-000000000105',
        providerId: alternateProvider,
        displayName: 'Alternate fixture speech',
        audio: { speech: { voiceId: 'alternate', responseFormat: 'pcm' as const, speed: 1 } },
      },
    ],
  },
};
type Mode = 'success' | 'invalid' | 'hold';
type Locale = 'ru' | 'en';

async function saved(page: Page) {
  const row = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('sniptale-db');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const id = new URLSearchParams(location.search).get('projectId');
      if (!id) throw new Error('Missing project identity');
      const tx = db.transaction(
        ['scenario_projects', 'scenario_project_history', 'scenario_project_units'],
        'readonly'
      );
      const read = (request: IDBRequest): Promise<unknown> =>
        new Promise((resolve, reject) => {
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
      const [head, rows, units] = await Promise.all([
        read(tx.objectStore('scenario_projects').get(id)),
        read(tx.objectStore('scenario_project_history').index('projectId').getAll(id)),
        read(tx.objectStore('scenario_project_units').index('projectId').getAll(id)),
      ]);
      if (!Array.isArray(rows) || !Array.isArray(units)) throw new Error('Missing saved units');
      return { head, rows, units };
    } finally {
      db.close();
    }
  });
  const logical = materializeScenarioUnitStorage(row.head, row.rows, row.units);
  if (!logical || typeof logical !== 'object') throw new Error('Missing logical Scenario');
  const revision: unknown = Reflect.get(logical, 'workspaceRevision');
  if (typeof revision !== 'number') throw new Error('Missing saved revision');
  const result = parseGuideProject(Reflect.get(logical, 'project'));
  if (result.status !== 'ok' || !result.project.tour) throw new Error('Invalid saved tour');
  const actions = result.project.tour.slides.flatMap((slide) =>
    slide.kind === 'image'
      ? slide.actions
          .filter((action) => action.type === 'hotspot' || action.type === 'annotation')
          .map((action) => ({
            slideId: slide.id,
            objectId: action.object.id,
            text: action.object.text,
            narration: action.object.narration ?? null,
          }))
      : []
  );
  return { revision, actions, resources: result.project.tour.audioResources ?? [] };
}

async function requests(page: Page) {
  return page.evaluate(() => {
    const values: unknown = Reflect.get(window, 'pcmSpeechFixture').requests;
    if (!Array.isArray(values)) throw new Error('Missing fixture requests');
    return values.map((value: unknown) => {
      if (!value || typeof value !== 'object') throw new Error('Invalid fixture request');
      const format: unknown = Reflect.get(value, 'format');
      const text: unknown = Reflect.get(value, 'text');
      if (typeof format !== 'string' || typeof text !== 'string')
        throw new Error('Invalid fixture request');
      return { format, text };
    });
  });
}
async function modes(page: Page, values: Mode[]) {
  await page.evaluate(
    (values) => Reflect.get(window, 'pcmSpeechFixture').modes.push(...values),
    values
  );
}
async function release(page: Page, index: number) {
  expect(
    await page.evaluate((index) => Reflect.get(window, 'pcmSpeechFixture').release(index), index)
  ).toBe(true);
}
async function installCatalog(page: Page) {
  await page.evaluate((response) => {
    let remembered: AIScenarioSelection | null = null;
    window.__sniptaleHarness?.setRuntimeResponse('AI_SETTINGS_QUERY', () => ({
      ...response,
      scenarioSelection: remembered,
    }));
    window.__sniptaleHarness?.setRuntimeResponse('AI_SETTINGS_MUTATION', (message: unknown) => {
      if (
        !message ||
        typeof message !== 'object' ||
        Reflect.get(message, 'operation') !== 'remember-scenario-selection'
      )
        return { success: false };
      const choice: unknown = Reflect.get(message, 'selection');
      if (
        !choice ||
        typeof choice !== 'object' ||
        Reflect.get(choice, 'scenario') !== 'scenario-speech'
      )
        return { success: false };
      const model = response.modelSelection.models.find(
        (entry) => entry.id === Reflect.get(choice, 'modelId')
      );
      const provider = response.modelSelection.providers.find(
        (entry) => entry.id === model?.providerId
      );
      const source: unknown = Reflect.get(choice, 'source');
      if (!model || !provider || (source !== 'explicit' && source !== 'initial'))
        return { success: false };
      remembered = {
        modelId: model.id,
        modelCode: model.modelCode,
        providerId: provider.id,
        providerIncarnation: provider.incarnation,
        displayName: model.displayName,
        source,
        selectedAt: Date.now(),
      };
      return { success: true };
    });
  }, catalog);
}

function inspector(page: Page) {
  return page.locator('#guide-inspector-panel');
}
function form(page: Page) {
  return page.locator('[data-tour-narration-ai]');
}
async function category(
  page: Page,
  locale: Locale,
  key: 'tourObjects' | 'tourNarration' | 'textLabel'
) {
  await inspector(page)
    .getByRole('navigation')
    .getByRole('button', { name: createTranslator(locale)(`scenario.editor.${key}`), exact: true })
    .click();
}
async function slide(page: Page, locale: Locale, index: number) {
  const t = createTranslator(locale);
  await page
    .locator('#guide-library-panel .guide-left-navigation')
    .getByRole('button', { name: t('scenario.editor.tourSlides'), exact: true })
    .click();
  await page.locator('.tour-slide-select:has(img)').nth(index).click();
  const back = inspector(page).locator('.tour-inspector-back');
  if (await back.isVisible()) await back.click();
}
async function selectAction(page: Page, locale: Locale, index: number) {
  const target = (await saved(page)).actions[index]!;
  await slide(page, locale, index < 2 ? 0 : 1);
  await category(page, locale, 'tourObjects');
  await inspector(page).locator(`[data-inspector-object="${target.objectId}"]`).click();
  return target;
}
async function ready(page: Page, count: number, locale: Locale) {
  await expect(form(page).locator('[data-ai-preview]')).toHaveCount(count);
  await expect(
    form(page).getByRole('button', {
      name: createTranslator(locale)('common.actions.cancel'),
      exact: true,
    })
  ).toHaveCount(0);
}
async function approve(page: Page) {
  await expect(form(page).locator('[data-ai-generate]')).toBeDisabled();
  await form(page).locator('[data-ai-consent]').check();
  await expect(form(page).locator('[data-ai-generate]')).toBeEnabled();
}
async function closeForm(page: Page, locale: Locale, origin: 'single' | 'batch' = 'single') {
  await inspector(page)
    .locator('.guide-panel-heading')
    .getByRole('button', {
      name: createTranslator(locale)('scenario.editor.tourBackToSlide'),
      exact: true,
    })
    .click();
  await expect(form(page)).toHaveCount(0);
  await expect(
    page.locator(origin === 'single' ? '[data-ai-single]' : '[data-ai-batch]')
  ).toBeFocused();
}
async function screenshot(page: Page, info: TestInfo, name: string) {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage: false });
  expect(
    await inspector(page).evaluate((node) => node.scrollWidth - node.clientWidth)
  ).toBeLessThanOrEqual(1);
}
async function setup(
  page: Page,
  origin: string,
  locale: Locale,
  theme: 'light' | 'dark',
  viewport: { width: number; height: number }
) {
  const t = createTranslator(locale);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openVisualHarness(page, origin, theme, locale, viewport, 'compare', {
    tourFixture: '1',
    pcmSpeechFixture: '1',
  });
  await installCatalog(page);
  await page.getByRole('button', { name: t('scenario.editor.tourMode'), exact: true }).click();
  for (const [index, text] of texts.entries()) {
    await slide(page, locale, index < 2 ? 0 : 1);
    await category(page, locale, 'tourObjects');
    const name = t(index === 1 ? 'scenario.editor.tourAnnotation' : 'scenario.editor.tourHotspot');
    if (index === 1) {
      await inspector(page)
        .getByRole('button', { name: t('scenario.editor.tourAddObject'), exact: true })
        .click();
      await page.locator('.guide-action-menu').getByRole('button', { name, exact: true }).click();
    } else await inspector(page).getByRole('button', { name, exact: true }).click();
    await category(page, locale, 'textLabel');
    const field = inspector(page).getByRole('textbox', {
      name: t('scenario.editor.textLabel'),
      exact: true,
    });
    await field.fill(text);
    await field.press('Tab');
    await expect
      .poll(async () => (await saved(page)).actions.some((action) => action.text === text))
      .toBe(true);
  }
  return t;
}
async function openSingle(page: Page, locale: Locale, index = 0) {
  await selectAction(page, locale, index);
  await category(page, locale, 'tourNarration');
  await inspector(page).locator('[data-ai-single]').click();
  await expect(form(page).locator('[data-ai-consent]')).toBeVisible();
  const back = inspector(page).locator('.guide-panel-heading .tour-inspector-back');
  const box = await back.boundingBox();
  expect(box?.width).toBe(32);
  expect(box?.height).toBe(32);
  await expect(back.locator('svg')).toHaveAttribute('width', '16');
}
async function openBatch(page: Page) {
  await page.locator('[data-ai-batch]').click();
  await expect(form(page).locator('[data-ai-target]')).toHaveCount(3);
  await expect(form(page).locator('[data-ai-target]:checked')).toHaveCount(3);
}
async function otherEditor(page: Page, locale: Locale) {
  const other = await page.context().newPage();
  await other.setViewportSize(page.viewportSize()!);
  await applyHarnessBootstrap(other, { preserveMediaLibrary: true });
  const url = new URL(page.url());
  url.pathname = SCENARIO_EDITOR_VISUAL_HARNESS_PATH;
  url.searchParams.set('locale', locale);
  url.searchParams.set('theme', locale === 'ru' ? 'light' : 'dark');
  await other.goto(url.href, { waitUntil: 'domcontentloaded' });
  await other
    .getByRole('button', {
      name: createTranslator(locale)('scenario.editor.tourMode'),
      exact: true,
    })
    .click();
  await selectAction(other, locale, 0);
  return other;
}

for (const [locale, theme, viewport] of [
  ['ru', 'light', { width: 1280, height: 560 }],
  ['en', 'dark', { width: 1920, height: 900 }],
] as const) {
  test(`returns batch narration to the document inspector context ${locale}`, async ({
    page,
    hostOrigin,
  }) => {
    const t = await setup(page, hostOrigin, locale, theme, viewport);
    await page
      .locator('.guide-page-header')
      .getByRole('button', { name: t('scenario.editor.appearance'), exact: true })
      .click();
    await expect(inspector(page)).toHaveAttribute('aria-label', t('scenario.editor.tourSettings'));
    const selected = inspector(page).getByRole('navigation').getByRole('button', { pressed: true });
    const category = await selected.getAttribute('aria-label');
    await openBatch(page);
    await closeForm(page, locale, 'batch');
    await expect(inspector(page)).toHaveAttribute('aria-label', t('scenario.editor.tourSettings'));
    await expect(
      inspector(page).getByRole('navigation').getByRole('button', { pressed: true })
    ).toHaveAttribute('aria-label', category!);
  });

  test(`remembers narration choices without changing accepted project content ${locale}`, async ({
    page,
    hostOrigin,
  }, info) => {
    await setup(page, hostOrigin, locale, theme, viewport);
    const before = await saved(page);
    await openSingle(page, locale);
    const selector = form(page).locator('.sniptale-ai-model-selector-trigger');
    await selector.focus();
    await selector.press('Enter');
    const menu = form(page).locator('.sniptale-dropdown-menu');
    await menu.getByRole('textbox').fill('Alternate');
    const option = menu.getByRole('button', { name: 'Alternate fixture speech', exact: true });
    await option.focus();
    await option.press('Enter');
    await expect(selector).toContainText('Alternate fixture speech');
    expect(await saved(page)).toEqual(before);
    expect(await requests(page)).toEqual([]);
    await closeForm(page, locale);
    await openSingle(page, locale);
    await expect(form(page).locator('.sniptale-ai-model-selector-trigger')).toContainText(
      'Alternate fixture speech'
    );
    await expect(form(page).locator('[data-ai-generate]')).toBeDisabled();
    expect(await saved(page)).toEqual(before);
    expect(await requests(page)).toEqual([]);
    await screenshot(page, info, 'remembered-choice');
  });

  test(`recovers a refused narration choice without losing the voice draft ${locale}`, async ({
    page,
    hostOrigin,
  }, info) => {
    const t = await setup(page, hostOrigin, locale, theme, viewport);
    const before = await saved(page);
    await openSingle(page, locale);
    const selector = form(page).locator('.sniptale-ai-model-selector-trigger');
    const voice = form(page).getByRole('textbox', {
      name: t('gallery.videoReview.speechVoice'),
      exact: true,
    });
    await voice.fill('retained draft');
    await page.evaluate(() =>
      window.__sniptaleHarness?.setRuntimeResponse('AI_SETTINGS_MUTATION', {
        success: false,
        error: 'fixture-refused',
      })
    );
    const chooseAlternate = async () => {
      await selector.click();
      await form(page)
        .locator('.sniptale-dropdown-menu')
        .getByRole('button', { name: 'Alternate fixture speech', exact: true })
        .click();
    };
    await chooseAlternate();
    const error = form(page).getByText(t('scenario.editor.guideAiSelectionFailed'), {
      exact: true,
    });
    await expect(error).toBeVisible();
    await expect(voice).toHaveValue('retained draft');
    await expect(selector).toContainText('Fixture speech');
    expect(await saved(page)).toEqual(before);
    expect(await requests(page)).toEqual([]);
    await error.scrollIntoViewIfNeeded();
    await screenshot(page, info, 'preference-error');
    await installCatalog(page);
    await chooseAlternate();
    await expect(selector).toContainText('Alternate fixture speech');
    await expect(voice).toHaveValue('alternate');
    await expect(error).toHaveCount(0);
    expect(await saved(page)).toEqual(before);
    expect(await requests(page)).toEqual([]);
  });

  test(`generates selected action speech only after disclosure and applies it after preview ${locale}`, async ({
    page,
    hostOrigin,
  }, info) => {
    const issues = createPageIssueCollector(page);
    const t = await setup(page, hostOrigin, locale, theme, viewport);
    await openSingle(page, locale);
    await expect(form(page)).toContainText('Local speech fixture');
    await expect(form(page)).toContainText('Fixture speech');
    await expect(form(page)).toContainText(t('scenario.editor.tourNarrationAISave'));
    expect(await requests(page)).toEqual([]);
    await approve(page);
    await form(page).locator('[data-ai-generate]').click();
    await ready(page, 1, locale);
    expect(await requests(page)).toEqual([{ format: 'pcm', text: texts[0] }]);
    expect((await saved(page)).actions.every((action) => !action.narration)).toBe(true);
    await form(page)
      .getByRole('textbox', { name: t('gallery.videoReview.speechVoice'), exact: true })
      .fill('alternate-take');
    await expect(form(page).locator('[data-ai-preview]')).toHaveCount(0);
    expect(await requests(page)).toHaveLength(1);
    await form(page).locator('[data-ai-generate]').click();
    await ready(page, 1, locale);
    expect(await requests(page)).toHaveLength(2);
    expect(
      await page.evaluate(
        () => Reflect.get(window, 'pcmSpeechFixture').starts.at(-1)?.profile.voiceId
      )
    ).toBe('alternate-take');
    const preview = form(page).locator('[data-ai-preview]');
    await expect
      .poll(() => preview.evaluate((node: HTMLAudioElement) => node.readyState))
      .toBeGreaterThanOrEqual(1);
    await preview.press('Space');
    await expect
      .poll(() => preview.evaluate((node: HTMLAudioElement) => node.currentTime))
      .toBeGreaterThan(0);
    await screenshot(page, info, 'single-preview');
    await page.setViewportSize({ width: 1100, height: 560 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    ).toBeLessThanOrEqual(1);
    await page.setViewportSize(viewport);
    await form(page).locator('[data-ai-apply]').click();
    await expect.poll(async () => Boolean((await saved(page)).actions[0]?.narration)).toBe(true);
    const accepted = (await saved(page)).actions[0]!.narration;
    await closeForm(page, locale);
    await page.getByRole('button', { name: t('scenario.editor.guideUndo'), exact: true }).click();
    await expect.poll(async () => (await saved(page)).actions[0]?.narration).toBeNull();
    await page.getByRole('button', { name: t('scenario.editor.guideRedo'), exact: true }).click();
    await expect.poll(async () => (await saved(page)).actions[0]?.narration).toEqual(accepted);
    const reopen = new URL(page.url());
    reopen.pathname = SCENARIO_EDITOR_VISUAL_HARNESS_PATH;
    reopen.searchParams.set('locale', locale);
    reopen.searchParams.set('theme', theme);
    await page.goto(reopen.href, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: t('scenario.editor.tourMode'), exact: true }).click();
    expect((await saved(page)).actions[0]!.narration).toEqual(accepted);
    await selectAction(page, locale, 0);
    await page
      .locator('.tour-header-controls')
      .getByRole('button', { name: t('scenario.editor.tourPreviewSlide'), exact: true })
      .click();
    const player = page.locator('.tour-canvas .tour-stage-host #tour-player');
    await expect(
      player.locator('[data-tour-narration-replay], [data-tour-narration-toggle]')
    ).toHaveCount(0);
    await expect(player).toHaveAttribute('data-tour-playing', 'true');
    await expect
      .poll(() =>
        player
          .locator('audio:not([data-tour-music])')
          .evaluate((node: HTMLAudioElement) => node.currentTime)
      )
      .toBeGreaterThan(0);
    await player.locator('[data-tour-play]').click();
    await expect(player).toHaveAttribute('data-tour-playing', 'false');
    await page.evaluate(() => {
      const chunks: Uint8Array[] = [];
      let complete = false;
      Object.defineProperty(window, 'showSaveFilePicker', {
        configurable: true,
        value: async () => ({
          createWritable: async () =>
            new WritableStream<Uint8Array>({
              write(chunk) {
                chunks.push(chunk);
              },
              close() {
                complete = true;
              },
            }),
        }),
      });
      Object.defineProperty(window, 'savedAINarrationTourComplete', {
        configurable: true,
        get: () => complete,
      });
      Object.defineProperty(window, 'savedAINarrationTour', {
        configurable: true,
        get: () => {
          const decoder = new TextDecoder();
          return (
            chunks.map((chunk) => decoder.decode(chunk, { stream: true })).join('') +
            decoder.decode()
          );
        },
      });
    });
    await page
      .getByRole('button', { name: t('scenario.editor.tourReturnToEditing'), exact: true })
      .click();
    await page.getByRole('button', { name: t('scenario.editor.export'), exact: true }).click();
    await page
      .locator('.guide-export-stage')
      .getByRole('button', { name: t('scenario.editor.tourHtmlPrepare'), exact: true })
      .click();
    await page.getByRole('button', { name: t('scenario.editor.htmlSave'), exact: true }).click();
    await expect
      .poll(() => page.evaluate(() => Reflect.get(window, 'savedAINarrationTourComplete')))
      .toBe(true);
    const html = await page.evaluate(() => String(Reflect.get(window, 'savedAINarrationTour')));
    expect(html).toContain('</html>');
    expect(html).toContain('data:audio/wav');
    issues.assertClean();
  });

  test(`generates a selected batch and retains completed previews after failure and cancel ${locale}`, async ({
    page,
    hostOrigin,
  }, info) => {
    const t = await setup(page, hostOrigin, locale, theme, viewport);
    await openBatch(page);
    await modes(page, ['success', 'invalid', 'success']);
    await approve(page);
    await form(page).locator('[data-ai-generate]').click();
    await ready(page, 2, locale);
    await expect(form(page).getByRole('alert')).toContainText(texts[1]!);
    expect((await saved(page)).actions.every((action) => !action.narration)).toBe(true);
    await form(page).locator('[data-ai-generate]').click();
    await ready(page, 3, locale);
    expect((await requests(page)).map((request) => request.text)).toEqual([...texts, texts[1]]);
    await screenshot(page, info, 'batch-retry');
    await closeForm(page, locale, 'batch');
    await openBatch(page);
    await modes(page, ['success', 'hold']);
    await approve(page);
    await form(page).locator('[data-ai-generate]').click();
    await expect.poll(async () => (await requests(page)).length).toBe(6);
    await expect(form(page).locator('[data-ai-preview]')).toHaveCount(1);
    await expect(form(page).locator('[data-ai-apply-all]')).toBeDisabled();
    await expect(form(page).locator('[data-ai-apply]')).toBeDisabled();
    await form(page)
      .getByRole('button', { name: t('common.actions.cancel'), exact: true })
      .click();
    await ready(page, 1, locale);
    await expect
      .poll(() => page.evaluate(() => Reflect.get(window, 'pcmSpeechFixture').details[5]?.aborted))
      .toBe(true);
    expect(await page.evaluate(() => Reflect.get(window, 'pcmSpeechFixture').release(5))).toBe(
      false
    );
    expect(await requests(page)).toHaveLength(6);
    expect((await saved(page)).actions.every((action) => !action.narration)).toBe(true);
    await screenshot(page, info, 'batch-cancel');
  });

  test(`applies all ready batch results explicitly with advancing revisions ${locale}`, async ({
    page,
    hostOrigin,
  }, info) => {
    await setup(page, hostOrigin, locale, theme, viewport);
    await openBatch(page);
    await approve(page);
    await form(page).locator('[data-ai-generate]').click();
    await ready(page, 3, locale);
    const before = await saved(page);
    expect(before.actions.every((action) => !action.narration)).toBe(true);
    const excluded = before.actions[1]!.objectId;
    await form(page).locator(`[data-ai-target="${excluded}"]`).uncheck();
    await form(page).locator('[data-ai-apply-all]').click();
    await expect
      .poll(async () => (await saved(page)).actions.filter((action) => action.narration).length)
      .toBe(2);
    expect((await saved(page)).actions[1]!.narration).toBeNull();
    await form(page).locator(`[data-ai-apply="${excluded}"]`).click();
    await expect
      .poll(async () => (await saved(page)).actions.filter((action) => action.narration).length)
      .toBe(3);
    const after = await saved(page);
    expect(after.revision).toBeGreaterThanOrEqual(before.revision + 3);
    expect(after.resources).toHaveLength(3);
    expect(await requests(page)).toHaveLength(3);
    await expect(form(page).locator('[data-ai-apply]')).toHaveCount(0);
    await screenshot(page, info, 'batch-applied');
    const reopen = new URL(page.url());
    reopen.pathname = SCENARIO_EDITOR_VISUAL_HARNESS_PATH;
    reopen.searchParams.set('locale', locale);
    reopen.searchParams.set('theme', theme);
    await page.goto(reopen.href, { waitUntil: 'domcontentloaded' });
    expect((await saved(page)).actions.map((action) => action.narration)).toEqual(
      after.actions.map((action) => action.narration)
    );
  });

  test(`clears provider approval when destination changes and the form reopens ${locale}`, async ({
    page,
    hostOrigin,
  }) => {
    await setup(page, hostOrigin, locale, theme, viewport);
    await openSingle(page, locale);
    await approve(page);
    await form(page).locator('.sniptale-ai-model-selector-trigger').click();
    await form(page).getByRole('button', { name: 'Alternate fixture speech', exact: true }).click();
    await expect(form(page).locator('[data-ai-consent]')).not.toBeChecked();
    await expect(form(page).locator('[data-ai-generate]')).toBeDisabled();
    expect(await requests(page)).toEqual([]);
    await approve(page);
    await closeForm(page, locale);
    await openSingle(page, locale);
    await expect(form(page).locator('[data-ai-consent]')).not.toBeChecked();
    expect(await requests(page)).toEqual([]);
  });

  test(`rejects stale generated speech after editing the selected action text ${locale}`, async ({
    page,
    hostOrigin,
  }) => {
    const t = await setup(page, hostOrigin, locale, theme, viewport);
    await openSingle(page, locale);
    await modes(page, ['hold']);
    await approve(page);
    await form(page).locator('[data-ai-generate]').click();
    await expect.poll(async () => (await requests(page)).length).toBe(1);
    const other = await otherEditor(page, locale);
    try {
      await category(other, locale, 'textLabel');
      const field = inspector(other).getByRole('textbox', {
        name: t('scenario.editor.textLabel'),
        exact: true,
      });
      await field.fill('Changed source while provider was pending.');
      await field.press('Tab');
      await expect
        .poll(async () => (await saved(other)).actions[0]?.text)
        .toBe('Changed source while provider was pending.');
      await release(page, 0);
      await ready(page, 0, locale);
      await expect(form(page).getByRole('alert')).toBeVisible();
      expect((await saved(page)).actions[0]?.narration).toBeNull();
      expect(await requests(page)).toHaveLength(1);
    } finally {
      await other.close();
    }
  });

  test(`refuses Apply after another editor changes destination narration without another POST ${locale}`, async ({
    page,
    hostOrigin,
  }) => {
    await setup(page, hostOrigin, locale, theme, viewport);
    await openSingle(page, locale);
    await approve(page);
    await form(page).locator('[data-ai-generate]').click();
    await ready(page, 1, locale);
    const other = await otherEditor(page, locale);
    try {
      await category(other, locale, 'tourNarration');
      await inspector(other)
        .locator('.tour-audio-acquisition input[type="file"]')
        .setInputFiles({
          name: 'Competing narration.wav',
          mimeType: 'audio/wav',
          buffer: syntheticSpeechWav(1),
        });
      await expect.poll(async () => Boolean((await saved(other)).actions[0]?.narration)).toBe(true);
      const winner = (await saved(other)).actions[0]!.narration;
      await form(page).locator('[data-ai-apply]').click();
      await expect(form(page).getByRole('alert')).toBeVisible();
      expect((await saved(page)).actions[0]!.narration).toEqual(winner);
      await expect(form(page).locator('[data-ai-preview]')).toHaveCount(1);
      await expect(form(page).locator('[data-ai-apply]')).toBeEnabled();
      expect(await requests(page)).toHaveLength(1);
    } finally {
      await other.close();
    }
  });
}
