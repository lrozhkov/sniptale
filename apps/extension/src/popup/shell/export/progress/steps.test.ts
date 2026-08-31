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
    progress: createProgress({
      completedStepKeys: ['json'],
      failedStepKeys: ['files'],
      phase: 'error',
    }),
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
  expect(steps.find((step) => step.key === 'json')?.status).toBe('done');
  expect(steps.find((step) => step.key === 'files')?.status).toBe('error');
  expect(steps.find((step) => step.key === 'markdown')?.status).toBe('pending');
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

  expect(steps.every((step) => step.status === 'pending')).toBe(true);
}

function verifyScreenshotProgressMessage() {
  const steps = getScreenshotSteps();
  expect(steps.find((step) => step.key === 'fullPageScreenshot')?.status).toBe('active');
  expect(steps.find((step) => step.key === 'json')?.status).toBe('done');
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

  expect(steps.map((step) => [step.key, step.status])).toEqual([['webSnapshotDom', 'done']]);
}

function verifyExportOnlyWorkflowOrder() {
  const steps = buildPopupExportProgressSteps({
    progress: createProgress({ phase: 'idle' }),
    result: null,
    selection: {
      ...selection,
      includeAnnotations: true,
      includeCssDiagnostics: true,
      includeFullPageScreenshot: true,
      includePageDiagnostics: true,
    },
  });

  expect(steps.map((step) => step.key)).toEqual([
    'annotations',
    'json',
    'markdown',
    'files',
    'images',
    'basicLogs',
    'pageDiagnostics',
    'cssDiagnostics',
    'fullPageScreenshot',
  ]);
}

function verifyWebCopyWorkflowOrder() {
  const steps = buildPopupExportProgressSteps({
    progress: createProgress({ phase: 'idle' }),
    result: null,
    selection: {
      ...selection,
      includeAnnotations: true,
      includeCssDiagnostics: true,
      includeFullPageScreenshot: true,
      includePageDiagnostics: true,
      includeWebCopy: true,
    },
  });

  expect(steps.map((step) => step.key)).toEqual([
    'webSnapshotDom',
    'fullPageScreenshot',
    'annotations',
    'json',
    'markdown',
    'files',
    'images',
    'basicLogs',
    'pageDiagnostics',
    'cssDiagnostics',
  ]);
}

function verifyMonotonicStructuredProjection() {
  const steps = buildPopupExportProgressSteps({
    progress: createProgress({
      activeStepKey: 'cssDiagnostics',
      completedStepKeys: ['basicLogs', 'pageDiagnostics'],
      phase: 'scanning',
    }),
    result: null,
    selection: {
      ...selection,
      includeAnnotations: true,
      includeCssDiagnostics: true,
      includePageDiagnostics: true,
    },
  });

  expect(steps.map((step) => [step.key, step.status])).toEqual([
    ['annotations', 'done'],
    ['json', 'done'],
    ['markdown', 'done'],
    ['files', 'done'],
    ['images', 'done'],
    ['basicLogs', 'done'],
    ['pageDiagnostics', 'done'],
    ['cssDiagnostics', 'active'],
  ]);
}

function verifySequentialTabWorkflowFrontier() {
  const selected = {
    ...selection,
    includeAnnotations: true,
    includeCssDiagnostics: true,
    includeFullPageScreenshot: true,
    includePageDiagnostics: true,
  };
  const firstTabAtFinalStep = buildPopupExportProgressSteps({
    progress: createProgress({
      activeStepKey: 'fullPageScreenshot',
      completedStepKeys: [],
      phase: 'scanning',
    }),
    result: null,
    selection: selected,
  });
  const secondTabRestarted = buildPopupExportProgressSteps({
    progress: createProgress({
      activeStepKey: 'annotations',
      completedStepKeys: [],
      phase: 'scanning',
    }),
    result: null,
    selection: selected,
  });
  const globallyAdvanced = buildPopupExportProgressSteps({
    progress: createProgress({
      activeStepKey: 'json',
      completedStepKeys: ['annotations'],
      phase: 'scanning',
    }),
    result: null,
    selection: selected,
  });

  expect(firstTabAtFinalStep.map((step) => step.status)).toEqual([
    'active',
    'pending',
    'pending',
    'pending',
    'pending',
    'pending',
    'pending',
    'pending',
    'pending',
  ]);
  expect(secondTabRestarted.map((step) => step.status)).toEqual(
    firstTabAtFinalStep.map((step) => step.status)
  );
  expect(globallyAdvanced.slice(0, 3).map((step) => step.status)).toEqual([
    'done',
    'active',
    'pending',
  ]);
}

