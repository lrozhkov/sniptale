import { writeFile } from 'node:fs/promises';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { test, expect } from '../support/extension-fixture';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { seedReviewVideo } from '../support/quick-editor-media-fixture';
import { readNativeVideoProject } from '../support/native-video-project';
import { chooseInspectorValue, checkInspectorPaintedFont } from '../support/inspector-utilities';
import { translate } from '../../../../apps/extension/src/platform/i18n';

test('Native export traverses production MV3 dispatch and publishes a decoded file', async ({
  page,
  extensionId,
}, info) => {
  test.setTimeout(150_000);
  const label = (key: Parameters<typeof translate>[0]) => translate(key, 'en');
  await page.setViewportSize({ ...PRIMARY_BROWSER_VIEWPORTS[0]!.size });
  await page.goto(`chrome-extension://${extensionId}/apps/extension/src/gallery/index.html`);
  await expect(page.locator('[data-ui="gallery.page.root"]')).toBeVisible();
  await page.evaluate(async () => {
    await chrome.storage.local.set({
      'sniptale-locale-preference': 'en',
      'sniptale-theme-preference': 'light',
    });
    localStorage.setItem('sniptale-locale-preference', 'en');
  });
  await seedReviewVideo(page, 'review-vp8-opus.webm', { width: 160, height: 90, duration: 12 });
  await page.goto(
    `chrome-extension://${extensionId}/apps/extension/src/video-editor/index.html?id=beta-v1-recording`
  );
  await expect(page.locator('[data-ui="video-editor.timeline.surface"]')).toBeVisible();
  const project = (await readNativeVideoProject(page))!;
  expect(project.clips.some((clip) => clip.type === 'VIDEO')).toBe(true);
  expect(await page.evaluate(() => Reflect.get(window, '__sniptaleHarness'))).toBeUndefined();
  await page.evaluate(() => {
    const messages: unknown[] = [];
    Object.assign(window, { nativeMv3ExportMessages: messages });
    chrome.runtime.onMessage.addListener((message: unknown) => {
      if (
        typeof message !== 'object' ||
        message === null ||
        !('type' in message) ||
        typeof message.type !== 'string'
      )
        return;
      const summary: Record<string, string> = { type: message.type };
      for (const [key, value] of Object.entries(message))
        if (
          ['jobId', 'projectId', 'exportId', 'filename', 'format'].includes(key) &&
          typeof value === 'string'
        )
          summary[key] = value;
      messages.push(summary);
    });
  });
  await page.locator('[data-ui="video-editor.timeline.toolbar.project-menu"]').click();
  await page
    .getByRole('button', { name: label('videoEditor.app.exportButton'), exact: true })
    .click();
  const inspector = page.locator('[data-ui="video-editor.export.inspector"]');
  await expect(inspector).toBeVisible();
  await chooseInspectorValue(
    page,
    inspector,
    label('videoEditor.exportDialog.formatLabel'),
    label('videoEditor.exportDialog.formatWebmLabel')
  );
  await chooseInspectorValue(
    page,
    inspector,
    label('videoEditor.exportDialog.resolutionLabel'),
    label('videoEditor.exportDialog.resolutionSource')
  );
  const fps = inspector.getByRole('textbox', {
    name: label('videoEditor.exportDialog.fpsLabel'),
    exact: true,
  });
  await fps.fill('30');
  await fps.press('Tab');
  const download = inspector.getByRole('checkbox', {
    name: label('videoEditor.exportDialog.downloadAfterExport'),
    exact: true,
  });
  if (await download.isChecked()) await download.click();
  const submit = inspector.getByRole('button', {
    name: label('videoEditor.exportDialog.submit'),
    exact: true,
  });
  await submit.scrollIntoViewIfNeeded();
  await checkInspectorPaintedFont(page, submit, 'native-mv3-export-submit');
  await page.screenshot({
    path: info.outputPath('native-mv3-export-inspector.png'),
    fullPage: false,
  });
  await submit.click();
  const messages = async () => {
    const value: unknown = await page.evaluate(() =>
      Reflect.get(window, 'nativeMv3ExportMessages')
    );
    if (!Array.isArray(value)) throw new Error('Missing native export event observer');
    return value.filter(isRecord);
  };
  await expect
    .poll(async () => (await messages()).map((message) => message['type']), { timeout: 60_000 })
    .toContain(VideoMessageType.PROJECT_EXPORT_COMPLETED);
  const observed = await messages();
  const completed = observed.find(
    (message) => message['type'] === VideoMessageType.PROJECT_EXPORT_COMPLETED
  );
  if (typeof completed?.['exportId'] !== 'string')
    throw new Error('Missing completed native export identity');
  expect(
    observed.some((message) => message['type'] === VideoMessageType.PROJECT_EXPORT_FAILED)
  ).toBe(false);
  expect(completed['projectId']).toBe(project.id);
  expect(observed.map((message) => message['type'])).toContain(
    VideoMessageType.OFFSCREEN_START_PROJECT_EXPORT
  );
  const decoded = await page.evaluate(async (id) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('sniptale-db');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const row: unknown = await new Promise((resolve, reject) => {
      const request = db.transaction('project_exports').objectStore('project_exports').get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    if (
      typeof row !== 'object' ||
      row === null ||
      !('assetId' in row) ||
      typeof row.assetId !== 'string'
    )
      throw new Error('Missing persisted native export asset');
    const objects = await (
      await (await navigator.storage.getDirectory()).getDirectoryHandle('sniptale-assets')
    ).getDirectoryHandle('objects');
    const file = await (await objects.getFileHandle(row.assetId)).getFile();
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.muted = true;
    document.body.append(video);
    try {
      await new Promise<void>((resolve, reject) => {
        video.onloadeddata = () => resolve();
        video.onerror = () => reject(new Error('Published native export cannot decode'));
        video.src = url;
      });
      await new Promise<void>((resolve, reject) => {
        video.onseeked = () => resolve();
        video.onerror = () => reject(new Error('Published native export cannot seek'));
        video.currentTime = 1;
      });
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext('2d')!;
      context.drawImage(video, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let colored = 0;
      for (let index = 0; index < pixels.length; index += 4)
        if (Math.max(pixels[index]!, pixels[index + 1]!, pixels[index + 2]!) > 64) colored++;
      return {
        bytes: file.size,
        width: video.videoWidth,
        height: video.videoHeight,
        duration: video.duration,
        colored,
      };
    } finally {
      video.remove();
      URL.revokeObjectURL(url);
    }
  }, completed['exportId']);
  expect(decoded.bytes).toBeGreaterThan(0);
  expect(decoded.width).toBe(project.width);
  expect(decoded.height).toBe(project.height);
  expect(Math.abs(decoded.duration - project.duration)).toBeLessThanOrEqual(1 / 30 + 0.000001);
  expect(decoded.colored).toBeGreaterThan(50);
  await writeFile(
    info.outputPath('native-mv3-export.json'),
    JSON.stringify({ completed, observed, decoded, project })
  );
  await page.reload();
  await expect(page.locator('[data-ui="video-editor.timeline.surface"]')).toBeVisible();
  expect((await readNativeVideoProject(page))?.clips).toEqual(project.clips);
});
