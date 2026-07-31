import {
  PAGE_STYLE_ALLOWED_PROPERTIES,
  type PageStylePatch,
  type PageStyleProperty,
} from '@sniptale/runtime-contracts/page-style';
import type { PageStyleDeclarationValueMap } from '../../../selection/design-review/snapshot';

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
  defaultValues: PageStyleDeclarationValueMap;
  values: PageStyleDeclarationValueMap;
}): PageStylePatch {
  return {
    declarations: listModifiedPageStyleProperties(args).map((property) => ({
      property,
      value: normalizeInspectorValue(args.values[property]) || null,
    })),
  };
}
