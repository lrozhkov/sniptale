import {
  isPageStyleProperty,
  PAGE_STYLE_ASSET_KINDS,
  type PageStyleDeclaration,
  type PageStylePatch,
  type PageStyleRestoreRule,
} from '@sniptale/runtime-contracts/page-style';
import { containsUnsafeCssSyntax } from '../../../../features/web-snapshot/public';
import type { PageStyleAssetResolver } from './assets';
import { findPatchAsset } from './assets';
import type { PageStyleRuntimeDiagnostic } from './diagnostics';
import { createPageStyleRuntimeDiagnostic } from './diagnostics';

interface PageStyleRuleApplyResult {
  diagnostics: PageStyleRuntimeDiagnostic[];
  applied: boolean;
}

type StyleApplyContext = {
  assetResolver: PageStyleAssetResolver;
  diagnostics: PageStyleRuntimeDiagnostic[];
  element: HTMLElement;
  patch: PageStylePatch;
  ruleId: string;
};

function isBlockedStyleValue(property: string, value: string): boolean {
  return containsUnsafeCssSyntax(`${property}: ${value};`);
}

function applyStyleDeclaration(
  element: HTMLElement,
  declaration: PageStyleDeclaration,
  diagnostics: PageStyleRuntimeDiagnostic[],
  ruleId: string
): void {
  if (!isPageStyleProperty(declaration.property)) {
    diagnostics.push(
      createPageStyleRuntimeDiagnostic(
        'warning',
        'Rejected unsupported page style property',
        ruleId
      )
    );
    return;
  }

  if (declaration.value === null) {
    element.style.removeProperty(declaration.property);
    return;
  }

  if (isBlockedStyleValue(declaration.property, declaration.value)) {
    diagnostics.push(
      createPageStyleRuntimeDiagnostic('warning', 'Rejected unsafe page style value', ruleId)
    );
    return;
  }

  element.style.setProperty(declaration.property, declaration.value);
}

async function applyBackgroundImageAsset(context: StyleApplyContext): Promise<void> {
  const backgroundAsset = findPatchAsset(
    context.patch.assets,
    PAGE_STYLE_ASSET_KINDS.BACKGROUND_IMAGE
  );
  if (!backgroundAsset) {
    return;
  }

  const resolved = await context.assetResolver.resolveAssetUrl(backgroundAsset, context.ruleId);
  context.diagnostics.push(...resolved.diagnostics);
  if (resolved.url) {
    context.element.style.setProperty('background-image', `url("${resolved.url}")`);
  }
}

function applyImageSafeAttributes(
  element: HTMLImageElement,
  asset: { height?: number | null; width?: number | null }
): void {
  if (typeof asset.width === 'number' && Number.isFinite(asset.width) && asset.width > 0) {
    element.setAttribute('width', String(asset.width));
  }

  if (typeof asset.height === 'number' && Number.isFinite(asset.height) && asset.height > 0) {
    element.setAttribute('height', String(asset.height));
  }
}

async function applyImageReplacement(context: {
  assetResolver: PageStyleAssetResolver;
  diagnostics: PageStyleRuntimeDiagnostic[];
  element: HTMLElement;
  rule: PageStyleRestoreRule;
}): Promise<void> {
  if (!(context.element instanceof HTMLImageElement)) {
    return;
  }

  const retainedImage = context.rule.contentRetention?.image;
  const imageAsset =
    retainedImage?.enabled === true
      ? retainedImage.asset
      : findPatchAsset(context.rule.patch.assets, PAGE_STYLE_ASSET_KINDS.IMAGE_REPLACEMENT);
  if (!imageAsset) {
    return;
  }

  const resolved = await context.assetResolver.resolveAssetUrl(imageAsset, context.rule.id);
  context.diagnostics.push(...resolved.diagnostics);
  if (!resolved.url) {
    return;
  }

  if (context.element.getAttribute('src') !== resolved.url) {
    context.element.setAttribute('src', resolved.url);
  }
  applyImageSafeAttributes(context.element, imageAsset);
}

function applyTextRetention(rule: PageStyleRestoreRule, element: HTMLElement): void {
  const retainedText = rule.contentRetention?.text;
  if (retainedText?.enabled === true && element.textContent !== retainedText.text) {
    element.textContent = retainedText.text;
  }
}

async function applyPatchStyles(context: StyleApplyContext): Promise<void> {
  for (const declaration of context.patch.declarations) {
    if (declaration.property === 'background-image') {
      continue;
    }

    applyStyleDeclaration(context.element, declaration, context.diagnostics, context.ruleId);
  }

  await applyBackgroundImageAsset(context);

  const backgroundDeclaration = context.patch.declarations.find(
    (declaration) => declaration.property === 'background-image'
  );
  if (
    !findPatchAsset(context.patch.assets, PAGE_STYLE_ASSET_KINDS.BACKGROUND_IMAGE) &&
    backgroundDeclaration
  ) {
    applyStyleDeclaration(
      context.element,
      backgroundDeclaration,
      context.diagnostics,
      context.ruleId
    );
  }
}

export async function applyPageStyleRule(args: {
  assetResolver: PageStyleAssetResolver;
  element: HTMLElement;
  rule: PageStyleRestoreRule;
}): Promise<PageStyleRuleApplyResult> {
  const diagnostics: PageStyleRuntimeDiagnostic[] = [];

  await applyPatchStyles({
    assetResolver: args.assetResolver,
    diagnostics,
    element: args.element,
    patch: args.rule.patch,
    ruleId: args.rule.id,
  });
  applyTextRetention(args.rule, args.element);
  await applyImageReplacement({
    assetResolver: args.assetResolver,
    diagnostics,
    element: args.element,
    rule: args.rule,
  });

  return {
    applied: diagnostics.every((diagnostic) => diagnostic.level !== 'error'),
    diagnostics,
  };
}
