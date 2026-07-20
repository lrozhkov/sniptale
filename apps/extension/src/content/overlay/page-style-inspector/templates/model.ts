import {
  PAGE_STYLE_ASSET_KINDS,
  type PageStyleAssetReference,
  type PageStyleDeclaration,
  type PageStyleProperty,
  type PageStyleTemplate,
} from '@sniptale/runtime-contracts/page-style';
import { translate, type TranslationKey } from '../../../../platform/i18n';
import { resolveCssGradient } from '../property-controls/appearance/css-gradient';
import { resolveCssBoxShadow } from '../property-controls/appearance/css-shadow';
import type { PageStyleInspectorViewState } from '../types';

export type Template = PageStyleInspectorViewState['templates'][number];
export type TemplateActionKind = 'apply' | 'delete' | 'duplicate' | 'rename' | 'update';
type TemplateActionState = 'error' | 'pending' | 'success' | 'warning';
type TemplatePropertyGroupKey = 'appearance' | 'frame' | 'image' | 'text';

export type TemplateActionStatus = {
  kind: TemplateActionKind;
  message: string;
  state: TemplateActionState;
  templateId: string;
};

type TemplatePropertyGroup = {
  items: string[];
  key: TemplatePropertyGroupKey;
  labelKey: TranslationKey;
};

export const TEMPLATE_ACTION_SUCCESS_KEYS: Record<TemplateActionKind, TranslationKey> = {
  apply: 'content.pageStyleInspector.templateApplied',
  delete: 'content.pageStyleInspector.templateDeleted',
  duplicate: 'content.pageStyleInspector.templateDuplicated',
  rename: 'content.pageStyleInspector.templateRenamed',
  update: 'content.pageStyleInspector.templateUpdated',
};

export function templateMatchesQuery(template: Template, query: string): boolean {
  return [template.name, template.propertySummary.join(' ')]
    .join(' ')
    .toLocaleLowerCase()
    .includes(query);
}

export function hasImageOnlyTemplateContent(template: PageStyleTemplate): boolean {
  return (
    template.patch.assets.some(
      (asset) => asset.kind === PAGE_STYLE_ASSET_KINDS.IMAGE_REPLACEMENT
    ) ||
    template.patch.declarations.some(
      (declaration) =>
        declaration.property === 'object-fit' || declaration.property === 'object-position'
    )
  );
}

export function getTemplateDisabledReason(
  template: PageStyleTemplate,
  selection: PageStyleInspectorViewState['selection']
): string | null {
  if (!selection) {
    return translate('content.pageStyleInspector.disabledWithoutSelection');
  }

  if (hasImageOnlyTemplateContent(template) && selection.kind !== 'image') {
    return translate('content.pageStyleInspector.templateImageOnlyHint');
  }

  return null;
}

export function getTemplateWarningReason(template: PageStyleTemplate): string | null {
  const hasUnsupportedCss = template.patch.declarations.some((declaration) => {
    if (declaration.value === null) {
      return false;
    }

    if (declaration.property === 'background-image') {
      return resolveCssGradient(declaration.value).mode === 'unsupported';
    }

    if (declaration.property === 'box-shadow') {
      return resolveCssBoxShadow(declaration.value).mode === 'unsupported';
    }

    return false;
  });

  return hasUnsupportedCss
    ? translate('content.pageStyleInspector.templateUnsupportedCssHint')
    : null;
}

const TEMPLATE_PROPERTY_GROUPS: Array<{
  key: TemplatePropertyGroupKey;
  labelKey: TranslationKey;
  properties: readonly PageStyleProperty[];
}> = [
  {
    key: 'text',
    labelKey: 'content.pageStyleInspector.sectionText',
    properties: [
      'color',
      'font-family',
      'font-size',
      'font-style',
      'font-weight',
      'letter-spacing',
      'line-height',
      'text-align',
      'text-decoration',
    ],
  },
  {
    key: 'frame',
    labelKey: 'content.pageStyleInspector.sectionFrame',
    properties: [
      'height',
      'margin-bottom',
      'margin-left',
      'margin-right',
      'margin-top',
      'padding-bottom',
      'padding-left',
      'padding-right',
      'padding-top',
      'width',
    ],
  },
  {
    key: 'appearance',
    labelKey: 'content.pageStyleInspector.sectionAppearance',
    properties: [
      'background-color',
      'background-image',
      'border-bottom-color',
      'border-bottom-left-radius',
      'border-bottom-right-radius',
      'border-bottom-style',
      'border-bottom-width',
      'border-left-color',
      'border-left-style',
      'border-left-width',
      'border-right-color',
      'border-right-style',
      'border-right-width',
      'border-top-color',
      'border-top-left-radius',
      'border-top-right-radius',
      'border-top-style',
      'border-top-width',
      'box-shadow',
    ],
  },
  {
    key: 'image',
    labelKey: 'content.pageStyleInspector.sectionImage',
    properties: ['object-fit', 'object-position'],
  },
];

function getTemplatePropertyGroupKey(property: PageStyleProperty): TemplatePropertyGroupKey {
  return (
    TEMPLATE_PROPERTY_GROUPS.find((group) => group.properties.includes(property))?.key ?? 'frame'
  );
}

function formatDeclaration(declaration: PageStyleDeclaration): string {
  return `${declaration.property}: ${
    declaration.value ?? translate('content.pageStyleInspector.templateResetValue')
  }`;
}

function formatAsset(asset: PageStyleAssetReference): string {
  const label =
    asset.kind === PAGE_STYLE_ASSET_KINDS.BACKGROUND_IMAGE
      ? translate('content.pageStyleInspector.templateBackgroundAsset')
      : translate('content.pageStyleInspector.templateImageAsset');
  return [label, asset.filename].filter(Boolean).join(': ');
}

function getTemplateAssetGroupKey(asset: PageStyleAssetReference): TemplatePropertyGroupKey {
  return asset.kind === PAGE_STYLE_ASSET_KINDS.BACKGROUND_IMAGE ? 'appearance' : 'image';
}

export function getTemplatePropertyGroups(template: PageStyleTemplate): TemplatePropertyGroup[] {
  const groupedItems = new Map<TemplatePropertyGroupKey, string[]>();

  for (const declaration of template.patch.declarations) {
    const key = getTemplatePropertyGroupKey(declaration.property);
    groupedItems.set(key, [...(groupedItems.get(key) ?? []), formatDeclaration(declaration)]);
  }

  for (const asset of template.patch.assets) {
    const key = getTemplateAssetGroupKey(asset);
    groupedItems.set(key, [...(groupedItems.get(key) ?? []), formatAsset(asset)]);
  }

  return TEMPLATE_PROPERTY_GROUPS.flatMap((group) => {
    const items = groupedItems.get(group.key) ?? [];
    return items.length > 0 ? [{ items, key: group.key, labelKey: group.labelKey }] : [];
  });
}
