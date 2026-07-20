// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { PAGE_STYLE_ASSET_KINDS } from '@sniptale/runtime-contracts/page-style';
import type { PageStyleSelectionSnapshot } from '../runtime/properties';
import {
  getTemplateDisabledReason,
  getTemplatePropertyGroups,
  getTemplateWarningReason,
  hasImageOnlyTemplateContent,
  templateMatchesQuery,
  type Template,
} from './model';

function createTemplate(overrides: Partial<Template> = {}): Template {
  return {
    createdAt: 1,
    id: 'template-1',
    name: 'Hero Image',
    patch: { assets: [], declarations: [{ property: 'color', value: '#111111' }] },
    propertySummary: ['color'],
    updatedAt: 1,
    ...overrides,
  };
}

function createSelection(kind: PageStyleSelectionSnapshot['kind']): PageStyleSelectionSnapshot {
  return {
    domPath: '#target',
    element: document.createElement(kind === 'image' ? 'img' : 'div'),
    kind,
    patch: { assets: [], declarations: [] },
    selector: { locator: '#target' },
    selectorLabel: '#target',
    tagName: kind === 'image' ? 'img' : 'div',
    textPreview: '',
  };
}

function createGroupedTemplate(): Template {
  return createTemplate({
    patch: {
      assets: [
        {
          assetId: 'asset-bg',
          filename: 'background.png',
          kind: PAGE_STYLE_ASSET_KINDS.BACKGROUND_IMAGE,
        },
        {
          assetId: 'asset-image',
          filename: 'hero.png',
          kind: PAGE_STYLE_ASSET_KINDS.IMAGE_REPLACEMENT,
        },
      ],
      declarations: [
        { property: 'color', value: '#111111' },
        { property: 'margin-top', value: '12px' },
        { property: 'background-color', value: '#ffffff' },
        { property: 'object-fit', value: 'cover' },
      ],
    },
  });
}

function getExpectedTemplatePropertyGroups() {
  return [
    {
      items: ['color: #111111'],
      key: 'text',
      labelKey: 'content.pageStyleInspector.sectionText',
    },
    {
      items: ['margin-top: 12px'],
      key: 'frame',
      labelKey: 'content.pageStyleInspector.sectionFrame',
    },
    {
      items: ['background-color: #ffffff', 'Файл фона: background.png'],
      key: 'appearance',
      labelKey: 'content.pageStyleInspector.sectionAppearance',
    },
    {
      items: ['object-fit: cover', 'Файл изображения: hero.png'],
      key: 'image',
      labelKey: 'content.pageStyleInspector.sectionImage',
    },
  ];
}

describe('template model helpers', () => {
  registerTemplateSearchTests();
  registerImageOnlyTemplateTests();
  registerTemplatePropertyGroupTests();
  registerTemplateWarningTests();
});

function registerTemplateSearchTests() {
  it('matches templates by name and summarized properties', () => {
    const template = createTemplate();

    expect(templateMatchesQuery(template, 'hero')).toBe(true);
    expect(templateMatchesQuery(template, 'color')).toBe(true);
    expect(templateMatchesQuery(template, 'missing')).toBe(false);
  });
}

function registerImageOnlyTemplateTests() {
  it('marks image replacement templates as image-only', () => {
    const template = createTemplate({
      patch: {
        assets: [
          {
            assetId: 'asset-1',
            kind: PAGE_STYLE_ASSET_KINDS.IMAGE_REPLACEMENT,
          },
        ],
        declarations: [],
      },
    });

    expect(hasImageOnlyTemplateContent(template)).toBe(true);
    expect(getTemplateDisabledReason(template, createSelection('text'))).toBe(
      'Нужен выбранный блок изображения'
    );
    expect(getTemplateDisabledReason(template, createSelection('image'))).toBeNull();
  });
}

function registerTemplatePropertyGroupTests() {
  it('groups template declarations and assets by property category', () => {
    expect(getTemplatePropertyGroups(createGroupedTemplate())).toEqual(
      getExpectedTemplatePropertyGroups()
    );
  });
}

function registerTemplateWarningTests() {
  it('warns when templates contain unsupported structured CSS values', () => {
    expect(
      getTemplateWarningReason(
        createTemplate({
          patch: {
            assets: [],
            declarations: [{ property: 'background-image', value: 'radial-gradient(red, blue)' }],
          },
        })
      )
    ).toBe('Есть CSS-значения, которые будут применены как есть');
    expect(
      getTemplateWarningReason(
        createTemplate({
          patch: {
            assets: [],
            declarations: [{ property: 'box-shadow', value: '0 8px 18px 0 #000000' }],
          },
        })
      )
    ).toBeNull();
  });
}
