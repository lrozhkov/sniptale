// @vitest-environment jsdom

import { afterEach, expect, it } from 'vitest';

import { buildStylesheetDiagnosticAssets } from './css.stylesheets';

function createRule(cssText: string): CSSRule {
  return { cssText } as CSSRule;
}

function createSheet(params: {
  cssRules?: CSSRule[];
  disabled?: boolean;
  href?: string | null;
  media?: string[];
  ownerNode?: Element | null;
  throwCssRules?: Error | string;
}): CSSStyleSheet {
  const sheet = {
    disabled: params.disabled ?? false,
    href: params.href ?? null,
    media: params.media,
    ownerNode: params.ownerNode ?? null,
  };

  Object.defineProperty(sheet, 'cssRules', {
    configurable: true,
    get: () => {
      if (params.throwCssRules) {
        throw params.throwCssRules;
      }

      return params.cssRules ?? [];
    },
  });

  return sheet as unknown as CSSStyleSheet;
}

function readStylesheetManifest(assets: Array<{ path: string; content: Blob | string }>) {
  const asset = assets.find((entry) => entry.path === 'logs/css/stylesheets.json');
  if (!asset || typeof asset.content !== 'string') {
    throw new Error('Missing stylesheet manifest');
  }

  return JSON.parse(asset.content) as {
    totalStylesheets: number;
    stylesheets: Array<Record<string, unknown>>;
  };
}

function installStylesheetFixture() {
  const styleOwner = document.createElement('style');
  styleOwner.id = 'owner-style';
  styleOwner.setAttribute('data-ui', 'shell');
  styleOwner.setAttribute('media', 'screen');

  const linkOwner = document.createElement('link');
  linkOwner.setAttribute('rel', 'stylesheet');

  Object.defineProperty(document, 'styleSheets', {
    configurable: true,
    value: [
      createSheet({
        ownerNode: styleOwner,
        media: ['screen'],
        cssRules: [
          createRule('@import url("https://example.test/private.css?token=secret");'),
          createRule(
            '.shell { background-image: url("https://example.test/a.png?token=secret"); }'
          ),
        ],
      }),
      createSheet({
        disabled: true,
        href: 'https://cdn.example.test/app.css?token=secret#frag',
        ownerNode: linkOwner,
        throwCssRules: new Error('Access denied token=secret'),
      }),
    ],
  });

  Object.defineProperty(document, 'adoptedStyleSheets', {
    configurable: true,
    value: [
      createSheet({
        cssRules: [createRule('.adopted { display: block; }')],
      }),
      createSheet({
        throwCssRules: 'blocked',
      }),
    ],
  });
}

function createExpectedDocumentStylesheetMetadata() {
  return [
    {
      disabled: false,
      href: null,
      id: 'document-stylesheet-01',
      media: ['screen'],
      owner: {
        dataUi: 'shell',
        id: 'owner-style',
        media: 'screen',
        rel: null,
        tagName: 'style',
      },
      restricted: false,
      ruleCount: 2,
      source: 'document',
    },
    {
      disabled: true,
      href: 'https://cdn.example.test/app.css',
      id: 'document-stylesheet-02',
      media: [],
      owner: {
        dataUi: null,
        id: null,
        media: null,
        rel: 'stylesheet',
        tagName: 'link',
      },
      restricted: true,
      ruleCount: null,
      source: 'document',
    },
  ];
}

function createExpectedAdoptedStylesheetMetadata() {
  return [
    {
      disabled: false,
      href: null,
      id: 'adopted-stylesheet-03',
      media: [],
      owner: null,
      restricted: false,
      ruleCount: 1,
      source: 'adopted',
    },
    {
      disabled: false,
      href: null,
      id: 'adopted-stylesheet-04',
      media: [],
      owner: null,
      restricted: true,
      ruleCount: null,
      source: 'adopted',
    },
  ];
}

function expectStylesheetManifest(manifest: {
  totalStylesheets: number;
  stylesheets: Array<Record<string, unknown>>;
}) {
  expect(manifest.totalStylesheets).toBe(4);
  expect(manifest.stylesheets).toEqual([
    ...createExpectedDocumentStylesheetMetadata(),
    ...createExpectedAdoptedStylesheetMetadata(),
  ]);
}

function expectNoRawStylesheetText(assets: Array<{ path: string; content: Blob | string }>) {
  const content = assets.map((asset) => String(asset.content)).join('\n');

  expect(content).not.toContain('token=secret');
  expect(content).not.toContain('@import');
  expect(content).not.toContain('background-image');
  expect(content).not.toContain('Access denied');
}

afterEach(() => {
  Reflect.deleteProperty(document, 'adoptedStyleSheets');
  Reflect.deleteProperty(document, 'styleSheets');
  document.head.replaceChildren();
});

it('serializes document and adopted stylesheets with metadata and restriction fallbacks', () => {
  installStylesheetFixture();

  const assets = buildStylesheetDiagnosticAssets();
  const manifest = readStylesheetManifest(assets);

  expect(assets.map((asset) => asset.path)).toEqual(['logs/css/stylesheets.json']);
  expectStylesheetManifest(manifest);
  expectNoRawStylesheetText(assets);
});

it('bounds and sanitizes page-authored stylesheet and iframe metadata', () => {
  const styleOwner = document.createElement('style');
  styleOwner.id = `token=private-${'x'.repeat(5_000)}`;
  styleOwner.setAttribute('data-ui', 'secret=private-value');
  styleOwner.setAttribute('media', 'url("data:text/plain,private-body")');
  Object.defineProperty(document, 'styleSheets', {
    configurable: true,
    value: [createSheet({ media: ['screen and (token=private)'], ownerNode: styleOwner })],
  });

  const content = String(buildStylesheetDiagnosticAssets()[0]?.content);

  expect(content).toContain('token=***');
  expect(content).toContain('secret=***');
  expect(content).toContain('[embedded text/plain]');
  expect(content).not.toContain('private-value');
  expect(content).not.toContain('private-body');
  expect(content.length).toBeLessThan(2_000);
});
