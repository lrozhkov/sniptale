import {
  PAGE_STYLE_ASSET_KINDS,
  type PageStylePatch,
  type PageStyleRestoreRule,
} from '@sniptale/runtime-contracts/page-style';
import { translate } from '../../../../platform/i18n';
import type { PageStyleSelectionSnapshot } from '../runtime/properties';

export function createDefaultTemplateName(): string {
  return `${translate('content.pageStyleInspector.defaultTemplateName')} ${Date.now()}`;
}

export function createDefaultRuleName(selection: PageStyleSelectionSnapshot | null): string {
  return selection
    ? `${translate('content.pageStyleInspector.defaultRuleName')} ${selection.tagName}`
    : '';
}

export function createRuleContentRetention(args: {
  patch: PageStylePatch;
  retainImage: boolean;
  retainText: boolean;
  selection: PageStyleSelectionSnapshot;
}): PageStyleRestoreRule['contentRetention'] {
  const retainedImage = args.patch.assets.find(
    (asset) => asset.kind === PAGE_STYLE_ASSET_KINDS.IMAGE_REPLACEMENT
  );

  return {
    ...(args.retainText && args.selection.element.textContent
      ? { text: { enabled: true as const, text: args.selection.element.textContent } }
      : {}),
    ...(args.retainImage && retainedImage
      ? { image: { asset: retainedImage, enabled: true as const } }
      : {}),
  };
}
