import type { CSSProperties } from 'react';
import {
  parseAdmittedCustomCssSections,
  prepareCustomCssResolution,
  resolveRestrictedCssSections,
  validateCssPolicyString,
} from './css-sanitizer/css';
import { canonicalizeSurfaceCss, projectCanonicalSurfaceCss } from './surface-style/surface-css';

const CALLOUT_CSS_TARGETS = ['card', 'title', 'body', 'connector', 'accent'] as const;
const CALLOUT_CSS_GRAMMAR = {
  defaultTarget: 'card',
  maxLength: 8_000,
  targets: CALLOUT_CSS_TARGETS,
} as const;

type CalloutCssTarget = (typeof CALLOUT_CSS_TARGETS)[number];

export type ResolvedCalloutCustomCss = Record<CalloutCssTarget, CSSProperties>;

type CalloutCustomCssValidation = {
  blockedProperties: string[];
  error: 'blocked' | 'syntax' | 'unsafe' | null;
  styles: ResolvedCalloutCustomCss;
};

const EMPTY_STYLES: ResolvedCalloutCustomCss = {
  accent: {},
  body: {},
  card: {},
  connector: {},
  title: {},
};

const DECORATION_PROPERTIES = [
  'background',
  'backgroundColor',
  'backgroundImage',
  'backgroundPosition',
  'backgroundRepeat',
  'backgroundSize',
  'backdropFilter',
  'boxShadow',
  'color',
  'filter',
  'opacity',
  'outlineColor',
  'outlineOffset',
  'outlineStyle',
  'outlineWidth',
  'textShadow',
] as const;

const TEXT_PROPERTIES = [
  ...DECORATION_PROPERTIES,
  'fontFamily',
  'fontStyle',
  'fontWeight',
  'letterSpacing',
  'textAlign',
  'textDecoration',
  'textTransform',
] as const;

const SVG_PROPERTIES = [
  'filter',
  'opacity',
  'stroke',
  'strokeDasharray',
  'strokeLinecap',
  'strokeLinejoin',
] as const;

const ALLOWED_PROPERTIES: Record<CalloutCssTarget, ReadonlySet<string>> = {
  accent: new Set(SVG_PROPERTIES),
  body: new Set(TEXT_PROPERTIES),
  card: new Set(DECORATION_PROPERTIES),
  connector: new Set(SVG_PROPERTIES),
  title: new Set(TEXT_PROPERTIES),
};

function fail(
  error: Exclude<CalloutCustomCssValidation['error'], null>,
  blockedProperties: string[] = []
): CalloutCustomCssValidation {
  return { blockedProperties, error, styles: EMPTY_STYLES };
}

export function validateCalloutCustomCss(
  value: string
): Pick<CalloutCustomCssValidation, 'blockedProperties' | 'error'> {
  const admitted = parseAdmittedCustomCssSections(value, CALLOUT_CSS_GRAMMAR);
  if (admitted.result) return admitted.result;
  const { sections } = admitted;
  const blockedProperties: string[] = [];
  for (const target of CALLOUT_CSS_TARGETS) {
    if (target === 'card') {
      const cardDeclarations = sections.card.join('\n').trim();
      const cardPolicy = validateCssPolicyString(cardDeclarations);
      if (cardPolicy.rawError) return { blockedProperties: [], error: 'syntax' };
      if (cardPolicy.blockedProps.length > 0) {
        blockedProperties.push(...cardPolicy.blockedProps);
        continue;
      }
      if (canonicalizeSurfaceCss(cardDeclarations) === null) {
        return { blockedProperties: [], error: 'syntax' };
      }
      continue;
    }
    const validation = validateCssPolicyString(sections[target].join('\n').trim());
    if (validation.rawError) return { blockedProperties: [], error: 'syntax' };
    blockedProperties.push(...validation.blockedProps);
    const blockedCanonical = validation.blockedProps.map((property) =>
      property.replace(/-([a-z])/gu, (_match, letter: string) => letter.toUpperCase())
    );
    const unknownProperties = validation.properties.filter(
      (property) =>
        !ALLOWED_PROPERTIES[target].has(property) && !blockedCanonical.includes(property)
    );
    if (unknownProperties.length > 0) return { blockedProperties: [], error: 'syntax' };
  }
  return blockedProperties.length > 0
    ? { blockedProperties: [...new Set(blockedProperties)], error: 'blocked' }
    : { blockedProperties: [], error: null };
}

export function resolveCalloutCustomCss(value: string): CalloutCustomCssValidation {
  const policy = validateCalloutCustomCss(value);
  const prepared = prepareCustomCssResolution(value, policy.error, CALLOUT_CSS_GRAMMAR);
  if (prepared.error) return fail(prepared.error, policy.blockedProperties);
  if (prepared.empty) return { blockedProperties: [], error: null, styles: EMPTY_STYLES };
  const { sections } = prepared;

  const styles = { ...EMPTY_STYLES };
  const cardDeclarations = sections.card.join('\n').trim();
  if (cardDeclarations) {
    const projected = projectCanonicalSurfaceCss(cardDeclarations);
    if (!projected) return fail('syntax');
    styles.card = projected;
  }
  const targets = CALLOUT_CSS_TARGETS.filter((target) => target !== 'card');
  const resolved = resolveRestrictedCssSections({
    allowedProperties: ALLOWED_PROPERTIES,
    sections,
    targets,
  });
  if (resolved.error) return fail(resolved.error, resolved.blockedProps);
  Object.assign(styles, resolved.styles);
  return { blockedProperties: [], error: null, styles };
}

export function projectCalloutLineCustomCss(style: CSSProperties): {
  group: CSSProperties;
  line: CSSProperties;
} {
  const group: CSSProperties = {};
  const line: CSSProperties = {};
  if (style.filter !== undefined) group.filter = style.filter;
  if (style.opacity !== undefined) group.opacity = style.opacity;
  if (style.stroke !== undefined) line.stroke = style.stroke;
  if (style.strokeDasharray !== undefined) line.strokeDasharray = style.strokeDasharray;
  if (style.strokeLinecap !== undefined) line.strokeLinecap = style.strokeLinecap;
  if (style.strokeLinejoin !== undefined) line.strokeLinejoin = style.strokeLinejoin;
  return { group, line };
}
