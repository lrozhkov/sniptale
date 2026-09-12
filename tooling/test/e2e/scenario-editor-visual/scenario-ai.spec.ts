import { expect } from '@playwright/test';
import { test } from '../support/extension-fixture';
import { openVisualHarness } from './scenario-editor-visual.helpers';

for (const theme of ['light', 'dark'] as const) {
  test(`previews explicit AI changes and undoes a partial application in ${theme}`, async ({
    page,
    hostOrigin,
  }, testInfo) => {
    await openVisualHarness(page, hostOrigin, theme, 'en', { width: 1024, height: 640 });
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
    await dialog.getByRole('button', { name: 'Test provider / Test model', exact: true }).click();
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
    await testInfo.attach(`ai-instruction-${theme}`, {
      body: await page.screenshot(),
      contentType: 'image/png',
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
      scope: { stepIds: ['compare'], blockIds: [] },
    });
    expect(requests[0].projectSnapshotJson).not.toMatch(/example.png|assetId|Text-only step/);
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
  });
}
