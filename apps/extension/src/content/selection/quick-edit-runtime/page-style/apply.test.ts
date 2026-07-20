// @vitest-environment jsdom

import { expect, it, vi } from 'vitest';
import {
  PAGE_STYLE_ASSET_KINDS,
  type PageStyleRestoreRule,
} from '@sniptale/runtime-contracts/page-style';
import type { PageStyleAssetResolver } from './assets';
import type { PageStyleRuntimeDiagnostic } from './diagnostics';
import { applyPageStyleRule } from './apply';

function createRule(overrides: Partial<PageStyleRestoreRule> = {}): PageStyleRestoreRule {
  return {
    createdAt: 1,
    enabled: true,
    id: 'rule-1',
    name: 'Rule',
    patch: { assets: [], declarations: [] },
    propertySummary: [],
    scope: { active: 'exactAddress', exactAddress: 'https://example.test/page' },
    selector: { locator: '#target' },
    updatedAt: 1,
    ...overrides,
  };
}

function createAssetResolver(url: string | null): PageStyleAssetResolver {
  return {
    dispose: vi.fn(),
    resolveAssetUrl: vi.fn(async () => ({
      diagnostics: url
        ? []
        : ([
            { level: 'warning', message: 'missing asset', ruleId: 'rule-1' },
          ] satisfies PageStyleRuntimeDiagnostic[]),
      url,
    })),
  };
}

it('applies allowlisted declarations and rejects unsupported style properties', async () => {
  const element = document.createElement('div');
  const rule = createRule({
    patch: {
      assets: [],
      declarations: [
        { property: 'color', value: 'rgb(255, 0, 0)' },
        { property: 'font-size', value: '18px' },
        { property: 'height', value: '10px' },
      ],
    },
  });
  Object.assign(rule.patch.declarations[2]!, { property: 'position', value: 'fixed' });

  const result = await applyPageStyleRule({
    assetResolver: createAssetResolver(null),
    element,
    rule,
  });

  expect(element.style.color).toBe('rgb(255, 0, 0)');
  expect(element.style.fontSize).toBe('18px');
  expect(element.style.position).toBe('');
  expect(result.diagnostics).toContainEqual({
    level: 'warning',
    message: 'Rejected unsupported page style property',
    ruleId: 'rule-1',
  });
});

it('rejects raw URL style payloads and only restores text when explicitly retained', async () => {
  const element = document.createElement('div');
  element.textContent = 'Current text';

  await applyPageStyleRule({
    assetResolver: createAssetResolver(null),
    element,
    rule: createRule({
      patch: {
        assets: [],
        declarations: [{ property: 'background-image', value: 'url(javascript:alert(1))' }],
      },
    }),
  });
  expect(element.style.backgroundImage).toBe('');
  expect(element.textContent).toBe('Current text');

  await applyPageStyleRule({
    assetResolver: createAssetResolver(null),
    element,
    rule: createRule({
      contentRetention: { text: { enabled: true, text: 'Restored text' } },
    }),
  });
  expect(element.textContent).toBe('Restored text');
});

it('rejects obfuscated CSS fetch and protocol payloads', async () => {
  const element = document.createElement('div');
  const result = await applyPageStyleRule({
    assetResolver: createAssetResolver(null),
    element,
    rule: createRule({
      patch: {
        assets: [],
        declarations: [
          { property: 'background-image', value: 'u\\72l("https://tracker.test/pixel.png")' },
          { property: 'color', value: '\\6a avascript:alert(1)' },
          { property: 'border-top-color', value: 'da\\74 a:text/html;base64,abc' },
          { property: 'font-size', value: 'expression(alert(1))' },
        ],
      },
    }),
  });

  expect(element.getAttribute('style')).toBeNull();
  expect(result.diagnostics).toEqual([
    { level: 'warning', message: 'Rejected unsafe page style value', ruleId: 'rule-1' },
    { level: 'warning', message: 'Rejected unsafe page style value', ruleId: 'rule-1' },
    { level: 'warning', message: 'Rejected unsafe page style value', ruleId: 'rule-1' },
    { level: 'warning', message: 'Rejected unsafe page style value', ruleId: 'rule-1' },
  ]);
});

it('applies safe gradient background-image declarations without asset references', async () => {
  const element = document.createElement('div');

  await applyPageStyleRule({
    assetResolver: createAssetResolver(null),
    element,
    rule: createRule({
      patch: {
        assets: [],
        declarations: [
          {
            property: 'background-image',
            value: 'linear-gradient(135deg, #111111, #eeeeee)',
          },
        ],
      },
    }),
  });

  expect(element.style.backgroundImage).toContain('linear-gradient');
});

it('restores background and image assets through object URL references', async () => {
  const element = document.createElement('div');
  const image = document.createElement('img');
  const assetResolver = createAssetResolver('blob:https://example.test/asset-1');

  await applyPageStyleRule({
    assetResolver,
    element,
    rule: createRule({
      patch: {
        assets: [{ assetId: 'asset-1', kind: PAGE_STYLE_ASSET_KINDS.BACKGROUND_IMAGE }],
        declarations: [{ property: 'background-color', value: '#fff' }],
      },
    }),
  });
  expect(element.style.backgroundImage).toContain('blob:https://example.test/asset-1');

  await applyPageStyleRule({
    assetResolver,
    element: image,
    rule: createRule({
      contentRetention: {
        image: {
          asset: {
            assetId: 'asset-2',
            height: 48,
            kind: PAGE_STYLE_ASSET_KINDS.IMAGE_REPLACEMENT,
            width: 64,
          },
          enabled: true,
        },
      },
    }),
  });
  expect(image.getAttribute('src')).toBe('blob:https://example.test/asset-1');
  expect(image.getAttribute('width')).toBe('64');
  expect(image.getAttribute('height')).toBe('48');
});

it('reports missing image assets without crashing or clearing existing src', async () => {
  const image = document.createElement('img');
  image.setAttribute('src', 'https://example.test/original.png');

  const result = await applyPageStyleRule({
    assetResolver: createAssetResolver(null),
    element: image,
    rule: createRule({
      patch: {
        assets: [{ assetId: 'missing', kind: PAGE_STYLE_ASSET_KINDS.IMAGE_REPLACEMENT }],
        declarations: [],
      },
    }),
  });

  expect(image.getAttribute('src')).toBe('https://example.test/original.png');
  expect(result.diagnostics).toEqual([
    { level: 'warning', message: 'missing asset', ruleId: 'rule-1' },
  ]);
});
