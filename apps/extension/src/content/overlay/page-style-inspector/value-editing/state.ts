import {
  PAGE_STYLE_ALLOWED_PROPERTIES,
  type PageStylePatch,
  type PageStyleProperty,
} from '@sniptale/runtime-contracts/page-style';
import type { PageStyleDeclarationValueMap } from '../runtime/properties';

export function normalizeInspectorValue(value: string | null | undefined): string {
  return (value ?? '').trim();
}

export function isInspectorValueModified(args: {
  defaultValues: PageStyleDeclarationValueMap;
  property: PageStyleProperty;
  values: PageStyleDeclarationValueMap;
}): boolean {
  return (
    normalizeInspectorValue(args.values[args.property]) !==
    normalizeInspectorValue(args.defaultValues[args.property])
  );
}

export function listModifiedPageStyleProperties(args: {
  defaultValues: PageStyleDeclarationValueMap;
  values: PageStyleDeclarationValueMap;
}): PageStyleProperty[] {
  return PAGE_STYLE_ALLOWED_PROPERTIES.filter((property) =>
    isInspectorValueModified({ ...args, property })
  );
}

export function createManualPageStylePatch(args: {
  assets: PageStylePatch['assets'];
  defaultValues: PageStyleDeclarationValueMap;
  values: PageStyleDeclarationValueMap;
}): PageStylePatch {
  return {
    assets: args.assets,
    declarations: listModifiedPageStyleProperties(args).map((property) => ({
      property,
      value: normalizeInspectorValue(args.values[property]) || null,
    })),
  };
}

export function createComputedPageStylePatch(args: {
  assets: PageStylePatch['assets'];
  values: PageStyleDeclarationValueMap;
}): PageStylePatch {
  return {
    assets: args.assets,
    declarations: PAGE_STYLE_ALLOWED_PROPERTIES.map((property) => ({
      property,
      value: normalizeInspectorValue(args.values[property]) || null,
    })),
  };
}
