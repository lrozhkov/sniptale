import { expect, it } from 'vitest';
import type { ExportOptions } from '@sniptale/runtime-contracts/export';
import {
  createEffectiveComponentPlan,
  parsePagePackageJobStatusV1,
  type PagePackageJobStatusV1,
} from './status';

const options: ExportOptions = {
  includeBasicLogs: false,
  includeCssDiagnostics: false,
  includeFiles: true,
  includeFullPageScreenshot: false,
  includeImages: true,
  includeJson: true,
  includeMarkdown: true,
  includePageDiagnostics: false,
};

function status(): PagePackageJobStatusV1 {
  return {
    activatedTabIds: [],
    effectiveComponentPlan: createEffectiveComponentPlan('export', options),
    effectiveOptions: options,
    intent: 'export',
    jobId: 'job-1',
    orderedTabs: [{ tabId: 7, title: 'Page' }],
    originalActiveTabs: [],
    pageOutcomes: [{ ordinal: 0, status: 'pending', tabId: 7 }],
    phase: 'running',
    progress: { current: 0, errors: [], message: 'Running', phase: 'scanning', total: 1 },
    revision: 1,
    warnings: [],
  };
}

it('parses the closed final V1 shape used directly by the Page Package wire contract', () => {
  const parsed = parsePagePackageJobStatusV1(status());
  expect(parsed).toEqual(status());
  expect(parsed).toMatchObject({
    effectiveComponentPlan: expect.any(Object),
    intent: 'export',
    pageOutcomes: [{ ordinal: 0, status: 'pending', tabId: 7 }],
  });
});

it('rejects extra fields and page outcomes that are not bound to ordered tabs', () => {
  expect(parsePagePackageJobStatusV1({ ...status(), stagedBlobId: 'forbidden' })).toBeNull();
  expect(
    parsePagePackageJobStatusV1({
      ...status(),
      pageOutcomes: [{ ordinal: 0, status: 'pending', tabId: 8 }],
    })
  ).toBeNull();
});

it('rejects malformed or unbounded fields throughout the private status graph', () => {
  const long = 'x'.repeat(16 * 1024 + 1);
  const longUtf8 = '\ud83d\ude00'.repeat(4097);
  const many = Array.from({ length: 257 }, () => 'x');
  const cases: unknown[] = [null, [], { ...status(), extra: true }];
  const { intent: _intent, ...withoutIntent } = status();
  cases.push(
    withoutIntent,
    { ...status(), intent: 'other' },
    { ...status(), effectiveComponentPlan: null },
    { ...status(), effectiveComponentPlan: { ...status().effectiveComponentPlan, components: {} } },
    {
      ...status(),
      effectiveComponentPlan: { ...status().effectiveComponentPlan, diagnosticsLevel: 'all' },
    },
    { ...status(), effectiveOptions: { ...options, extra: true } },
    { ...status(), effectiveOptions: { ...options, includeFiles: undefined } },
    { ...status(), jobId: '' },
    { ...status(), jobId: 'x'.repeat(513) },
    { ...status(), orderedTabs: [], pageOutcomes: [] },
    {
      ...status(),
      orderedTabs: [
        { tabId: 7, title: 'Page' },
        { tabId: 7, title: 'Duplicate' },
      ],
      pageOutcomes: [
        { ordinal: 0, status: 'pending', tabId: 7 },
        { ordinal: 1, status: 'pending', tabId: 7 },
      ],
    },
    { ...status(), orderedTabs: [{ tabId: -1, title: 'Page' }] },
    { ...status(), orderedTabs: [{ tabId: 7, title: 'Page', extra: true }] },
    { ...status(), pageOutcomes: 'invalid' },
    { ...status(), pageOutcomes: [] },
    { ...status(), pageOutcomes: [{ ordinal: 1, status: 'pending', tabId: 7 }] },
    { ...status(), pageOutcomes: [{ ordinal: 0, status: 'other', tabId: 7 }] },
    { ...status(), pageOutcomes: [{ error: long, ordinal: 0, status: 'failed', tabId: 7 }] },
    { ...status(), warnings: many },
    { ...status(), warnings: [long] },
    { ...status(), warnings: [longUtf8] },
    { ...status(), warnings: Array.from({ length: 33 }, () => 'x'.repeat(16 * 1024)) },
    {
      ...status(),
      orderedTabs: [{ tabId: 7, title: longUtf8 }],
      pageOutcomes: [{ ordinal: 0, status: 'pending', tabId: 7 }],
    },
    { ...status(), progress: { ...status().progress, extra: true } },
    { ...status(), progress: { ...status().progress, message: long } },
    { ...status(), progress: { ...status().progress, errors: many } },
    { ...status(), activatedTabIds: Array.from({ length: 257 }, (_, index) => index) },
    {
      ...status(),
      originalActiveTabs: Array.from({ length: 257 }, () => ({ tabId: 1, windowId: 1 })),
    },
    { ...status(), originalActiveTabs: [{ tabId: -1, windowId: 1 }] },
    {
      ...status(),
      result: {
        errors: [],
        stats: { filesCount: 0, filesFailed: 0, rowsCount: 0, sectionsCount: 0 },
        success: true,
        extra: true,
      },
    },
    {
      ...status(),
      result: {
        errors: [],
        stats: { filesCount: -1, filesFailed: 0, rowsCount: 0, sectionsCount: 0 },
        success: true,
      },
    },
    {
      ...status(),
      result: {
        errors: [],
        stats: { filesCount: 0, filesFailed: 0, rowsCount: 0, sectionsCount: 0 },
        success: true,
        kind: 'other',
      },
    }
  );
  for (const candidate of cases) expect(parsePagePackageJobStatusV1(candidate)).toBeNull();
});

