import type { AccessibleIframeReadyResult } from '../../../platform/frame';
import type { ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';
import type { ExportOptions } from '@sniptale/runtime-contracts/export';

type LogAsset = { path: string; content: Blob | string };

export function createOptions(overrides: Partial<ExportOptions> = {}): ExportOptions {
  return {
    includeBasicLogs: false,
    includeCssDiagnostics: false,
    includeFiles: true,
    includeFullPageScreenshot: false,
    includeHarDomLogs: false,
    includeImages: true,
    includeJson: true,
    includeMarkdown: true,
    ...overrides,
  };
}

function createTreeStructure(): ParsedDOMTree['structure'] {
  return [
    {
      type: 'section',
      id: 'section-1',
      title: 'Summary',
      children: [
        {
          type: 'field',
          id: 'field-1',
          label: 'Status',
          value: 'Open',
          valueType: 'string',
        },
        {
          type: 'field',
          id: 'field-2',
          label: 'Status',
          value: 'x'.repeat(280),
          valueType: 'string',
        },
        {
          type: 'table',
          id: 'table-1',
          headers: ['Name'],
          rows: [
            { id: 'row-1', selected: true, selector: '#row-1', data: { Name: 'First' } },
            { id: 'row-2', selected: true, selector: '#row-2', data: { Name: 'Second' } },
          ],
        },
      ],
    },
  ];
}

function createTreeMeta(): NonNullable<ParsedDOMTree['meta']> {
  return {
    detectorTrace: [{ id: 'detector-a', source: 'dom', strength: 'hard' }],
    payloadTrace: [{ id: '__DATA__', kind: 'json', textLength: 42 }],
    pipelineTrace: {
      parserNames: ['DefinitionList'],
      registryId: 'generic-structured',
      rootStrategy: 'preferred-root',
    },
    profile: {
      vendor: 'generic',
      appFamily: 'generic-web',
      pageKind: 'ticket',
      pipelineId: 'generic-structured',
      confidence: 0.9,
      matchedSignals: [{ id: 'signal-a', source: 'dom', strength: 'hard' }],
      preferredRoots: ['main', 'form'],
    },
    rootSelection: {
      candidateSelectors: ['main', 'form'],
      selectedSelector: 'main',
      selectedTagName: 'main',
    },
    title: 'Ticket 42',
    url: 'https://example.test/ticket/42',
    extractionClass: 'record',
    qualitySignals: [
      {
        kind: 'fallback-pipeline-used',
        severity: 'info',
        summary: 'The page was parsed through the generic safe fallback pipeline.',
      },
    ],
    warnings: [],
  };
}

export function createTreeData(withMeta = true): ParsedDOMTree {
  return {
    context: 'Support Portal',
    title: 'Ticket 42',
    structure: createTreeStructure(),
    blocks: [
      {
        id: 'block-heading',
        sectionId: 'section-1',
        kind: 'heading',
        text: 'Summary',
      },
      {
        id: 'block-record',
        sectionId: 'section-1',
        kind: 'record-field',
        items: ['Status', 'Open'],
      },
    ],
    ...(withMeta ? { meta: createTreeMeta() } : {}),
  };
}

export function createIframeReadiness(): AccessibleIframeReadyResult {
  const iframeById = document.createElement('iframe');
  iframeById.id = 'known-frame';

  const iframeBySrc = document.createElement('iframe');
  iframeBySrc.setAttribute('src', 'https://example.test/embed');

  const iframeUnknown = document.createElement('iframe');
  Object.defineProperty(iframeUnknown, 'src', {
    configurable: true,
    get: () => '',
  });

  return {
    pendingIframes: [iframeById, iframeBySrc, iframeUnknown],
    timedOut: true,
    totalIframes: 3,
  };
}

export function readJsonAsset(assets: LogAsset[], path: string): Record<string, unknown> | null {
  const asset = assets.find((entry) => entry.path === path);
  if (!asset || typeof asset.content !== 'string') {
    throw new Error(`Missing JSON asset: ${path}`);
  }

  return JSON.parse(asset.content) as Record<string, unknown>;
}
