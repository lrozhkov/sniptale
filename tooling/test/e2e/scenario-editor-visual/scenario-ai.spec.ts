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
          return {
            success: true,
            operations: [
              { type: 'setStepTitle', stepId: 'compare', title: 'Suggested title' },
              {
                type: 'setText',
                stepId: 'compare',
                blockId: 'description',
                text: 'Suggested description',
              },
            ],
          };
        }
        return original(message);
      });
    });
    const trigger = page.getByRole('button', { name: 'Help with text', exact: true });
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
    await dialog.getByRole('button', { name: 'Get suggestions', exact: true }).click();
    await expect(dialog.getByText('Suggested title', { exact: true })).toBeVisible();
    const requests = await page.evaluate(() => Reflect.get(window, 'guideAiRequests'));
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      attachments: [],
      scope: { stepIds: ['compare'], blockIds: [] },
    });
    expect(requests[0].projectSnapshotJson).not.toMatch(/example.png|assetId|Text-only step/);
    await dialog.getByRole('checkbox', { name: 'Accept change 1', exact: true }).uncheck();
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