it('accepts bounded terminal details and derives both diagnostic component-plan branches', () => {
  const terminal: PagePackageJobStatusV1 = {
    ...status(),
    effectiveOptions: { ...options, includeAnnotations: true },
    phase: 'completed',
    progress: { ...status().progress, activeStepKey: 'json', phase: 'done' },
    result: {
      errors: [],
      filename: 'page.zip',
      kind: 'archive',
      snapshotBatchSize: 1,
      snapshotIds: ['snapshot-1'],
      stats: { filesCount: 1, filesFailed: 0, rowsCount: 1, sectionsCount: 1 },
      success: true,
      warnings: ['partial'],
    },
  };
  expect(parsePagePackageJobStatusV1(terminal)).toEqual(terminal);
  expect(terminal).toMatchObject({
    result: { filename: 'page.zip', success: true },
  });
  expect(
    createEffectiveComponentPlan('export', {
      ...options,
      includeBasicLogs: true,
      includeFiles: false,
      includeImages: false,
      includeJson: false,
      includeMarkdown: false,
    })
  ).toMatchObject({
    components: { attachments: false, diagnostics: true, images: false, pageData: false },
    diagnosticsLevel: 'standard',
  });
  expect(createEffectiveComponentPlan('export', options, true)).toMatchObject({
    components: { attachments: true, images: true, pageData: true, webCopy: true },
    includeScreenshot: true,
  });
  expect(
    createEffectiveComponentPlan('export', { ...options, includePageDiagnostics: true })
  ).toMatchObject({ diagnosticsLevel: 'extended' });
  expect(
    createEffectiveComponentPlan('save', { ...options, includePageDiagnostics: true }, true)
  ).toMatchObject({ diagnosticsLevel: 'extended' });
  expect(
    createEffectiveComponentPlan('save', { ...options, includeFullPageScreenshot: false }, true)
  ).toMatchObject({
    components: { attachments: true, images: true, pageData: true, webCopy: true },
    includeScreenshot: true,
  });
});

it('accepts the exact canonical tab-title byte ceiling', () => {
  const exact = { ...status(), orderedTabs: [{ tabId: 7, title: 'x'.repeat(2 * 1024) }] };
  expect(parsePagePackageJobStatusV1(exact)).toEqual(exact);
});
