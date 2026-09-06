import type { CSSProperties } from 'react';
import { containsUnsafeCssSyntax } from '@sniptale/platform/security/css-safety';
import {
  parseAdmittedCustomCssSections,
  parseCssDeclarations,
  prepareCustomCssResolution,
  resolveRestrictedCssSections,
} from './css-sanitizer/css';

const TARGETS = ['badge', 'text'] as const;
const STEP_BADGE_CSS_GRAMMAR = {
  defaultTarget: 'badge',
  maxLength: 4_000,
  targets: TARGETS,
} as const;
type StepBadgeCssTarget = (typeof TARGETS)[number];

type StepBadgeCustomCssValidation = {
  blockedProperties: string[];
  error: 'blocked' | 'syntax' | 'unsafe' | null;
  styles: Record<StepBadgeCssTarget, CSSProperties>;
};

type StepBadgeCustomCssPolicyValidation = Pick<
  StepBadgeCustomCssValidation,
  'blockedProperties' | 'error'
>;

const EMPTY_STYLES: Record<StepBadgeCssTarget, CSSProperties> = { badge: {}, text: {} };
const ALLOWED_SOURCE_PROPERTIES: Record<StepBadgeCssTarget, ReadonlySet<string>> = {
  badge: new Set([
    'background',
    'background-color',
    'border-color',
    'border-radius',
    'border-style',
    'border-width',
    'box-shadow',
    'color',
    'filter',
    'opacity',
    'outline-color',
    'outline-offset',
    'outline-style',
    'outline-width',
    'text-shadow',
  ]),
  text: new Set([
    'color',
    'filter',
    'font-family',
    'font-style',
    'font-weight',
    'letter-spacing',
    'opacity',
    'text-decoration',
    'text-shadow',
    'text-transform',
  ]),
};

function toCamelStyleProperty(property: string) {
  return property.replace(/-([a-z])/gu, (_match, letter: string) => letter.toUpperCase());
}

const ALLOWED_PROPERTIES: Record<StepBadgeCssTarget, ReadonlySet<string>> = {
  badge: new Set([...ALLOWED_SOURCE_PROPERTIES.badge].map(toCamelStyleProperty)),
  text: new Set([...ALLOWED_SOURCE_PROPERTIES.text].map(toCamelStyleProperty)),
};

function fail(
  error: Exclude<StepBadgeCustomCssValidation['error'], null>,
  blockedProperties: string[] = []
): StepBadgeCustomCssValidation {
  return { blockedProperties, error, styles: EMPTY_STYLES };
}

export function validateStepBadgeCustomCss(value: string): StepBadgeCustomCssPolicyValidation {
  const admitted = parseAdmittedCustomCssSections(value, STEP_BADGE_CSS_GRAMMAR);
  if (admitted.result) return admitted.result;
  const { sections } = admitted;

  const blockedProperties: string[] = [];
  for (const target of TARGETS) {
    const declarations = parseCssDeclarations(sections[target].join('\n'));
    if (!declarations) return { blockedProperties: [], error: 'syntax' };
    for (const { name: property, value: propertyValue } of declarations) {
      if (containsUnsafeCssSyntax(propertyValue)) {
        return { blockedProperties: [], error: 'unsafe' };
      }
      if (!ALLOWED_SOURCE_PROPERTIES[target].has(property)) blockedProperties.push(property);
    }
  }
  return blockedProperties.length > 0
    ? { blockedProperties: [...new Set(blockedProperties)], error: 'blocked' }
    : { blockedProperties: [], error: null };
}

export function resolveStepBadgeCustomCss(value: string): StepBadgeCustomCssValidation {
  const policy = validateStepBadgeCustomCss(value);
  const prepared = prepareCustomCssResolution(value, policy.error, STEP_BADGE_CSS_GRAMMAR);
  if (prepared.error) return fail(prepared.error, policy.blockedProperties);
  if (prepared.empty) return { blockedProperties: [], error: null, styles: EMPTY_STYLES };
  const { sections } = prepared;

  const styles = { ...EMPTY_STYLES };
  const resolved = resolveRestrictedCssSections({
    allowedProperties: ALLOWED_PROPERTIES,
    sections,
    targets: TARGETS,
  });
  if (resolved.error) return fail(resolved.error, resolved.blockedProps);
  Object.assign(styles, resolved.styles);
  return { blockedProperties: [], error: null, styles };
}
