import { mkdir } from 'node:fs/promises';
import { expect, type Page, type TestInfo } from '@playwright/test';
import { test } from './support/extension-fixture';
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
} from './extension-critical.helpers';

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

  await expect(page.getByText(VideoProjectExportPhase.RENDERING, { exact: true })).toBeVisible();
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
    recordingId: 'recording-harness',
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
  await expect(failureDialog).toContainText('EffectV1 render failed');
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
  await expect(failureDialog).toContainText('Retry failed');
  await failureDialog
    .getByRole('button', { name: VIDEO_EDITOR_EXPORT_FAILURE_CLOSE_LABEL, exact: true })
    .click();
  await expect(failureDialog).toBeHidden();
});
