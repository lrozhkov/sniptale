import type { Page, TestInfo } from '@playwright/test';
import { expect } from '../support/extension-fixture';
import type { BrowserContext } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

async function inspectRecordedSimplify(popup: Page, recordingId: string) {
  return popup.evaluate(async (recordingId) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('sniptale-db');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    let reference: unknown;
    try {
      const recording = await new Promise<unknown>((resolve, reject) => {
        const request = database
          .transaction('recordings', 'readonly')
          .objectStore('recordings')
          .get(recordingId);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      if (
        typeof recording !== 'object' ||
        recording === null ||
        !('assetId' in recording) ||
        typeof recording.assetId !== 'string'
      )
        throw new Error('Saved recording source identity missing');
      reference = await new Promise<unknown>((resolve, reject) => {
        const request = database
          .transaction('asset_refs', 'readonly')
          .objectStore('asset_refs')
          .get(recording.assetId);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } finally {
      database.close();
    }
    const records = [reference];
    for (const record of records) {
      if (
        typeof record !== 'object' ||
        record === null ||
        !('mimeType' in record) ||
        typeof record.mimeType !== 'string' ||
        !record.mimeType.startsWith('video/') ||
        !('location' in record)
      )
        continue;
      const location = record.location;
      if (
        typeof location !== 'object' ||
        location === null ||
        !('objectKey' in location) ||
        typeof location.objectKey !== 'string'
      )
        continue;
      const parts = location.objectKey.split('/');
      const filename = parts.pop();
      if (!filename || parts.some((part) => !part || part === '..'))
        throw new Error('Invalid saved video location');
      let directory = await (
        await navigator.storage.getDirectory()
      ).getDirectoryHandle('sniptale-assets');
      for (const part of parts) directory = await directory.getDirectoryHandle(part);
      const file = await (await directory.getFileHandle(filename)).getFile();
      const url = URL.createObjectURL(new Blob([file], { type: record.mimeType }));
      const video = document.createElement('video');
      video.muted = true;
      video.playbackRate = 4;
      const canvas = document.createElement('canvas');
      try {
        await new Promise<void>((resolve, reject) => {
          video.onloadeddata = () => resolve();
          video.onerror = () => reject(new Error('Saved recording cannot decode'));
          video.src = url;
        });
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Video proof canvas missing');
        let coral = 0;
        await new Promise<void>((resolve, reject) => {
          let finished = false;
          const complete = () => {
            if (finished) return;
            finished = true;
            video.pause();
            resolve();
          };
          video.onended = complete;
          video.onerror = () => reject(new Error('Saved recording playback failed'));
          const frame = () => {
            if (finished) return;
            context.drawImage(video, 0, 0);
            const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
            coral = 0;
            for (let index = 0; index < pixels.length; index += 4)
              if (
                Math.abs(pixels[index]! - 255) <= 20 &&
                Math.abs(pixels[index + 1]! - 127) <= 20 &&
                Math.abs(pixels[index + 2]! - 80) <= 20
              )
                coral++;
            if (coral > 1000) complete();
            else video.requestVideoFrameCallback(frame);
          };
          video.requestVideoFrameCallback(frame);
          void video.play().catch(reject);
        });
        return {
          coral,
          width: canvas.width,
          height: canvas.height,
          bytes: file.size,
          frame: canvas.toDataURL('image/png'),
        };
      } finally {
        video.pause();
        video.removeAttribute('src');
        video.load();
        URL.revokeObjectURL(url);
      }
    }
    throw new Error('Saved recording asset missing');
  }, recordingId);
}
export async function startSimplifyRecording(
  context: BrowserContext,
  extensionId: string,
  page: Page
) {
  const browser = context.browser();
  if (!browser) throw new Error('Native extension browser missing');
  const session = await browser.newBrowserCDPSession();
  try {
    const targets = await session.send('Target.getTargets', {
      filter: [{ type: 'tab', exclude: false }, { exclude: true }],
    });
    const target = targets.targetInfos.find((value) => value.url === page.url());
    if (!target) throw new Error('Recording tab missing');
    await session.send('Extensions.triggerAction', {
      id: extensionId,
      targetId: target.targetId,
    });
  } finally {
    await session.detach();
  }
  await page.bringToFront();
  await page.locator('[data-ui="content.toolbar.video-recording.start"]').click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: /^(Continue|Продолжить)$/u })
    .click();
  await expect(page.locator('[data-ui="content.toolbar.video-recording.pause"]')).toBeVisible({
    timeout: 30_000,
  });
}

export async function assertSavedSimplifyRecording(page: Page, popup: Page, info: TestInfo) {
  await page.locator('[data-ui="content.toolbar.video-recording.stop"]').click();
  await expect
    .poll(
      () =>
        popup.evaluate(async () => {
          const response: unknown = await chrome.runtime.sendMessage({
            type: 'GET_RECORDING_STATE',
            __sniptaleRuntimeFreshness: {
              issuedAtEpochMs: Date.now(),
              nonce: crypto.randomUUID(),
            },
          });
          if (
            typeof response !== 'object' ||
            response === null ||
            !('postRecordResult' in response)
          )
            return false;
          const result = response.postRecordResult;
          return (
            typeof result === 'object' &&
            result !== null &&
            'recordingId' in result &&
            typeof result.recordingId === 'string'
          );
        }),
      { timeout: 30_000 }
    )
    .toBe(true);
  const recordingId = await popup.evaluate(async () => {
    const value: unknown = await chrome.runtime.sendMessage({
      type: 'GET_RECORDING_STATE',
      __sniptaleRuntimeFreshness: {
        issuedAtEpochMs: Date.now(),
        nonce: crypto.randomUUID(),
      },
    });
    if (typeof value !== 'object' || value === null || !('postRecordResult' in value))
      throw new Error('Recording result missing');
    const result = value.postRecordResult;
    if (
      typeof result !== 'object' ||
      result === null ||
      !('recordingId' in result) ||
      typeof result.recordingId !== 'string'
    )
      throw new Error('Recording identity missing');
    return result.recordingId;
  });
  const recorded = await inspectRecordedSimplify(popup, recordingId);
  expect(recorded.coral, 'Saved recording must contain actual Simplify pixels').toBeGreaterThan(
    1000
  );
  await writeFile(
    info.outputPath('recorded-simplify-frame.png'),
    Buffer.from(recorded.frame.slice(recorded.frame.indexOf(',') + 1), 'base64')
  );
}
