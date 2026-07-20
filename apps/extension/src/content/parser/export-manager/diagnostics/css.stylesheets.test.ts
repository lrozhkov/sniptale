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
      media: ['screen'],
      owner: {
        dataUi: 'shell',
        id: 'owner-style',
        media: 'screen',
        rel: null,
        tagName: 'style',
      },
      path: 'logs/css/stylesheets/document-stylesheet-01.css',
      restricted: false,
      ruleCount: 2,
      source: 'document',
    },
    {
      disabled: true,
      href: 'https://cdn.example.test/app.css',
      media: [],
      owner: {
        dataUi: null,
        id: null,
        media: null,
        rel: 'stylesheet',
        tagName: 'link',
      },
      path: 'logs/css/stylesheets/document-stylesheet-02.css',
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
      media: [],
      owner: null,
      path: 'logs/css/stylesheets/adopted-stylesheet-03.css',
      restricted: false,
      ruleCount: 1,
      source: 'adopted',
    },
    {
      disabled: false,
      href: null,
      media: [],
      owner: null,
      path: 'logs/css/stylesheets/adopted-stylesheet-04.css',
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

function expectStylesheetAssets(assets: Array<{ path: string; content: Blob | string }>) {
  expect(assets[1]).toEqual({
    path: 'logs/css/stylesheets/document-stylesheet-01.css',
    content:
      '/* Sniptale stylesheet diagnostic: CSS text redacted. */\n' +
      '/* source=document; restricted=false; ruleCount=2 */',
  });
  expect(assets[2]).toEqual({
    path: 'logs/css/stylesheets/document-stylesheet-02.css',
    content:
      '/* Sniptale stylesheet diagnostic: CSS text redacted. */\n' +
      '/* source=document; restricted=true; ruleCount=unknown */',
  });
  expect(assets[3]).toEqual({
    path: 'logs/css/stylesheets/adopted-stylesheet-03.css',
    content:
      '/* Sniptale stylesheet diagnostic: CSS text redacted. */\n' +
      '/* source=adopted; restricted=false; ruleCount=1 */',
  });
  expect(assets[4]).toEqual({
    path: 'logs/css/stylesheets/adopted-stylesheet-04.css',
    content:
      '/* Sniptale stylesheet diagnostic: CSS text redacted. */\n' +
      '/* source=adopted; restricted=true; ruleCount=unknown */',
  });
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

  expect(assets.map((asset) => asset.path)).toEqual([
    'logs/css/stylesheets.json',
    'logs/css/stylesheets/document-stylesheet-01.css',
    'logs/css/stylesheets/document-stylesheet-02.css',
    'logs/css/stylesheets/adopted-stylesheet-03.css',
    'logs/css/stylesheets/adopted-stylesheet-04.css',
  ]);
  expectStylesheetManifest(manifest);
  expectStylesheetAssets(assets);
  expectNoRawStylesheetText(assets);
});
