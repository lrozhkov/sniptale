import { expect, type Page } from '@playwright/test';
import { test } from '../support/extension-fixture';
import { openVisualHarness } from './scenario-editor-visual.helpers';

for (const theme of ['light', 'dark'] as const) {
  test(`previews explicit AI changes and undoes a partial application in ${theme}`, async ({
    page,
    hostOrigin,
  }, testInfo) => {
    await openVisualHarness(page, hostOrigin, theme, 'en', { width: 1280, height: 560 });
    await page.evaluate(() => {
      const original = chrome.runtime.sendMessage.bind(chrome.runtime);
      const requests: unknown[] = [];
      Reflect.set(window, 'guideAiRequests', requests);
      Reflect.set(chrome.runtime, 'sendMessage', async (message: unknown) => {
        if (!message || typeof message !== 'object' || !('type' in message))
          throw new Error('Invalid message');
        if (message.type === 'AI_SETTINGS_QUERY')
          return {
            success: true,
            modelSelection: {
              chromeAiEnabled: false,
              defaultModelId: '10000000-0000-4000-8000-000000000001',
              globalSystemPrompt: '',
              providers: [
                {
                  id: '10000000-0000-4000-8000-000000000002',
                  name: 'Test provider',
                  createdAt: 1,
                  connectionType: 'openai-compatible',
                  destinationKind: 'external',
                  hasStoredApiKey: true,
                },
              ],
              models: [
                {
                  id: '10000000-0000-4000-8000-000000000001',
                  providerId: '10000000-0000-4000-8000-000000000002',
                  modelCode: 'test',
                  displayName: 'Test model',
                },
              ],
            },
          };
        if (message.type === 'REQUEST_LLM_SESSION') return { success: true, token: 'test-token' };
        if (message.type === 'PROCESS_SCENARIO_EDITOR_WITH_LLM') {
          requests.push(message);
          return new Promise((resolve) =>
            Reflect.set(window, 'releaseGuideAi', () =>
              resolve({
                success: true,
                operations: [
                  { type: 'setStepTitle', stepId: 'compare', title: 'Suggested title' },
                  {
                    type: 'setStepParameters',
                    stepId: 'compare',
                    parameters: { showNumber: false },
                  },
                  {
                    type: 'setText',
                    stepId: 'compare',
                    blockId: 'description',
                    text: 'Suggested description',
                  },
                ],
              })
            )
          );
        }
        return original(message);
      });
    });
    const trigger = page.getByRole('button', { name: 'AI assistance', exact: true });
    await trigger.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Test provider / Test model', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => Reflect.get(window, 'guideAiRequests'))).toEqual([]);
    await dialog.getByRole('button', { name: 'Choose steps', exact: true }).click();
    await expect(dialog.getByText('Introduction', { exact: true })).toBeVisible();
    await dialog.getByRole('button', { name: 'Clear selection', exact: true }).click();
    await dialog.getByRole('textbox', { name: 'Find a step or section' }).fill('Text-only');
    await dialog.getByRole('button', { name: 'Select visible', exact: true }).click();
    await expect(dialog.getByText('Selected 1 of 2', { exact: true })).toBeVisible();
    await testInfo.attach(`ai-step-selection-${theme}`, {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
    await dialog.getByRole('button', { name: 'Entire guide', exact: true }).click();
    await expect(dialog.getByText('Selected 2 of 2', { exact: true })).toBeVisible();
    await dialog.getByRole('button', { name: 'Choose steps', exact: true }).click();
    await expect(
      dialog.getByRole('checkbox', { name: 'Text-only step', exact: true })
    ).toBeChecked();
    await expect(
      dialog.getByRole('checkbox', { name: 'Compare two images', exact: true })
    ).not.toBeChecked();
    await dialog.getByRole('button', { name: 'Entire guide', exact: true }).click();
    await dialog.getByRole('button', { name: 'Test provider / Test model', exact: true }).click();
    const modelSearch = dialog.locator('input[type="text"]');
    await modelSearch.fill('unmatched-model-filter');
    await expect(dialog.getByRole('button', { name: 'Test model', exact: true })).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Clear Search model...', exact: true }).click();
    await expect(modelSearch).toHaveValue('');
    await expect(modelSearch).toBeFocused();
    await expect(dialog.getByRole('button', { name: 'Test model', exact: true })).toBeVisible();
    await dialog.locator('input[type="text"]').press('Escape');
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole('button', { name: 'Test provider / Test model', exact: true })
    ).toBeFocused();
    await dialog.locator('textarea').focus();

    await expect(dialog.locator('textarea')).toBeFocused();
    await dialog.locator('.guide-ai-prompt-templates button[aria-haspopup="listbox"]').click();
    await expect(page.getByRole('option', { name: /Shorten/ })).toBeVisible();
    await expect(page.getByRole('option', { name: /Replace names/ })).toHaveCount(0);
    await page.getByRole('option', { name: /Shorten/ }).click();
    await expect(dialog.locator('textarea')).toHaveValue(/shorten|Shorten/);
    const field = await dialog.locator('textarea').boundingBox();
    const mic = await dialog.locator('[data-ui="scenario.voice-input"]').boundingBox();
    expect(field).not.toBeNull();
    expect(mic).not.toBeNull();
    expect(mic!.y).toBeGreaterThan(field!.y + 8);
    expect(mic!.y + mic!.height).toBeLessThanOrEqual(field!.y + field!.height);
    const prompt = dialog.locator('.guide-ai-prompt-input textarea');
    const acceptedPrompt = await prompt.inputValue();
    expect(
      await dialog.locator('[data-ui="scenario.voice-input"]').evaluate((node) => {
        const box = node.getBoundingClientRect();
        return node.contains(
          document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)
        );
      })
    ).toBe(true);

    await dialog.locator('.guide-ai-prompt-input .guide-voice-field').hover();
    const clearHit = await dialog
      .locator('.guide-ai-prompt-input .sniptale-field-clear')
      .evaluate((node) => {
        const box = node.getBoundingClientRect();
        const top = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
        const style = getComputedStyle(node);
        const parent = node.parentElement!;
        const textarea = parent.querySelector('textarea')!;
        return {
          owned: node.contains(top),
          top: top?.outerHTML.slice(0, 180),
          box: box.toJSON(),
          position: style.position,
          z: style.zIndex,
          pointer: style.pointerEvents,
          parent: parent.className,
          fieldZ: getComputedStyle(textarea).zIndex,
        };
      });
    expect(clearHit.owned, JSON.stringify(clearHit)).toBe(true);
    await dialog.locator('.guide-ai-prompt-input .sniptale-field-clear').click();
    await expect(prompt).toHaveValue('');
    await expect(prompt).toBeFocused();
    const clearedMic = (await dialog.locator('[data-ui="scenario.voice-input"]').boundingBox())!;
    expect(Math.abs(clearedMic.x - mic!.x)).toBeLessThanOrEqual(1);
    await prompt.fill(acceptedPrompt);

    await page.screenshot({
      path: testInfo.outputPath(`ai-instruction-${theme}.png`),
      fullPage: false,
    });
    await dialog.getByRole('button', { name: 'Get suggestions', exact: true }).click();
    await expect(dialog.locator('[aria-busy="true"]')).toBeVisible();
    await expect(dialog.locator('.guide-ai-pending svg')).toBeVisible();
    await expect(dialog.locator('textarea')).toBeDisabled();
    await expect(
      dialog.locator('.guide-ai-prompt-templates button[aria-haspopup="listbox"]')
    ).toBeDisabled();
    await page.evaluate(() => Reflect.get(window, 'releaseGuideAi')());
    await expect(dialog.getByText('Suggested title', { exact: true })).toBeVisible();
    const requests = await page.evaluate(() => Reflect.get(window, 'guideAiRequests'));
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      attachments: [],
      scope: { stepIds: ['compare', 'text-only'], blockIds: [] },
    });
    expect(requests[0].projectSnapshotJson).not.toMatch(/example.png|assetId/);
    await dialog.getByRole('switch', { name: 'Accept change 1', exact: true }).click();
    await testInfo.attach(`ai-preview-${theme}`, {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
    await dialog.getByRole('button', { name: 'Apply selected', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.locator('article#compare')).toContainText('Suggested description');
    await expect(page.locator('article#compare')).toContainText('Compare two images');
    await expect(page.locator('article#compare img')).toHaveCount(2);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(page.locator('article#compare')).toContainText(
      'Two images belong to this one step.'
    );
    await expect(page.locator('article#compare')).not.toContainText('Suggested description');
    await trigger.click();
    await dialog.press('Escape');
    await expect(trigger).toBeFocused();
    await page.evaluate(() => {
      const original = chrome.runtime.sendMessage.bind(chrome.runtime);
      Reflect.set(chrome.runtime, 'sendMessage', async (message: unknown) => {
        if (
          message &&
          typeof message === 'object' &&
          'type' in message &&
          message.type === 'PROCESS_SCENARIO_EDITOR_WITH_LLM'
        ) {
          return {
            success: true,
            operations: [
              {
                type: 'replaceStructure',
                items: [
                  {
                    kind: 'section',
                    id: 'ai-section',
                    title: 'AI section',
                    paragraphs: [],
                    numbering: { restartAt: 1 },
                  },
                  {
                    kind: 'step',
                    id: 'compare',
                    title: 'Rebuilt guide',
                    showNumber: true,
                    layout: 'stacked',
                    styleOverrides: {},
                    blocks: [
                      {
                        kind: 'note',
                        id: 'ai-note',
                        tone: 'warning',
                        paragraphs: [
                          {
                            runs: [
                              {
                                text: 'Verify the result offline.',
                                bold: false,
                                italic: false,
                                href: null,
                              },
                            ],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          };
        }
        return original(message);
      });
    });
    await trigger.click();
    await dialog.getByRole('button', { name: 'Entire guide', exact: true }).click();
    await dialog.getByRole('button', { name: 'Get suggestions', exact: true }).click();
    await expect(dialog.getByText('Rebuilt guide', { exact: true })).toBeVisible();
    await expect(dialog.getByText('Verify the result offline.', { exact: true })).toBeVisible();
    await expect(
      dialog.getByRole('button', { name: 'Apply selected', exact: true })
    ).toBeInViewport({ ratio: 1 });
    await testInfo.attach(`ai-structure-${theme}`, {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
    await dialog.getByRole('button', { name: 'Apply selected', exact: true }).click();
    await expect(page.locator('article#compare')).toContainText('Rebuilt guide');
    await expect(page.locator('article#text-only')).toHaveCount(0);
    await expect(page.locator('section#ai-section')).toContainText('AI section');
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(page.locator('article#compare img')).toHaveCount(2);
    await expect(page.locator('article#text-only')).toBeAttached();
    await expect(page.locator('section#ai-section')).toHaveCount(0);
  });
}

for (const theme of ['light', 'dark'] as const) {
  test(`Russian step picker fits compact view and supports keyboard selection in ${theme}`, async ({
    page,
    hostOrigin,
  }, testInfo) => {
    await openVisualHarness(page, hostOrigin, theme, 'ru', { width: 1280, height: 560 });
    await page.getByRole('button', { name: 'Помощь AI', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Выбрать шаги', exact: true }).click();
    await expect(dialog.getByRole('textbox', { name: 'Найти шаг или раздел' })).toBeVisible();
    const second = dialog.getByRole('checkbox', { name: 'Text-only step', exact: true });
    await second.focus();
    await second.press('Space');
    await expect(second).toBeChecked();
    await expect(dialog.getByText('Выбрано 2 из 2', { exact: true })).toBeVisible();
    await expect(
      dialog.getByRole('button', { name: 'Получить предложения', exact: true })
    ).toBeInViewport({ ratio: 1 });
    const overflow = await dialog.evaluate((node) => node.scrollWidth > node.clientWidth);
    expect(overflow).toBe(false);
    await testInfo.attach(`ai-step-selection-ru-${theme}`, {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
  });
}

async function installLargeModelCatalog(page: Page) {
  await page.evaluate(() => {
    const original = chrome.runtime.sendMessage.bind(chrome.runtime);
    Reflect.set(chrome.runtime, 'sendMessage', async (message: unknown) => {
      if (!message || typeof message !== 'object' || !('type' in message))
        throw new Error('Invalid message');
      if (message.type !== 'AI_SETTINGS_QUERY') return original(message);
      const providerId = '20000000-0000-4000-8000-000000000002';
      const models = Array.from({ length: 80 }, (_, index) => ({
        id: `10000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
        providerId,
        modelCode: `model-${index}`,
        displayName: `Model ${index + 1} — A long descriptive name for an instruction and reasoning model`,
      }));
      return {
        success: true,
        modelSelection: {
          chromeAiEnabled: false,
          defaultModelId: models[0]!.id,
          globalSystemPrompt: '',
          providers: [
            {
              id: providerId,
              name: 'A long user-defined provider name for a local model catalog',
              createdAt: 1,
              connectionType: 'openai-compatible',
              destinationKind: 'external',
              hasStoredApiKey: true,
            },
          ],
          models,
        },
      };
    });
  });
}

for (const locale of ['ru', 'en'] as const)
  for (const theme of ['light', 'dark'] as const)
    for (const size of [
      { width: 1280, height: 560 },
      { width: 1920, height: 900 },
    ])
      test(`model catalog bounded ${locale} ${theme} ${size.width}`, async ({
        page,
        hostOrigin,
      }, info) => {
        await openVisualHarness(page, hostOrigin, theme, locale, size);
        await installLargeModelCatalog(page);
        await page
          .getByRole('button', {
            name: locale === 'en' ? 'AI assistance' : 'Помощь AI',
            exact: true,
          })
          .click();
        const dialog = page.getByRole('dialog');
        const trigger = dialog.locator('.sniptale-ai-model-selector-trigger');
        await trigger.click();
        const menu = dialog.locator('.sniptale-dropdown-menu');
        const search = menu.locator('input');
        await expect(search).toBeFocused();
        await page.evaluate(() => document.fonts.ready);
        await page.screenshot({ path: info.outputPath('model-catalog.png'), fullPage: false });
        const bounds = (await menu.boundingBox())!;
        expect(bounds.y).toBeGreaterThanOrEqual(0);
        expect(bounds.x).toBeGreaterThanOrEqual(0);
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(size.width + 1);
        expect(bounds.y + bounds.height).toBeLessThanOrEqual(size.height + 1);
        expect(
          await dialog.evaluate((node) => node.scrollWidth - node.clientWidth)
        ).toBeLessThanOrEqual(1);
        const options = menu.locator('button[title^="Model "]');
        await expect(options).toHaveCount(80);
        const first = (await options.nth(0).boundingBox())!;
        const next = (await options.nth(1).boundingBox())!;
        expect(next.y - first.y - first.height).toBeGreaterThanOrEqual(1.5);
        await options.nth(1).hover();
        const list = menu.locator('.overflow-y-auto');
        expect(
          await list.evaluate((node) => node.scrollHeight - node.clientHeight)
        ).toBeGreaterThan(0);
        await list.hover();
        await page.mouse.wheel(0, 10000);
        await expect(options.last()).toBeInViewport({ ratio: 1 });
        await expect(search).toBeInViewport({ ratio: 1 });
        await search.fill('no-such-model');
        await expect(options).toHaveCount(0);
        const clear = menu.locator('button').filter({ has: page.locator('svg.lucide-x') });
        await clear.click();
        await expect(search).toHaveValue('');
        await expect(search).toBeFocused();
        await expect(options).toHaveCount(80);
        await search.fill('Model 80');
        await search.press('Tab');
        await expect(clear).toBeFocused();
        await page.keyboard.press('Tab');
        await expect(options.first()).toBeFocused();
        await page.keyboard.press('Enter');
        await expect(menu).toHaveCount(0);
        await expect(trigger).toContainText('Model 80');
        await expect(trigger).toBeFocused();
        await trigger.click();
        await search.press('Escape');
        await expect(trigger).toBeFocused();
        await expect(dialog).toBeVisible();
        await trigger.click();
        if (locale === 'en' && theme === 'light' && size.width === 1280) {
          for (const width of [1281, 1280, 1279, 1100]) {
            await page.setViewportSize({ width, height: 560 });
            await expect
              .poll(async () => {
                const box = (await menu.boundingBox())!;
                return (
                  box.x >= -1 &&
                  box.y >= -1 &&
                  box.x + box.width <= width + 1 &&
                  box.y + box.height <= 561
                );
              })
              .toBe(true);
            await page.screenshot({
              path: info.outputPath(`model-catalog-${width}.png`),
              fullPage: false,
            });
          }
          await page.setViewportSize(size);
        }
        await dialog.locator('.guide-ai-disclosure').click();
        await expect(menu).toHaveCount(0);
        await expect(trigger).toContainText('Model 80');
      });
