import { translate } from '../../../../apps/extension/src/platform/i18n';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { expect, type Page, type TestInfo } from '@playwright/test';
import { test } from '../support/extension-fixture';
import {
  applyHarnessBootstrap,
  countRuntimeMessagesByType,
  createVideoExportStatus,
  E2E_RUNTIME_SUCCESS_API_BEHAVIOR,
  emitHarnessRuntimeMessage,
  getRuntimeMessagesByType,
  VIDEO_EDITOR_EXPORT_BUTTON_LABEL,
  VIDEO_EDITOR_EXPORT_FAILURE_CLOSE_LABEL,
  VIDEO_EDITOR_EXPORT_FAILURE_RETRY_LABEL,
  VIDEO_EDITOR_EXPORT_FAILURE_TITLE,
  VIDEO_EDITOR_EXPORT_SUBMIT_LABEL,
  VIDEO_EDITOR_HARNESS_PATH,
  VIDEO_EDITOR_PROGRESS_CANCEL_LABEL,
  VideoExportFormat,
  VideoMessageType,
  VideoProjectExportPhase,
} from '../extension-critical.helpers';

type StartedVideoExport = {
  jobId: string;
  projectId: string;
};

const E2E_VIDEO_EDITOR_DOCUMENT_ID = 'e2e-video-editor-document';

async function openVideoEditorHarness(page: Page, hostOrigin: string) {
  await applyHarnessBootstrap(page, {
    apiBehavior: E2E_RUNTIME_SUCCESS_API_BEHAVIOR,
    runtimeResponses: {
      [VideoMessageType.GET_PROJECT_EXPORT_CAPABILITIES]: {
        success: true,
        capabilityToken: 'e2e-export-start-capability',
        cancelCapabilityToken: 'e2e-export-cancel-capability',
        ownerDocumentId: E2E_VIDEO_EDITOR_DOCUMENT_ID,
      },
      [VideoMessageType.START_PROJECT_EXPORT]: {
        success: true,
        capabilityToken: 'e2e-export-cancel-capability',
        ownerDocumentId: E2E_VIDEO_EDITOR_DOCUMENT_ID,
      },
      [VideoMessageType.CANCEL_PROJECT_EXPORT]: { success: true },
    },
  });
  await page.goto(`${hostOrigin}${VIDEO_EDITOR_HARNESS_PATH}`, {
    waitUntil: 'domcontentloaded',
  });
}

async function expectVideoEditorStackSpacingCompatibility(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const stack = document.createElement('div');
        const first = document.createElement('div');
        const second = document.createElement('div');
        stack.className = 'space-y-3';
        stack.append(first, second);
        document.body.append(stack);

        const result = {
          firstMarginBottom: getComputedStyle(first).marginBottom,
          secondMarginTop: getComputedStyle(second).marginTop,
        };
        stack.remove();
        return result;
      })
    )
    .toEqual({
      firstMarginBottom: '0px',
      secondMarginTop: '12px',
    });
}

async function startVideoExport(page: Page): Promise<StartedVideoExport> {
  const exportButton = page.getByRole('button', {
    name: VIDEO_EDITOR_EXPORT_BUTTON_LABEL,
    exact: true,
  });
  await expect(exportButton).toBeVisible();

  await exportButton.click();
  await page.getByRole('button', { name: VIDEO_EDITOR_EXPORT_SUBMIT_LABEL, exact: true }).click();

  await expect
    .poll(() => {
      return countRuntimeMessagesByType(page, VideoMessageType.START_PROJECT_EXPORT);
    })
    .toBe(1);

  const [startMessage] = await getRuntimeMessagesByType(
    page,
    VideoMessageType.START_PROJECT_EXPORT
  );
  assertVideoExportStartMessage(startMessage);

  const jobId = typeof startMessage.jobId === 'string' ? startMessage.jobId : '';
  const projectId = getProjectId(startMessage);

  expect(jobId).not.toBe('');
  expect(projectId).not.toBe('');

  return {
    jobId,
    projectId,
  };
}

function assertVideoExportStartMessage(
  startMessage: Awaited<ReturnType<typeof getRuntimeMessagesByType>>[number]
) {
  expect(startMessage).toMatchObject({
    type: VideoMessageType.START_PROJECT_EXPORT,
    jobId: expect.any(String),
    settings: expect.objectContaining({
      format: expect.any(String),
      fps: expect.any(Number),
      width: expect.any(Number),
      height: expect.any(Number),
    }),
    input: expect.objectContaining({
      contentSha256: expect.stringMatching(/^sha256:[a-f0-9]{64}$/u),
      jobId: expect.any(String),
      projectId: expect.any(String),
      retainedByteLength: expect.any(Number),
    }),
  });
  expect(startMessage).not.toHaveProperty('project');
}

