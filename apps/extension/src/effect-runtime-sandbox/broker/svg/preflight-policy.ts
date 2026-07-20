// policyStateIds: [] - SVG limits and allowlists are immutable parser policy, not authority state.
export const SVG_LIMITS = {
  maxAttributesPerNode: 64,
  maxCommentCharacters: 16_384,
  maxDepth: 64,
  maxNodes: 4_096,
  maxNumericAttributeCharacters: 128,
  maxPaintOrIdCharacters: 512,
  maxPathDataCharacters: 1_500_000,
  maxSourceCharacters: 1_500_000,
  maxStyleKeywordCharacters: 32,
  maxViewBoxCharacters: 256,
} as const;

export const ALLOWED_SVG_ATTRIBUTES = new Map<string, ReadonlySet<string>>([
  ['svg', new Set(['height', 'viewBox', 'width', 'xmlns'])],
  ['g', new Set()],
  ['path', new Set(['d'])],
  ['rect', new Set(['height', 'rx', 'width', 'x', 'y'])],
  // The locked SDK runtime accepts circles as inert, non-rendering nodes.
  ['circle', new Set(['cx', 'cy', 'r'])],
  ['defs', new Set()],
  ['clippath', new Set()],
]);

export const COMMON_SVG_ATTRIBUTES = new Set([
  'fill',
  'fill-opacity',
  'id',
  'opacity',
  'stroke',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-opacity',
  'stroke-width',
]);

export const SVG_NAME = /^[A-Za-z][A-Za-z0-9-]*$/;

export function getSvgAttributeCharacterLimit(name: string): number {
  if (name === 'd') return SVG_LIMITS.maxPathDataCharacters;
  if (name === 'viewBox') return SVG_LIMITS.maxViewBoxCharacters;
  if (name === 'stroke-linecap' || name === 'stroke-linejoin') {
    return SVG_LIMITS.maxStyleKeywordCharacters;
  }
  if (name === 'id' || name === 'fill' || name === 'stroke') {
    return SVG_LIMITS.maxPaintOrIdCharacters;
  }
  if (name === 'xmlns') return 64;
  return SVG_LIMITS.maxNumericAttributeCharacters;
}
