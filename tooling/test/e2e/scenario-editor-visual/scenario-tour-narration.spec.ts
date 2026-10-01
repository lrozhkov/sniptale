import { expect } from '@playwright/test';
import { test } from '../support/extension-fixture';
import { openVisualHarness, createPageIssueCollector } from './scenario-editor-visual.helpers';

/** Five seconds of real PCM exercise decoding without microphone permissions or mocked play(). */
function narrationWav() {
  const samples = 8000 * 5;
  const wav = Buffer.alloc(44 + samples * 2);
  wav.write('RIFF', 0);
  wav.write('WAVE', 8);
  wav.write('fmt ', 12);
  wav.write('data', 36);
  for (const [offset, value] of [
    [4, wav.length - 8],
    [16, 16],
    [24, 8000],
    [28, 16000],
    [40, samples * 2],
  ])
    wav.writeUInt32LE(value, offset);
  for (const [offset, value] of [
    [20, 1],
    [22, 1],
    [32, 2],
    [34, 16],
  ])
    wav.writeUInt16LE(value, offset);
  for (let index = 0; index < samples; index++)
    wav.writeInt16LE(
      Math.round(Math.sin((index * 2 * Math.PI * 220) / 8000) * 1000),
      44 + index * 2
    );
  return wav;
}

test('attached narration decodes and plays in editor and exact exported tour at HD', async ({
  page,
  hostOrigin,
}, info) => {
  const issues = createPageIssueCollector(page);
  await openVisualHarness(
    page,
    hostOrigin,
    'light',
    'en',
    { width: 1280, height: 720 },
    'compare',
    { tourFixture: '1' }
  );
  await page.getByRole('button', { name: 'Interactive tour', exact: true }).click();
  await page.locator('.tour-slide-select:has(img)').first().click();
  const library = page.locator('#guide-library-panel');
  await library
    .locator('.guide-left-navigation')
    .getByRole('button', { name: 'Resources', exact: true })
    .click();
  await library
    .locator('.tour-audio-acquisition input[type="file"]')
    .setInputFiles({ name: 'Voice.wav', mimeType: 'audio/wav', buffer: narrationWav() });
  await expect(library.locator('.tour-audio-resource')).toHaveCount(1);
  await library.locator('.tour-audio-resource').hover();
  await library.getByRole('button', { name: 'Attach to selection', exact: true }).click();
  await expect(library.getByRole('button', { name: 'Bindings: 1', exact: true })).toBeVisible();
  await page
    .locator('.tour-header-controls')
    .getByRole('button', { name: 'Preview', exact: true })
    .click();
  const player = page.locator('.tour-stage-host').locator('#tour-player');
  const audio = player.locator('audio');
  await expect
    .poll(() => audio.evaluate((node: HTMLAudioElement) => node.currentTime))
    .toBeGreaterThan(0.1);
  await expect(player.locator('[data-tour-status]')).toBeHidden();
  expect(await audio.evaluate((node: HTMLAudioElement) => node.error)).toBeNull();
  const title = await player.locator('[data-tour-title]').textContent();
  await info.attach('narration-editor-HD', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await page
    .locator('.guide-export-stage')
    .getByRole('button', { name: 'Prepare and preview', exact: true })
    .click();
  const exported = page
    .frameLocator('.tour-export-frame iframe')
    .frameLocator('iframe')
    .locator('#tour-player');
  await exported.locator('[data-tour-contents]').click();
  await exported.locator('.tour-contents-list button').filter({ hasText: title! }).click();
  await expect(exported.locator('[data-tour-play]')).toHaveAttribute('aria-pressed', 'false');
  await exported.locator('[data-tour-play]').click();
  const exportedAudio = exported.locator('audio');
  await expect
    .poll(() => exportedAudio.evaluate((node: HTMLAudioElement) => node.currentTime))
    .toBeGreaterThan(0.1);
  expect(await exportedAudio.evaluate((node: HTMLAudioElement) => node.error)).toBeNull();
  await expect(exported.locator('[data-tour-status]')).toBeHidden();
  await page.getByRole('button', { name: 'Back to editing', exact: true }).click();
  await expect(page.locator('.guide-export-workspace')).toHaveCount(0);
  issues.assertClean();
});