function getProjectId(startMessage: Awaited<ReturnType<typeof getRuntimeMessagesByType>>[number]) {
  if (
    typeof startMessage.input === 'object' &&
    startMessage.input !== null &&
    typeof startMessage.input.projectId === 'string'
  ) {
    return startMessage.input.projectId;
  }

  return '';
}

async function expectVideoExportProgress(page: Page, jobId: string, progress: number) {
  const targetSenderUrl = await page.evaluate(
    () => `${window.location.origin}${window.location.pathname}`
  );
  await emitHarnessRuntimeMessage(page, {
    type: VideoMessageType.PROJECT_EXPORT_PROGRESS,
    jobId,
    status: createVideoExportStatus(VideoProjectExportPhase.RENDERING, progress),
    targetDocumentId: E2E_VIDEO_EDITOR_DOCUMENT_ID,
    targetSenderUrl,
  });

  await expect(
    page.getByRole('progressbar', {
      name: translate('videoEditor.progress.rendering', 'ru'),
      exact: true,
    })
  ).toHaveAttribute('aria-valuenow', String(progress));
  await expect(
    page.getByRole('button', { name: VIDEO_EDITOR_PROGRESS_CANCEL_LABEL, exact: true })
  ).toBeVisible();
  await expect(page.getByText(`${progress}%`, { exact: true })).toBeVisible();
}

async function captureVideoExportDialogScreenshot(page: Page, testInfo: TestInfo): Promise<void> {
  await mkdir(testInfo.outputDir, { recursive: true });
  await page.screenshot({
    path: testInfo.outputPath('video-editor-export-dialog.png'),
    fullPage: true,
  });
}

test('video editor export reacts to runtime progress and completion events', async ({
  page,
  hostOrigin,
}, testInfo) => {
  await openVideoEditorHarness(page, hostOrigin);
  await expectVideoEditorStackSpacingCompatibility(page);
  await page.getByRole('button', { name: VIDEO_EDITOR_EXPORT_BUTTON_LABEL, exact: true }).click();
  await expect(
    page.getByRole('button', { name: VIDEO_EDITOR_EXPORT_SUBMIT_LABEL, exact: true })
  ).toBeVisible();
  await captureVideoExportDialogScreenshot(page, testInfo);

  await page.getByRole('button', { name: VIDEO_EDITOR_EXPORT_SUBMIT_LABEL, exact: true }).click();

  await expect
    .poll(() => {
      return countRuntimeMessagesByType(page, VideoMessageType.START_PROJECT_EXPORT);
    })
    .toBe(1);

  const [startMessage] = await getRuntimeMessagesByType(
    page,
    VideoMessageType.START_PROJECT_EXPORT
  );
  assertVideoExportStartMessage(startMessage);
  const jobId = typeof startMessage.jobId === 'string' ? startMessage.jobId : '';
  const projectId = getProjectId(startMessage);

  await expectVideoExportProgress(page, jobId, 42);
  await emitHarnessRuntimeMessage(page, {
    type: VideoMessageType.PROJECT_EXPORT_COMPLETED,
    jobId,
    projectId,
    exportId: 'export-harness',
    filename: 'demo.webm',
    format: VideoExportFormat.WEBM,
    targetDocumentId: E2E_VIDEO_EDITOR_DOCUMENT_ID,
    targetSenderUrl: await page.evaluate(
      () => `${window.location.origin}${window.location.pathname}`
    ),
  });

  await expect(
    page.getByRole('button', { name: VIDEO_EDITOR_PROGRESS_CANCEL_LABEL, exact: true })
  ).toBeHidden();
  await expect(
    page.getByRole('button', { name: VIDEO_EDITOR_EXPORT_BUTTON_LABEL, exact: true })
  ).toBeVisible();
});

