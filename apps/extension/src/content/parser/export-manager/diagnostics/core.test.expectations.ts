import { expect } from 'vitest';

import { createOptions, readJsonAsset } from './core.test.fixtures';

type LogAsset = { path: string; content: Blob | string };

export function expectParserReportAsset(assets: LogAsset[]): void {
  const parserReport = readJsonAsset(assets, 'logs/parser-report.json');

  expect(parserReport?.['attachmentCandidates']).toBe(5);
  expect(parserReport?.['downloadedAttachments']).toBe(3);
  expect(parserReport?.['warningsCount']).toBe(2);
  expect(parserReport?.['iframePreflight']).toEqual({
    pendingIframes: ['known-frame', 'https://example.test/embed', 'unknown'],
    timedOut: true,
    totalIframes: 3,
  });
  expect(parserReport?.['parsing']).toEqual({
    blocksCount: 2,
    context: 'Support Portal',
    extractionClass: 'record',
    fieldsCount: 2,
    rowsCount: 2,
    sectionsCount: 1,
    title: 'Ticket 42',
  });
  expect(parserReport?.['qualitySignalsCount']).toBe(1);
  expect(parserReport?.['suspiciousOutput']).toEqual({
    topDuplicateLabels: [{ label: 'Status', count: 2 }],
    topLongestValues: [
      {
        label: 'Status',
        length: 280,
        sectionTitle: 'Summary',
      },
      {
        label: 'Status',
        length: 4,
        sectionTitle: 'Summary',
      },
    ],
  });
}

export function expectExtractionSignalsAsset(assets: LogAsset[]): void {
  const extractionSignals = readJsonAsset(assets, 'logs/extraction-signals.json');

  expect(extractionSignals).toEqual({
    blocks: [
      {
        evidenceCount: 0,
        id: 'block-heading',
        kind: 'heading',
        sectionId: 'section-1',
        tableRef: undefined,
      },
      {
        evidenceCount: 0,
        id: 'block-record',
        kind: 'record-field',
        sectionId: 'section-1',
        tableRef: undefined,
      },
    ],
    extractionClass: 'record',
    qualitySignals: [
      {
        kind: 'fallback-pipeline-used',
        severity: 'info',
        summary: 'The page was parsed through the generic safe fallback pipeline.',
      },
    ],
  });
}

export function expectProfileTraceAssets(assets: LogAsset[]): void {
  const meta = readJsonAsset(assets, 'logs/meta.json');
  const rootSelection = readJsonAsset(assets, 'logs/root-selection.json');
  const pipelineTrace = readJsonAsset(assets, 'logs/pipeline-trace.json');

  expect(meta?.['extensionVersion']).toBe('9.9.9-test');
  expect(meta?.['exportOptions']).toEqual(createOptions({ includeBasicLogs: true }));
  expect(rootSelection).toEqual({
    candidateSelectors: ['main', 'form'],
    preferredRoots: ['main', 'form'],
    selectedSelector: 'main',
    selectedTagName: 'main',
    url: 'https://example.test/ticket/42',
  });
  expect(pipelineTrace).toEqual({
    confidence: 0.9,
    pageKind: 'ticket',
    parserNames: ['DefinitionList'],
    pipelineId: 'generic-structured',
    registryId: 'generic-structured',
    rootStrategy: 'preferred-root',
    vendor: 'generic',
  });
}
