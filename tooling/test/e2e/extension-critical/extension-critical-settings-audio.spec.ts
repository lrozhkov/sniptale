import { expect, test } from '../support/extension-fixture';
import { translate } from '../../../../apps/extension/src/platform/i18n';

for (const viewport of [
  { width: 1280, height: 560 },
  { width: 1920, height: 900 },
]) {
  test(`audio model settings retain parameters and accessible footer ${viewport.width}`, async ({
    context,
    extensionId,
    hostOrigin,
  }, info) => {
    const providerName = `Audio fixture ${viewport.width}`;
    const modelName = `Speech fixture ${viewport.width}`;
    const page = await context.newPage();
    await page.setViewportSize(viewport);
    await page.goto(
      `chrome-extension://${extensionId}/apps/extension/src/settings/index.html?section=ai-connections`
    );
    const providers = page.getByRole('region', { name: /^(Providers|Провайдеры)$/u });
    await providers.getByRole('button', { name: /^(Add|Добавить)$/u }).click();
    const dialog = page.getByRole('dialog');
    await dialog.locator('input').nth(0).fill(providerName);
    await dialog.locator('input').nth(1).fill(`${hostOrigin}/v1`);
    await dialog.locator('input').nth(2).fill('audio-fixture-key-no-network');
    await dialog.getByRole('button', { name: /^(Add|Добавить)$/u }).click();
    await expect(providers).toContainText(providerName);
    const models = page.getByRole('region', { name: /^(Models|Модели)$/u });
    const locale = (await models.getAttribute('aria-label')) === 'Модели' ? 'ru' : 'en';
    const label = (key: Parameters<typeof translate>[0]) => translate(key, locale);
    await models.getByRole('button', { name: /^(Add|Добавить)$/u }).click();
    await dialog
      .getByRole('button', {
        name: label('settings.aiProviders.modelProviderPlaceholder'),
        exact: true,
      })
      .click();
    await page.getByRole('option', { name: providerName, exact: true }).click();
    await dialog
      .getByPlaceholder(label('settings.aiProviders.modelNamePlaceholder'), { exact: true })
      .fill(modelName);
    await dialog
      .getByPlaceholder(label('settings.aiProviders.modelCodePlaceholder'), { exact: true })
      .fill('fixture-speech');
    await dialog
      .getByLabel(label('settings.aiProviders.modelOperationLabel'), { exact: true })
      .click();
    await page
      .getByRole('option', {
        name: label('settings.aiProviders.modelOperationSpeech'),
        exact: true,
      })
      .click();
    await dialog
      .getByLabel(label('settings.aiProviders.modelAudioVoice'), { exact: true })
      .fill('fixture-voice');
    await dialog
      .getByLabel(label('settings.aiProviders.modelAudioSpeed'), { exact: true })
      .fill('1.15');
    await dialog
      .getByLabel(label('settings.aiProviders.modelAudioInstructions'), { exact: true })
      .fill('Calm delivery');
    const submit = dialog.getByRole('button', { name: /^(Add|Добавить)$/u });
    await submit.scrollIntoViewIfNeeded();
    await expect(submit).toBeInViewport();
    const box = await dialog.boundingBox();
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
    await page.screenshot({ path: info.outputPath('speech-model-footer.png'), fullPage: false });
    await submit.click();
    await expect(models).toContainText(modelName);
    await page.reload();
    await expect(models).toContainText(modelName);
    await expect(models).toContainText(label('settings.aiProviders.modelOperationSpeech'));
  });
}