test('video editor export cancellation dispatches a typed runtime message', async ({
  page,
  hostOrigin,
}) => {
  await openVideoEditorHarness(page, hostOrigin);
  const { jobId } = await startVideoExport(page);
  await expectVideoExportProgress(page, jobId, 18);

  const cancelButton = page.getByRole('button', {
    name: VIDEO_EDITOR_PROGRESS_CANCEL_LABEL,
    exact: true,
  });
  await expect(cancelButton).toBeVisible();
  await cancelButton.click();

  await expect
    .poll(() => {
      return countRuntimeMessagesByType(page, VideoMessageType.CANCEL_PROJECT_EXPORT);
    })
    .toBe(1);

  const [cancelMessage] = await getRuntimeMessagesByType(
    page,
    VideoMessageType.CANCEL_PROJECT_EXPORT
  );
  expect(cancelMessage).toMatchObject({
    type: VideoMessageType.CANCEL_PROJECT_EXPORT,
    jobId,
  });

  await expect(cancelButton).toBeHidden();
});

test('video editor surfaces detached export failures and supports retry or close', async ({
  page,
  hostOrigin,
}) => {
  await openVideoEditorHarness(page, hostOrigin);
  const first = await startVideoExport(page);
  const targetSenderUrl = await page.evaluate(
    () => `${window.location.origin}${window.location.pathname}`
  );

  await emitHarnessRuntimeMessage(page, {
    type: VideoMessageType.PROJECT_EXPORT_FAILED,
    error: 'EffectV1 render failed',
    jobId: first.jobId,
    targetDocumentId: E2E_VIDEO_EDITOR_DOCUMENT_ID,
    targetSenderUrl,
  });

  const failureDialog = page.getByRole('alertdialog');
  await expect(failureDialog).toContainText(VIDEO_EDITOR_EXPORT_FAILURE_TITLE);
  await expect(failureDialog).not.toContainText('EffectV1 render failed');
  await expect(failureDialog).toHaveAttribute('aria-modal', 'true');
  await expect(failureDialog.getByRole('button').first()).toBeFocused();
  await failureDialog
    .getByRole('button', { name: VIDEO_EDITOR_EXPORT_FAILURE_RETRY_LABEL, exact: true })
    .click();
  await expect
    .poll(() => countRuntimeMessagesByType(page, VideoMessageType.START_PROJECT_EXPORT))
    .toBe(2);

  const startMessages = await getRuntimeMessagesByType(page, VideoMessageType.START_PROJECT_EXPORT);
  const retryJobId = startMessages[1]?.jobId;
  if (typeof retryJobId !== 'string' || retryJobId === first.jobId) {
    throw new Error('Retry did not create a fresh export job');
  }
  await emitHarnessRuntimeMessage(page, {
    type: VideoMessageType.PROJECT_EXPORT_FAILED,
    error: 'Retry failed',
    jobId: retryJobId,
    targetDocumentId: E2E_VIDEO_EDITOR_DOCUMENT_ID,
    targetSenderUrl,
  });
  await expect(failureDialog).toBeVisible();
  await expect(failureDialog).not.toContainText('Retry failed');
  await expect(failureDialog.getByRole('button').first()).toBeFocused();
  await failureDialog
    .getByRole('button', { name: VIDEO_EDITOR_EXPORT_FAILURE_CLOSE_LABEL, exact: true })
    .last()
    .click();
  await expect(failureDialog).toBeHidden();
});

async function readProductionExportLedger(page: Page) {
  return page.evaluate(async () => {
    const values = await chrome.storage.session.get('sniptale_project_export_active_job');
    const entry: unknown = values['sniptale_project_export_active_job'];
    if (typeof entry !== 'object' || entry === null) return null;
    return {
      jobId: 'jobId' in entry && typeof entry.jobId === 'string' ? entry.jobId : null,
      status: 'status' in entry && typeof entry.status === 'string' ? entry.status : null,
    };
  });
}

async function verifyProductionExportMedia(page: Page, file: string) {
  const bytes = await readFile(file);
  expect(bytes.byteLength).toBeGreaterThan(1000);
  const media = await page.evaluate(async (base64) => {
    const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: 'video/mp4' }));
    const video = document.createElement('video');
    video.muted = true;
    video.preload = 'auto';
    try {
      await new Promise<void>((resolve, reject) => {
        video.onloadeddata = () => resolve();
        video.onerror = () => reject(new Error('Export cannot be decoded'));
        video.src = url;
      });
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 36;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Missing frame sampling canvas');
      const frames: number[][] = [];
      for (const time of [1, 3]) {
        await new Promise<void>((resolve) => {
          video.onseeked = () => resolve();
          video.currentTime = time;
        });
        context.drawImage(video, 0, 0, 64, 36);
        frames.push(Array.from(context.getImageData(0, 0, 64, 36).data));
      }
      return {
        duration: video.duration,
        width: video.videoWidth,
        height: video.videoHeight,
        frames,
      };
    } finally {
      video.src = '';
      URL.revokeObjectURL(url);
    }
  }, bytes.toString('base64'));
  expect(media).toMatchObject({ width: 1920, height: 1080 });
  expect(media.duration).toBeGreaterThanOrEqual(3.9);
  expect(media.duration).toBeLessThan(4.2);
  expect(media.frames[0]).not.toEqual(media.frames[1]);
  for (const frame of media.frames) {
    let colored = 0;
    for (let offset = 0; offset < frame.length; offset += 4) {
      const channels = frame.slice(offset, offset + 3);
      if (Math.max(...channels) - Math.min(...channels) > 80) colored++;
    }
    expect(colored).toBeGreaterThan(800);
  }
  return {
    duration: media.duration,
    width: media.width,
    height: media.height,
    bytes: bytes.byteLength,
  };
}

