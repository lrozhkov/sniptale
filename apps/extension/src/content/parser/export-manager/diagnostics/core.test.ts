// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';

const runtimeMocks = vi.hoisted(() => ({
  getManifest: vi.fn(() => ({ version: '9.9.9-test' })),
}));

const snapshotMocks = vi.hoisted(() => ({
  buildPageSummaryFile: vi.fn(() => ({ counts: { links: 3 }, readyState: 'complete' })),
}));

const consoleMocks = vi.hoisted(() => ({
  getConsoleDiagnosticsSnapshot: vi.fn(() => ({
    capturedAt: '2026-03-22T00:00:00.000Z',
    droppedCount: 0,
    entries: [
      { kind: 'console', level: 'info', message: 'hello', timestamp: '2026-03-22T00:00:00.000Z' },
    ],
  })),
}));

vi.mock('@sniptale/platform/browser/runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/runtime')>()),
  runtimeInfo: runtimeMocks,
}));

vi.mock('./snapshot', () => snapshotMocks);
vi.mock('./console', () => consoleMocks);

import { collectCoreLogAssets } from './core';
import {
  createIframeReadiness,
  createOptions,
  createTreeData,
  expectExtractionSignalsAsset,
  expectParserReportAsset,
  expectProfileTraceAssets,
  readJsonAsset,
} from './core.test.helpers';
import type { ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';

function mockSignedConsoleDiagnostics(): void {
  consoleMocks.getConsoleDiagnosticsSnapshot.mockReturnValueOnce({
    capturedAt: '2026-03-22T00:00:00.000Z',
    droppedCount: 0,
    entries: [
      {
        kind: 'console',
        level: 'warn',
        message: [
          'standalone X-Amz-Signature=known-secret',
          'X-Goog-Signature=known-secret',
          'signature=known-secret',
          'policy=known-secret',
        ].join(' '),
        timestamp: '2026-03-22T00:00:00.000Z',
      },
    ],
  });
}

function createSignedSection(signedAssetUrl: string, signedBarePathUrl: string) {
  return {
    type: 'section' as const,
    id: 'section-asset',
    title: 'Assets',
    children: [
      {
        type: 'field' as const,
        id: 'field-link',
        label: 'Signed link',
        value: signedAssetUrl,
        valueType: 'link' as const,
        linkRef: signedAssetUrl,
      },
      {
        type: 'table' as const,
        id: 'table-asset',
        headers: ['File'],
        rows: [
          {
            id: 'row-asset',
            selected: true,
            selector: '#row-asset',
            data: { File: signedBarePathUrl, signature: 'known-secret' },
            attachments: [{ uuid: 'asset-1', src: signedAssetUrl }],
          },
        ],
      },
    ],
  };
}

function createSignedUrlTreeData(): ParsedDOMTree {
  const baseTreeData = createTreeData();
  if (!baseTreeData.meta) {
    throw new Error('Expected test fixture metadata');
  }

  const signedAssetUrl =
    'https://cdn.example.test/asset.png?X-Amz-Credential=known-secret&X-Amz-Signature=sig#frag';
  const signedBarePathUrl =
    'assets/file.png?X-Amz-Credential=known-secret&X-Amz-Signature=sig#frag';
  const googBarePathUrl = 'download/file?X-Goog-Signature=known-secret#frag';

  return {
    ...baseTreeData,
    meta: {
      ...baseTreeData.meta,
      rootSelection: {
        candidateSelectors: ['main'],
        selectedSelector: 'main',
        selectedTagName: 'main',
      },
      url: 'https://example.test/callback?access_token=known-secret&q=public#frag',
    },
    structure: [createSignedSection(signedAssetUrl, signedBarePathUrl)],
    blocks: [
      {
        id: 'block-link',
        sectionId: 'section-asset',
        kind: 'list' as const,
        items: [googBarePathUrl, 'ordinary item'],
      },
    ],
  };
}

function createSignedIframe(): HTMLIFrameElement {
  const signedIframe = document.createElement('iframe');
  signedIframe.setAttribute(
    'src',
    'https://cdn.example.test/asset.png?X-Amz-Credential=known-secret&X-Amz-Signature=sig#frag'
  );
  return signedIframe;
}

function expectJsonLogsRedacted(contents: string[]): void {
  expect(contents.length).toBeGreaterThan(0);
  for (const content of contents) {
    expect(content).not.toContain('known-secret');
    expect(content).not.toContain('X-Amz-Credential=known-secret');
    expect(content).not.toContain('#frag');
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  document.title = 'Diagnostics Page';
  window.history.replaceState({}, '', '/ticket/42');
});

it('returns no assets when all core log options are disabled', () => {
  expect(
    collectCoreLogAssets({
      options: createOptions(),
      treeData: createTreeData(),
      iframeReadiness: createIframeReadiness(),
      fileCandidatesCount: 0,
      downloadedFilesCount: 0,
      warnings: [],
    })
  ).toEqual([]);
  expect(consoleMocks.getConsoleDiagnosticsSnapshot).not.toHaveBeenCalled();
});

it('builds core diagnostics assets with parser, profile, and runtime traces', () => {
  const assets = collectCoreLogAssets({
    options: createOptions({ includeBasicLogs: true }),
    treeData: createTreeData(),
    iframeReadiness: createIframeReadiness(),
    fileCandidatesCount: 5,
    downloadedFilesCount: 3,
    warnings: ['warning-a', 'warning-b'],
  });

  expect(assets.map((asset) => asset.path)).toEqual([
    'logs/meta.json',
    'logs/page-summary.json',
    'logs/parser-report.json',
    'logs/parser-tree.json',
    'logs/extraction-signals.json',
    'logs/page-profile.json',
    'logs/detector-trace.json',
    'logs/root-selection.json',
    'logs/pipeline-trace.json',
    'logs/payload-trace.json',
    'logs/console.json',
  ]);
  expectParserReportAsset(assets);
  expectExtractionSignalsAsset(assets);
  expectProfileTraceAssets(assets);
});

it('falls back to unknown profile values when tree metadata is missing', () => {
  const assets = collectCoreLogAssets({
    options: createOptions({ includeCssDiagnostics: true }),
    treeData: createTreeData(false),
    iframeReadiness: {
      pendingIframes: [],
      timedOut: false,
      totalIframes: 0,
    },
    fileCandidatesCount: 0,
    downloadedFilesCount: 0,
    warnings: [],
  });

  expect(readJsonAsset(assets, 'logs/page-profile.json')).toBeNull();
  expect(readJsonAsset(assets, 'logs/detector-trace.json')).toEqual([]);
  expect(readJsonAsset(assets, 'logs/payload-trace.json')).toEqual([]);
  expect(readJsonAsset(assets, 'logs/root-selection.json')).toEqual({
    preferredRoots: [],
    url: window.location.href,
  });
  expect(readJsonAsset(assets, 'logs/pipeline-trace.json')).toEqual({
    confidence: 0,
    pageKind: 'unknown',
    parserNames: [],
    pipelineId: 'unknown',
    registryId: 'unknown',
    rootStrategy: 'virtual-root',
    vendor: 'unknown',
  });
});

it('prefers parsed tree metadata over live page metadata in diagnostic assets', () => {
  const assets = collectCoreLogAssets({
    options: createOptions({ includeBasicLogs: true }),
    treeData: createTreeData(),
    iframeReadiness: createIframeReadiness(),
    fileCandidatesCount: 1,
    downloadedFilesCount: 1,
    warnings: [],
  });

  expect(readJsonAsset(assets, 'logs/meta.json')?.['page']).toEqual({
    title: 'Ticket 42',
    url: 'https://example.test/ticket/42',
  });
  expect(snapshotMocks.buildPageSummaryFile).toHaveBeenCalledWith(
    {
      pageTitle: 'Ticket 42',
      pageUrl: 'https://example.test/ticket/42',
    },
    undefined
  );
});

it('redacts sensitive page urls from every core JSON diagnostic artifact', () => {
  mockSignedConsoleDiagnostics();
  const assets = collectCoreLogAssets({
    options: createOptions({ includeBasicLogs: true, includeHarDomLogs: true }),
    treeData: createSignedUrlTreeData(),
    iframeReadiness: {
      pendingIframes: [createSignedIframe()],
      timedOut: true,
      totalIframes: 1,
    },
    fileCandidatesCount: 1,
    downloadedFilesCount: 1,
    warnings: [],
  });

  const jsonLogContents = assets
    .filter((asset) => asset.path.startsWith('logs/') && asset.path.endsWith('.json'))
    .map((asset) => String(asset.content));

  expectJsonLogsRedacted(jsonLogContents);
  expect(readJsonAsset(assets, 'logs/root-selection.json')?.['url']).toBe(
    'https://example.test/callback'
  );
  expect(readJsonAsset(assets, 'logs/meta.json')?.['page']).toEqual({
    title: 'Ticket 42',
    url: 'https://example.test/callback',
  });
  expect(JSON.stringify(readJsonAsset(assets, 'logs/parser-tree.json'))).toContain('ordinary item');
});