describe('buildPopupExportProgressSteps', () => {
  it('orders export-only rows by the producer workflow', verifyExportOnlyWorkflowOrder);

  it(
    'keeps the shared Web-copy screenshot next to the stage that captures it',
    verifyWebCopyWorkflowOrder
  );

  it(
    'projects completed structured rows monotonically from a later producer step',
    verifyMonotonicStructuredProjection
  );

  it(
    'does not advance or reset the global workflow frontier between sequential tabs',
    verifySequentialTabWorkflowFrontier
  );

  it('shows Web-copy and structured steps immediately for a combined launched plan', () => {
    const steps = buildPopupExportProgressSteps({
      progress: {
        activeStepKey: 'webSnapshotDom',
        current: 0,
        errors: [],
        message: 'Preparing',
        phase: 'scanning',
        total: 1,
      },
      result: null,
      selection: {
        ...selection,
        includeBasicLogs: false,
        includeFiles: true,
        includeImages: false,
        includeJson: true,
        includeMarkdown: false,
        includeWebCopy: true,
      },
    });

    expect(steps.map((step) => step.key)).toEqual(['webSnapshotDom', 'json', 'files']);
    expect(steps[0]?.status).toBe('active');
    expect(steps[1]?.status).toBe('pending');
    expect(steps.at(-1)?.status).toBe('pending');
  });

  it('does not infer structured completion from a Web-copy page phase without producer outcomes', () => {
    const steps = buildPopupExportProgressSteps({
      progress: createProgress({ activeStepKey: null, phase: 'downloading' }),
      result: null,
      selection: {
        ...selection,
        includeWebCopy: true,
      },
    });

    expect(
      steps
        .filter((step) => step.key !== 'webSnapshotDom')
        .every((step) => step.status === 'pending')
    ).toBe(true);
  });

  it('marks the screenshot done when Web-copy advances beyond its shared screenshot capture', () => {
    const steps = buildPopupExportProgressSteps({
      progress: createProgress({
        activeStepKey: 'webSnapshotDom',
        completedStepKeys: ['webSnapshotPreview'],
        phase: 'scanning',
      }),
      result: null,
      selection: {
        ...selection,
        includeFullPageScreenshot: true,
        includeWebCopy: true,
      },
    });

    expect(steps.find((step) => step.key === 'fullPageScreenshot')?.status).toBe('done');
  });

  it('does not project an unreported screenshot completion while a Web-copy job starts', () => {
    const steps = buildPopupExportProgressSteps({
      progress: createProgress({ activeStepKey: null, phase: 'scanning' }),
      result: null,
      selection: {
        ...selection,
        includeFullPageScreenshot: true,
        includeWebCopy: true,
      },
    });

    expect(steps.find((step) => step.key === 'webSnapshotDom')?.status).toBe('active');
    expect(steps.find((step) => step.key === 'fullPageScreenshot')?.status).toBe('pending');
  });
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

  it('marks only the attributable failed step', verifyTerminalFailedExportSteps);

  it(
    'keeps archive warning results from marking every selected step as failed',
    verifyWarningExportSteps
  );

  it('keeps component rows neutral for an unattributed startup error', verifyStartupFailureSteps);

  it(
    'keeps earlier producer rows complete when the final screenshot step is active',
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

  it('shows Web copy as the same single item selected in Package contents', verifyWebSnapshotSteps);

  it('shows real web snapshot phases before a result exists', () => {
    const steps = buildPopupExportProgressSteps({
      progress: createProgress({
        activeStepKey: 'webSnapshotStyles',
        phase: 'scanning',
      }),
      result: null,
      selection,
    });

    expect(steps.map((step) => [step.key, step.status])).toEqual([['webSnapshotDom', 'active']]);
  });

  it('keeps multi-page Web copy active until its global completion is published', () => {
    const pageTransition = buildPopupExportProgressSteps({
      progress: createProgress({
        activeStepKey: 'json',
        completedStepKeys: ['webSnapshotPreview'],
        phase: 'scanning',
      }),
      result: null,
      selection: { ...selection, includeJson: true, includeWebCopy: true },
    });
    const globallyCompleted = buildPopupExportProgressSteps({
      progress: createProgress({
        activeStepKey: 'json',
        completedStepKeys: ['webSnapshotPreview', 'webSnapshotAssets'],
        phase: 'scanning',
      }),
      result: null,
      selection: { ...selection, includeJson: true, includeWebCopy: true },
    });

    expect(pageTransition.find((step) => step.key === 'webSnapshotDom')?.status).toBe('active');
    expect(globallyCompleted.find((step) => step.key === 'webSnapshotDom')?.status).toBe('done');
  });
});
