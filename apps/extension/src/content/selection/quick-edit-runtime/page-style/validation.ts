import {
  isPageStyleProperty,
  PAGE_STYLE_ALLOWED_PROPERTIES,
  type PageStyleProperty,
} from '@sniptale/runtime-contracts/page-style';
import { PAGE_STYLE_LIMITS } from '@sniptale/runtime-contracts/page-style/limits';
import {
  containsCssFunction,
  containsUnsafeCssSyntax,
} from '@sniptale/platform/security/css-safety';
import type {
  CssDeclarationPolicySource,
  CssDeclarationPriority,
  CssDeclarationRequest,
  CssDeclarationValue,
  PageStyleMutationElement,
} from './types';

type CssDeclarationValidationResult =
  | {
      assetUrl?: string;
      order: number;
      priority: CssDeclarationPriority;
      property: PageStyleProperty;
      source: CssDeclarationPolicySource;
      status: 'valid';
      value: string;
    }
  | { message: string; status: 'invalid' };

const STRING_URL_IMAGE_FUNCTIONS = ['image-set', '-webkit-image-set', 'image'] as const;

function normalizePriority(priority: string | undefined): CssDeclarationPriority | null {
  const normalized = priority?.trim().toLowerCase() ?? '';
  return normalized === '' || normalized === 'important' ? normalized : null;
}

function isResolvedAssetValue(value: string, assetUrl: string | undefined): boolean {
  if (!assetUrl || !assetUrl.startsWith('blob:') || /["'\\\u0000-\u001f]/u.test(assetUrl)) {
    return false;
  }

  return value === `url("${assetUrl}")`;
}

function isValueAllowedByPolicy(args: {
  assetUrl?: string;
  property: PageStyleProperty;
  source: CssDeclarationPolicySource;
  value: string;
}): boolean {
  if (args.value === '') {
    return true;
  }

  if (args.source === 'resolved-asset') {
    if (args.property === 'background-image' && isResolvedAssetValue(args.value, args.assetUrl)) {
      return true;
    }
  }

  return (
    !containsUnsafeCssSyntax(`${args.property}: ${args.value};`) &&
    !containsCssFunction(args.value, 'var') &&
    !STRING_URL_IMAGE_FUNCTIONS.some((functionName) =>
      containsCssFunction(args.value, functionName)
    )
  );
}

function normalizeValueWithCssom(
  element: PageStyleMutationElement,
  property: PageStyleProperty,
  value: string,
  priority: CssDeclarationPriority
): CssDeclarationValue | null {
  if (value === '') {
    return { priority: '', value: '' };
  }

  const probe = element.ownerDocument.createElement('div');
  probe.style.setProperty(property, value, priority);
  const normalizedValue = probe.style.getPropertyValue(property);
  if (normalizedValue === '') {
    return null;
  }

  return {
    priority: probe.style.getPropertyPriority(property) as CssDeclarationPriority,
    value: normalizedValue,
  };
}

/** Canonical declaration policy shared by initial apply, history replay, and annotation publish. */
export function validateCssDeclaration(
  element: PageStyleMutationElement,
  request: CssDeclarationRequest
): CssDeclarationValidationResult {
  if (!isPageStyleProperty(request.property)) {
    return { message: 'Rejected unsupported page style property', status: 'invalid' };
  }

  const priority = normalizePriority(request.priority);
  if (priority === null) {
    return { message: 'Unsupported CSS declaration priority', status: 'invalid' };
  }

  const value = request.value ?? '';
  const source = request.source ?? 'inspector';
  if (
    value.length > PAGE_STYLE_LIMITS.maxCssValueLength ||
    !isValueAllowedByPolicy({
      ...(request.assetUrl ? { assetUrl: request.assetUrl } : {}),
      property: request.property,
      source,
      value,
    })
  ) {
    return { message: 'Rejected unsafe page style value', status: 'invalid' };
  }

  const normalized = normalizeValueWithCssom(element, request.property, value, priority);
  if (!normalized) {
    return { message: 'Rejected invalid page style value', status: 'invalid' };
  }

  return {
    ...(request.assetUrl ? { assetUrl: request.assetUrl } : {}),
    order: PAGE_STYLE_ALLOWED_PROPERTIES.indexOf(request.property) + 1,
    priority: normalized.priority,
    property: request.property,
    source,
    status: 'valid',
    value: normalized.value,
  };
}

export function isCssDeclarationValueAllowed(args: {
  assetUrl?: string;
  element: PageStyleMutationElement;
  property: PageStyleProperty;
  source: CssDeclarationPolicySource;
  value: CssDeclarationValue;
}): boolean {
  const result = validateCssDeclaration(args.element, {
    ...(args.assetUrl ? { assetUrl: args.assetUrl } : {}),
    priority: args.value.priority,
    property: args.property,
    source: args.source,
    value: args.value.value,
  });
  return result.status === 'valid';
}
