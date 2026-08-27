import { describe, expect, it } from 'vitest';

import type { ExportProgress } from '@sniptale/runtime-contracts/export';
import { buildPopupExportProgressSteps } from './steps';

const selection = {
  includeAnnotations: false,
  includeBasicLogs: true,
  includeCssDiagnostics: false,
  includeFiles: true,
  includeFullPageScreenshot: false,
  includePageDiagnostics: false,
  includeImages: true,
  includeJson: true,
  includeMarkdown: true,
};

function createProgress(overrides: Partial<ExportProgress>): ExportProgress {
  return {
    phase: 'idle',
    message: '',
    current: 0,
    total: 0,
    errors: [],
    ...overrides,
  };
}

function getDownloadSteps() {
  return buildPopupExportProgressSteps({
    progress: createProgress({ phase: 'downloading', current: 1, total: 3 }),
    result: null,
    selection,
  });
}

function getFailedSteps() {
  return buildPopupExportProgressSteps({
    progress: createProgress({ phase: 'error' }),
    result: {
      success: false,
      errors: ['cancelled'],
      stats: {
        sectionsCount: 0,
        rowsCount: 0,
        filesCount: 0,
        filesFailed: 0,
      },
    },
    selection,
  });
}

function getScreenshotSteps() {
  return buildPopupExportProgressSteps({
    progress: createProgress({
      activeStepKey: 'fullPageScreenshot',
      phase: 'scanning',
      message: '',
    }),
    result: null,
    selection: {
      ...selection,
      includeCssDiagnostics: true,
      includeFullPageScreenshot: true,
      includePageDiagnostics: true,
    },
  });
}

function verifyDownloadingSteps() {
  const steps = getDownloadSteps();
  expect(steps.map((step) => [step.key, step.status])).toEqual([
    ['json', 'done'],
    ['markdown', 'done'],
    ['files', 'active'],
    ['images', 'pending'],
    ['basicLogs', 'pending'],
  ]);
}

function verifyTerminalFailedExportSteps() {
  const steps = getFailedSteps();
  expect(steps.every((step) => step.status === 'error')).toBe(true);
}

function verifyWarningExportSteps() {
  const steps = buildPopupExportProgressSteps({
    progress: createProgress({
      phase: 'done',
      errors: ['Unknown message type'],
    }),
    result: {
      success: false,
      filename: 'export.zip',
      errors: ['Unknown message type'],
      stats: {
        sectionsCount: 1,
        rowsCount: 2,
        filesCount: 1,
        filesFailed: 0,
      },
    },
    selection,
  });

  expect(steps.every((step) => step.status === 'done')).toBe(true);
}

function verifyStartupFailureSteps() {
  const steps = buildPopupExportProgressSteps({
    progress: createProgress({
      errors: ['Страница использует устаревшую версию расширения'],
      phase: 'error',
    }),
    result: null,
    selection,
  });

  expect(steps.every((step) => step.status === 'error')).toBe(true);
}

function verifyScreenshotProgressMessage() {
  const steps = getScreenshotSteps();
  expect(steps.find((step) => step.key === 'fullPageScreenshot')?.status).toBe('active');
  expect(steps.find((step) => step.key === 'json')?.status).toBe('pending');
}

function verifyStandaloneImagesProgress() {
  const steps = buildPopupExportProgressSteps({
    progress: createProgress({ phase: 'downloading', current: 1, total: 1 }),
    result: null,
    selection: {
      ...selection,
      includeFiles: false,
    },
  });

  expect(steps.map((step) => [step.key, step.status])).toEqual([
    ['json', 'done'],
    ['markdown', 'done'],
    ['images', 'active'],
    ['basicLogs', 'pending'],
  ]);
}

function verifyIdleAndDoneProgressStates() {
  const idleSteps = buildPopupExportProgressSteps({
    progress: createProgress({ phase: 'idle' }),
    result: null,
    selection,
  });
  const doneSteps = buildPopupExportProgressSteps({
    progress: createProgress({ phase: 'done' }),
    result: {
      success: true,
      errors: [],
      stats: {
        sectionsCount: 1,
        rowsCount: 2,
        filesCount: 3,
        filesFailed: 0,
      },
    },
    selection,
  });

  expect(idleSteps.every((step) => step.status === 'pending')).toBe(true);
  expect(doneSteps.every((step) => step.status === 'done')).toBe(true);
}

function verifyWebSnapshotSteps() {
  const steps = buildPopupExportProgressSteps({
    progress: createProgress({ phase: 'done' }),
    result: {
      errors: [],
      kind: 'webSnapshot',
      stats: {
        sectionsCount: 5,
        rowsCount: 0,
        filesCount: 5,
        filesFailed: 1,
      },
      success: true,
      warnings: ['Asset skipped'],
    },
    selection: {
      ...selection,
      includeJson: true,
      includeMarkdown: true,
    },
  });

  expect(steps.map((step) => [step.key, step.status])).toEqual([
    ['webSnapshotDom', 'done'],
    ['webSnapshotPreview', 'done'],
    ['webSnapshotStyles', 'done'],
    ['webSnapshotAssets', 'done'],
    ['webSnapshotWarnings', 'done'],
  ]);
}

describe('buildPopupExportProgressSteps', () => {
  it('shows annotation preparation as the active selected step', () => {
    const steps = buildPopupExportProgressSteps({
      progress: createProgress({
        activeStepKey: 'annotations',
        phase: 'scanning',
      }),
      result: null,
      selection: { ...selection, includeAnnotations: true },
    });

    expect(steps.find((step) => step.key === 'annotations')?.status).toBe('active');
  });

  it('marks annotations done when mixed export hands page scanning to the next step', () => {
    const steps = buildPopupExportProgressSteps({
      progress: createProgress({ activeStepKey: 'json', phase: 'scanning' }),
      result: null,
      selection: { ...selection, includeAnnotations: true },
    });

    expect(steps.find((step) => step.key === 'annotations')?.status).toBe('done');
    expect(steps.find((step) => step.key === 'json')?.status).toBe('active');
  });

  it('marks text steps as done and files as active during downloading', verifyDownloadingSteps);

  it(
    'marks all selected steps as failed when export stops before producing an archive',
    verifyTerminalFailedExportSteps
  );

  it(
    'keeps archive warning results from marking every selected step as failed',
    verifyWarningExportSteps
  );

  it(
    'marks all selected steps as failed when export startup ends in a terminal error',
    verifyStartupFailureSteps
  );

  it(
    'prioritizes the runtime progress message when the screenshot step is active',
    verifyScreenshotProgressMessage
  );

  it(
    'treats images as a standalone downloading step when files are disabled',
    verifyStandaloneImagesProgress
  );
  it(
    'maps idle and successful terminal progress states exhaustively',
    verifyIdleAndDoneProgressStates
  );

  it(
    'shows web snapshot package parts instead of selected archive sections',
    verifyWebSnapshotSteps
  );

  it('shows real web snapshot phases before a result exists', () => {
    const steps = buildPopupExportProgressSteps({
      progress: createProgress({
        activeStepKey: 'webSnapshotStyles',
        phase: 'scanning',
      }),
      result: null,
      selection,
    });

    expect(steps.map((step) => [step.key, step.status])).toEqual([
      ['webSnapshotDom', 'done'],
      ['webSnapshotPreview', 'done'],
      ['webSnapshotStyles', 'active'],
      ['webSnapshotAssets', 'pending'],
    ]);
  });
});
