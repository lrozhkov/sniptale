import {
  PAGE_STYLE_ASSET_KINDS,
  type PageStyleDeclaration,
  type PageStylePatch,
  type PageStyleRestoreRule,
} from '@sniptale/runtime-contracts/page-style';
import type { PageStyleAssetResolver } from './assets';
import { findPatchAsset } from './assets';
import type { PageStyleRuntimeDiagnostic } from './diagnostics';
import { createPageStyleRuntimeDiagnostic } from './diagnostics';
import { applyPageStyleMutation } from './mutation';
import type {
  CssDeclarationRequest,
  PageStyleMutationBatch,
  PageStyleMutationElement,
  PageStyleMutationInput,
} from './types';
import { validateCssDeclaration } from './validation';

export interface PageStyleRuleApplyResult {
  applied: boolean;
  diagnostics: PageStyleRuntimeDiagnostic[];
  mutation: PageStyleMutationBatch | null;
  recoveryMutation: PageStyleMutationBatch | null;
}

function appendValidatedDeclaration(args: {
  declarations: CssDeclarationRequest[];
  diagnostics: PageStyleRuntimeDiagnostic[];
  element: PageStyleMutationElement;
  request: CssDeclarationRequest;
  ruleId: string;
}): void {
  const validated = validateCssDeclaration(args.element, args.request);
  if (validated.status === 'invalid') {
    args.diagnostics.push(
      createPageStyleRuntimeDiagnostic('warning', validated.message, args.ruleId)
    );
    return;
  }

  args.declarations.push({
    ...(validated.assetUrl ? { assetUrl: validated.assetUrl } : {}),
    priority: validated.priority,
    property: validated.property,
    source: validated.source,
    value: validated.value,
  });
}

function appendPatchDeclaration(args: {
  declaration: PageStyleDeclaration;
  declarations: CssDeclarationRequest[];
  diagnostics: PageStyleRuntimeDiagnostic[];
  element: PageStyleMutationElement;
  ruleId: string;
}): void {
  appendValidatedDeclaration({
    declarations: args.declarations,
    diagnostics: args.diagnostics,
    element: args.element,
    request: args.declaration,
    ruleId: args.ruleId,
  });
}

async function appendBackgroundDeclaration(args: {
  assetResolver: PageStyleAssetResolver;
  declarations: CssDeclarationRequest[];
  diagnostics: PageStyleRuntimeDiagnostic[];
  element: PageStyleMutationElement;
  patch: PageStylePatch;
  ruleId: string;
}): Promise<void> {
  const backgroundAsset = findPatchAsset(
    args.patch.assets,
    PAGE_STYLE_ASSET_KINDS.BACKGROUND_IMAGE
  );
  if (backgroundAsset) {
    const resolved = await args.assetResolver.resolveAssetUrl(backgroundAsset, args.ruleId);
    args.diagnostics.push(...resolved.diagnostics);
    if (resolved.url) {
      appendValidatedDeclaration({
        declarations: args.declarations,
        diagnostics: args.diagnostics,
        element: args.element,
        request: {
          assetUrl: resolved.url,
          property: 'background-image',
          source: 'resolved-asset',
          value: `url("${resolved.url}")`,
        },
        ruleId: args.ruleId,
      });
    }
    return;
  }

  const declaration = args.patch.declarations.find(
    (entry) => entry.property === 'background-image'
  );
  if (declaration) {
    appendPatchDeclaration({
      declaration,
      declarations: args.declarations,
      diagnostics: args.diagnostics,
      element: args.element,
      ruleId: args.ruleId,
    });
  }
}

async function createImageAttributeMutation(args: {
  assetResolver: PageStyleAssetResolver;
  diagnostics: PageStyleRuntimeDiagnostic[];
  element: PageStyleMutationElement;
  rule: PageStyleRestoreRule;
}): Promise<Partial<Record<'height' | 'src' | 'width', string | null>> | undefined> {
  if (
    args.element.namespaceURI !== 'http://www.w3.org/1999/xhtml' ||
    args.element.localName.toLowerCase() !== 'img'
  ) {
    return undefined;
  }

  const retainedImage = args.rule.contentRetention?.image;
  const imageAsset =
    retainedImage?.enabled === true
      ? retainedImage.asset
      : findPatchAsset(args.rule.patch.assets, PAGE_STYLE_ASSET_KINDS.IMAGE_REPLACEMENT);
  if (!imageAsset) {
    return undefined;
  }

  const resolved = await args.assetResolver.resolveAssetUrl(imageAsset, args.rule.id);
  args.diagnostics.push(...resolved.diagnostics);
  if (!resolved.url) {
    return undefined;
  }

  return {
    src: resolved.url,
    ...(typeof imageAsset.width === 'number' &&
    Number.isFinite(imageAsset.width) &&
    imageAsset.width > 0
      ? { width: String(imageAsset.width) }
      : {}),
    ...(typeof imageAsset.height === 'number' &&
    Number.isFinite(imageAsset.height) &&
    imageAsset.height > 0
      ? { height: String(imageAsset.height) }
      : {}),
  };
}

interface PreparedPageStyleRuleMutation {
  diagnostics: PageStyleRuntimeDiagnostic[];
  input: PageStyleMutationInput;
  ruleId: string;
}

export async function preparePageStyleRuleMutation(args: {
  assetResolver: PageStyleAssetResolver;
  element: PageStyleMutationElement;
  rule: PageStyleRestoreRule;
}): Promise<PreparedPageStyleRuleMutation> {
  const diagnostics: PageStyleRuntimeDiagnostic[] = [];
  const declarations: CssDeclarationRequest[] = [];
  args.rule.patch.declarations.forEach((declaration) => {
    if (declaration.property !== 'background-image') {
      appendPatchDeclaration({
        declaration,
        declarations,
        diagnostics,
        element: args.element,
        ruleId: args.rule.id,
      });
    }
  });
  await appendBackgroundDeclaration({
    assetResolver: args.assetResolver,
    declarations,
    diagnostics,
    element: args.element,
    patch: args.rule.patch,
    ruleId: args.rule.id,
  });

  const attributes = await createImageAttributeMutation({ ...args, diagnostics });
  return {
    diagnostics,
    input: {
      ...(attributes ? { attributes } : {}),
      declarations,
      target: args.element,
      ...(args.rule.contentRetention?.text?.enabled === true
        ? { text: args.rule.contentRetention.text.text }
        : {}),
    },
    ruleId: args.rule.id,
  };
}

export function applyPreparedPageStyleRuleMutation(
  prepared: PreparedPageStyleRuleMutation
): PageStyleRuleApplyResult {
  const diagnostics = [...prepared.diagnostics];
  const result = applyPageStyleMutation(prepared.input);
  if (result.status === 'failed') {
    diagnostics.push(createPageStyleRuntimeDiagnostic('error', result.message, prepared.ruleId));
    return {
      applied: false,
      diagnostics,
      mutation: null,
      recoveryMutation: result.recoveryBatch ?? null,
    };
  }

  return {
    applied: diagnostics.every((diagnostic) => diagnostic.level !== 'error'),
    diagnostics,
    mutation: result.batch,
    recoveryMutation: null,
  };
}

export async function applyPageStyleRule(args: {
  assetResolver: PageStyleAssetResolver;
  element: PageStyleMutationElement;
  rule: PageStyleRestoreRule;
}): Promise<PageStyleRuleApplyResult> {
  const prepared = await preparePageStyleRuleMutation(args);
  return applyPreparedPageStyleRuleMutation(prepared);
}