test('real video export completes after automatic library save, repeats and survives reopen', async ({
  page,
  extensionId,
}, testInfo) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1600, height: 1100 });
  await page.goto(`chrome-extension://${extensionId}/apps/extension/src/video-editor/index.html`);
  await expect(page.locator('[data-ui="video-editor.workspace.root"]')).toBeVisible();
  await page
    .locator('input[type=file][accept*="video/"]')
    .first()
    .setInputFiles(fileURLToPath(new URL('../fixtures/cache-source.webm', import.meta.url)));
  await page
    .locator('[data-ui="video-editor.materials"]')
    .getByRole('button', { name: 'cache-source.webm', exact: true })
    .click();
  await page
    .locator('[data-ui="video-editor.source-viewer"]')
    .getByRole('button', { name: /^Append$|^В конец$/ })
    .click();
  await expect(page.locator('[data-project-timeline-clip]')).toHaveCount(1);
  await expectProductionProjectInLibrary(page);
  const projectUrl = page.url();
  const jobs = new Set<string>();
  const results = [];
  for (let run = 1; run <= 3; run++) {
    if (run === 3) {
      await page.goto(projectUrl);
      await expect(page.locator('[data-project-timeline-clip]')).toHaveCount(1);
    }
    const previousDownloads = await page.evaluate(() => chrome.downloads.search({}));
    const previousIds = previousDownloads.map((download) => download.id);
    await page.locator('[data-ui="video-editor.timeline.toolbar.export"]').click();
    await page.getByRole('button', { name: /^Start export$|^Начать экспорт$/ }).click();
    await expect
      .poll(
        async () => {
          const ledger = await readProductionExportLedger(page);
          return ledger?.jobId && !jobs.has(ledger.jobId) ? ledger.status : null;
        },
        { timeout: 30_000 }
      )
      .toBe('completed');
    const ledger = await readProductionExportLedger(page);
    if (!ledger?.jobId) throw new Error('Export did not create a terminal job');
    jobs.add(ledger.jobId);
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect
      .poll(
        async () => {
          const downloads = await page.evaluate(() => chrome.downloads.search({}));
          return downloads.find((download) => !previousIds.includes(download.id))?.state;
        },
        { timeout: 30_000 }
      )
      .toBe('complete');
    const downloads = await page.evaluate(() => chrome.downloads.search({}));
    const download = downloads.find((candidate) => !previousIds.includes(candidate.id));
    if (!download) throw new Error('Missing real export download');
    const destination = testInfo.outputPath(`saved-project-export-${run}.mp4`);
    await copyFile(download.filename, destination);
    results.push(await verifyProductionExportMedia(page, destination));
  }
  await expectProductionProjectInLibrary(page);
  await expect(page.getByText(/In library|В библиотеке/, { exact: true })).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath('saved-project-export.png'),
    animations: 'disabled',
    fullPage: true,
  });
  await writeFile(
    testInfo.outputPath('saved-project-export-metrics.json'),
    JSON.stringify(results, null, 2)
  );
});

async function expectProductionProjectInLibrary(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          new Promise<string | null>((resolve, reject) => {
            const request = indexedDB.open('sniptale-db');
            request.onsuccess = () => {
              const db = request.result;
              const rows = db.transaction('video_projects').objectStore('video_projects').getAll();
              rows.onsuccess = () => {
                db.close();
                resolve(
                  rows.result.find((row) => row.project.clips.length === 1)?.lifecycle
                    ?.storageClass ?? null
                );
              };
              rows.onerror = () => reject(rows.error);
            };
            request.onerror = () => reject(request.error);
          })
      )
    )
    .toBe('library');
}
