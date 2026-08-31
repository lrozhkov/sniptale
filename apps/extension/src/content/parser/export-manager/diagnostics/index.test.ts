// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildDomSnapshotHtml,
  buildVirtualDomSnapshotHtml,
  collectAdvancedLogAssets,
  collectCssDiagnosticAssets,
  collectCoreLogAssets,
  createResourceTimingSnapshot,
} from '.';

function resetDocumentBody() {
  document.head.replaceChildren();
  document.body.replaceChildren();
}

function appendTestFixture() {
  const app = document.createElement('div');
  app.id = 'app';
  app.textContent = 'content';

  const extensionRoot = document.createElement('div');
  extensionRoot.id = 'sniptale-extension-root';
  extensionRoot.textContent = 'extension ui';

  const passwordInput = document.createElement('input');
  passwordInput.type = 'password';
  passwordInput.value = 'secret';

  document.body.append(app, extensionRoot, passwordInput);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('chrome', {
    runtime: {
      getManifest: () => ({ version: '0.4.0' }),
    },
  });
  resetDocumentBody();
  appendTestFixture();
});

afterEach(() => {
  resetDocumentBody();
});

function buildCoreLogOptionsFixture() {
  return {
    includeBasicLogs: true,
    includeCssDiagnostics: false,
    includeFiles: true,
    includeFullPageScreenshot: false,
    includePageDiagnostics: false,
    includeImages: true,
    includeJson: true,
    includeMarkdown: false,
  };
}

function buildCoreLogTreeFixture() {
  return {
    context: 'generic',
    structure: [],
    title: 'Example page',
    meta: {
      detectorTrace: [
        { id: 'dom.form-controls', source: 'dom' as const, strength: 'hard' as const },
      ],
      payloadTrace: [{ id: '__NEXT_DATA__', kind: 'json' as const, textLength: 42 }],
      pipelineTrace: {
        parserNames: ['DefinitionList', 'FormFields'],
        registryId: 'generic-structured',
        rootStrategy: 'preferred-root' as const,
      },
      profile: {
        vendor: 'generic' as const,
        appFamily: 'generic-web',
        pageKind: 'form',
        pipelineId: 'generic-structured',
        confidence: 0.8,
        matchedSignals: [
          { id: 'dom.form-controls', source: 'dom' as const, strength: 'hard' as const },
        ],
        preferredRoots: ['form', 'body'],
      },
      rootSelection: {
        candidateSelectors: ['form', 'body'],
        selectedSelector: 'form',
        selectedTagName: 'form',
      },
      title: 'Example page',
      url: 'https://example.test/form',
      warnings: [],
    },
  };
}

function buildCoreLogAssetsFixture() {
  return collectCoreLogAssets({
    options: buildCoreLogOptionsFixture(),
    treeData: {
      ...buildCoreLogTreeFixture(),
    },
    iframeReadiness: {
      pendingIframes: [],
      timedOut: false,
      totalIframes: 0,
    },
    fileCandidatesCount: 3,
    downloadedFilesCount: 2,
    warnings: ['warning'],
  });
}

describe('buildDomSnapshotHtml', () => {
  it('removes extension root and blanks password values', () => {
    const html = buildDomSnapshotHtml();

    expect(html).not.toContain('sniptale-extension-root');
    expect(html).not.toContain('secret');
    expect(html).not.toContain('content');
    expect(html).toContain('[text:7]');
    expect(html).toContain('type="password"');
  });
});

describe('buildVirtualDomSnapshotHtml', () => {
  it('includes embedded iframe content in the serialized snapshot', () => {
    const iframe = document.createElement('iframe');
    iframe.id = 'iframe$fixture';
    iframe.src = `${window.location.origin}/richText.html`;
    document.body.append(iframe);

    const iframeDoc = iframe.contentDocument;
    const iframeWindow = iframe.contentWindow;
    if (!iframeDoc || !iframeWindow) {
      throw new Error('Expected iframe document');
    }

    Object.defineProperty(iframeWindow, 'frameElement', {
      configurable: true,
      value: iframe,
    });

    if (!iframeDoc.documentElement) {
      iframeDoc.append(iframeDoc.createElement('html'));
    }
    if (!iframeDoc.head) {
      iframeDoc.documentElement.append(iframeDoc.createElement('head'));
    }
    if (!iframeDoc.body) {
      iframeDoc.documentElement.append(iframeDoc.createElement('body'));
    }

    iframeDoc.body.replaceChildren();
    const content = iframeDoc.createElement('p');
    content.textContent = 'Embedded iframe content';
    iframeDoc.body.append(content);

    const html = buildVirtualDomSnapshotHtml();

    expect(html).not.toContain('Embedded iframe content');
    expect(html).toContain('[text:23]');
    expect(html).toContain('data-virtual-iframe="true"');
  });
});

describe('createResourceTimingSnapshot', () => {
  it('creates a sanitized resource timing payload', () => {
    vi.spyOn(performance, 'getEntriesByType').mockReturnValue([
      {
        duration: 42,
        initiatorType: 'script',
        decodedBodySize: 900,
        encodedBodySize: 800,
        name: 'https://example.test/app.js?token=secret#fragment',
        nextHopProtocol: 'h2',
        startTime: 10,
        transferSize: 1024,
      },
    ] as PerformanceResourceTiming[]);

    const snapshot = createResourceTimingSnapshot({
      pageTitle: 'Example page',
      pageUrl: 'https://example.test/page?token=secret#fragment',
    });
    const firstEntry = snapshot.entries[0];

    expect(snapshot.pageUrl).toBe('https://example.test/page');
    expect(snapshot.entries).toHaveLength(1);
    expect(firstEntry).toMatchObject({
      duration: 42,
      initiatorType: 'script',
      name: 'https://example.test/app.js',
      transferSize: 1024,
    });
  });
});

describe('collectAdvancedLogAssets', () => {
  it('does not collect page diagnostics when the option is disabled', async () => {
    await expect(
      collectAdvancedLogAssets(buildCoreLogOptionsFixture(), buildCoreLogTreeFixture())
    ).resolves.toEqual([]);
  });

  it('emits only DOM and virtual DOM artifacts', async () => {
    const assets = await collectAdvancedLogAssets(
      { ...buildCoreLogOptionsFixture(), includePageDiagnostics: true },
      buildCoreLogTreeFixture()
    );

    expect(assets.map((asset) => asset.path)).toEqual(['logs/dom.html', 'logs/virtual-dom.html']);
  });
});

describe('collectCoreLogAssets', () => {
  it('returns core log files when basic logs are enabled', () => {
    const assets = buildCoreLogAssetsFixture();

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
    ]);
  });
});

describe('collectCssDiagnosticAssets', () => {
  it('emits stylesheet and computed-style artifacts when CSS diagnostics are enabled', () => {
    const style = document.createElement('style');
    style.textContent = '.fixture { color: rgb(255, 0, 0); }';
    document.head.append(style);

    const fixture = document.createElement('div');
    fixture.className = 'fixture';
    fixture.textContent = 'Fixture node';
    document.body.append(fixture);

    const assets = collectCssDiagnosticAssets({
      includeBasicLogs: false,
      includeCssDiagnostics: true,
      includeFiles: false,
      includeFullPageScreenshot: false,
      includePageDiagnostics: false,
      includeImages: false,
      includeJson: false,
      includeMarkdown: false,
    });

    expect(assets.map((asset) => asset.path)).toContain('logs/css/stylesheets.json');
    expect(assets.map((asset) => asset.path)).toContain('logs/css/computed-styles.json');
  });
});
