function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isOptionalRecord(value: unknown): value is Record<string, unknown> | undefined {
  return value === undefined || isRecord(value);
}

function isSafeFrameCss(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 20_000) return false;
  const validation = validateCssPolicyString(value);
  return (
    !validation.rawError &&
    validation.blockedProps.length === 0 &&
    validation.properties.every((property) => !isReservedFrameCssProperty(property))
  );
}

function isOneOf(value: unknown, allowed: readonly string[]): value is string {
  return typeof value === 'string' && allowed.includes(value);
}

function isOptionalOneOf(value: unknown, allowed: readonly string[]): boolean {
  return value === undefined || isOneOf(value, allowed);
}

function isOptionalString(value: unknown, maxLength: number): boolean {
  return value === undefined || (typeof value === 'string' && value.length <= maxLength);
}

function isOptionalFinite(value: unknown): boolean {
  return value === undefined || isFiniteNumber(value);
}

const SAFE_COLOR_PATTERN =
  /^(?:transparent|#[0-9a-f]{3,4}|#[0-9a-f]{6}|#[0-9a-f]{8}|(?:rgb|rgba|hsl|hsla)\([0-9.,%+\-/\s]+\))$/iu;

function isSafeCssColor(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 128 &&
    value.trim() === value &&
    !containsUnsafeCssSyntax(value) &&
    SAFE_COLOR_PATTERN.test(value)
  );
}

function hasSafeColorFields(value: Record<string, unknown>, fields: readonly string[]): boolean {
  return fields.every((field) => isSafeCssColor(value[field]));
}

export function isBorderSettings(value: unknown): boolean {
  if (!isOptionalRecord(value) || value === undefined) return value === undefined;
  const padding = value['padding'];
  const effects = value['effects'];
  return (
    ['width', 'radius', 'opacity', 'strokeOpacity', 'fillOpacity', 'shadow'].every((key) =>
      isFiniteNumber(value[key])
    ) &&
    hasSafeColorFields(value, ['color', 'fillColor']) &&
    isOneOf(value['style'], ['solid', 'dashed', 'dotted']) &&
    isRecord(padding) &&
    ['top', 'right', 'bottom', 'left'].every((key) => isFiniteNumber(padding[key])) &&
    isSafeFrameCss(value['customCss']) &&
    typeof value['inheritCustomCss'] === 'boolean' &&
    (effects === undefined ||
      (isRecord(effects) &&
        isRecord(effects['blur']) &&
        isRecord(effects['focus']) &&
        isFiniteNumber(effects['blur']['amount']) &&
        isOneOf(effects['blur']['blurType'], ['gaussian', 'distortion', 'pixelate', 'solid']) &&
        isFiniteNumber(effects['focus']['opacity']))) &&
    isOptionalString(value['sourcePresetId'], 256) &&
    isOptionalString(value['sourcePresetName'], 1_000)
  );
}

export function isBlurSettings(value: unknown): boolean {
  if (!isOptionalRecord(value) || value === undefined) return value === undefined;
  return (
    isFiniteNumber(value['amount']) &&
    isOneOf(value['blurType'], ['gaussian', 'pixelate', 'distortion', 'solid']) &&
    (value['showBorder'] === undefined || typeof value['showBorder'] === 'boolean') &&
    isOptionalFinite(value['radius']) &&
    isOptionalFinite(value['shadow']) &&
    isOptionalFinite(value['strokeOpacity']) &&
    isOptionalFinite(value['strokeWidth']) &&
    (value['strokeColor'] === undefined || isSafeCssColor(value['strokeColor'])) &&
    (value['borderPresetId'] === undefined ||
      value['borderPresetId'] === null ||
      isOptionalString(value['borderPresetId'], 256)) &&
    isOptionalOneOf(value['strokeStyle'], [
      'solid',
      'dashed',
      'dotted',
      'dash',
      'dot',
      'dash-dot',
      'long-dash',
    ])
  );
}

export function isFocusSettings(value: unknown): boolean {
  if (!isOptionalRecord(value) || value === undefined) return value === undefined;
  return (
    isFiniteNumber(value['opacity']) &&
    value['opacity'] >= 0 &&
    value['opacity'] <= 1 &&
    (value['showBorder'] === undefined || typeof value['showBorder'] === 'boolean')
  );
}

const FRAME_ANCHORS = [
  'top-left',
  'top-center',
  'top-right',
  'middle-left',
  'center',
  'middle-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
] as const;

function isOptionalStringArray(value: unknown, allowed: readonly string[]): boolean {
  return (
    value === undefined ||
    (Array.isArray(value) &&
      value.length <= allowed.length &&
      value.every((entry) => isOneOf(entry, allowed)))
  );
}

function isOptionalStepBadgePlacement(value: unknown): boolean {
  return (
    value === undefined ||
    (isRecord(value) &&
      isOneOf(value['side'], ['top', 'right', 'bottom', 'left']) &&
      isFiniteNumber(value['position']) &&
      value['position'] >= 0 &&
      value['position'] <= 1)
  );
}

function isStepBadgeStyle(value: unknown): boolean {
  return (
    isRecord(value) &&
    isOneOf(value['sizeSource'], ['frame-border', 'custom']) &&
    isFiniteNumber(value['diameter']) &&
    value['diameter'] > 0 &&
    value['diameter'] <= 1_000 &&
    isOneOf(value['backgroundColorSource'], ['custom', 'frame-border', 'frame-fill']) &&
    isSafeCssColor(value['backgroundColor']) &&
    isOneOf(value['textColorSource'], ['custom', 'frame-border', 'frame-fill']) &&
    isSafeCssColor(value['textColor']) &&
    isOneOf(value['outlineColorSource'], ['custom', 'frame-border', 'frame-fill', 'surface']) &&
    isSafeCssColor(value['outlineColor']) &&
    (value['customCss'] === undefined ||
      (typeof value['customCss'] === 'string' &&
        validateStepBadgeCustomCss(value['customCss']).error === null))
  );
}

export function isStepBadgeSettings(value: unknown): boolean {
  if (!isOptionalRecord(value) || value === undefined) return value === undefined;
  const style = value['style'];
  return (
    typeof value['enabled'] === 'boolean' &&
    typeof value['value'] === 'string' &&
    value['value'].length <= 1_000 &&
    isOneOf(value['type'], ['number', 'letter', 'manual']) &&
    isOptionalOneOf(value['alphabet'], ['cyrillic', 'latin']) &&
    isOptionalOneOf(value['anchor'], FRAME_ANCHORS) &&
    isOptionalOneOf(value['corner'], ['top-left', 'top-right', 'bottom-left', 'bottom-right']) &&
    isOptionalOneOf(value['size'], ['standard', 'large', 'extra-large']) &&
    (value['sizeLevel'] === undefined ||
      (Number.isInteger(value['sizeLevel']) &&
        Number(value['sizeLevel']) >= 0 &&
        Number(value['sizeLevel']) <= 20)) &&
    (value['auto'] === undefined || typeof value['auto'] === 'boolean') &&
    isOptionalString(value['sourcePresetId'], 256) &&
    isOptionalStringArray(value['offsetDirections'], ['up', 'down', 'left', 'right']) &&
    isOptionalStepBadgePlacement(value['manualPlacement']) &&
    (style === undefined || isStepBadgeStyle(style))
  );
}

function hasFields(
  value: unknown,
  numbers: readonly string[],
  strings: readonly string[] = [],
  booleans: readonly string[] = []
): value is Record<string, unknown> {
  return (
    isRecord(value) &&
    numbers.every((key) => isFiniteNumber(value[key])) &&
    strings.every((key) => typeof value[key] === 'string') &&
    booleans.every((key) => typeof value[key] === 'boolean')
  );
}

function isOptionalPoint(value: unknown, keys: readonly string[]): boolean {
  return value === undefined || hasFields(value, keys);
}

function isOptionalCalloutAttachments(value: unknown): boolean {
  if (value === undefined) return true;
  if (!isRecord(value)) return false;
  return ['frame', 'block'].every((key) => {
    const attachment = value[key];
    return (
      isRecord(attachment) &&
      isOneOf(attachment['mode'], ['auto', 'anchor', 'free']) &&
      isOptionalString(attachment['anchorId'], 256) &&
      isOptionalFinite(attachment['perimeterPosition'])
    );
  });
}

function isCalloutSurface(value: unknown): boolean {
  return (
    hasFields(
      value,
      ['borderWidth', 'paddingX', 'paddingY', 'radius', 'shadow'],
      ['backgroundColor', 'borderColor', 'borderStyle', 'shadowColor', 'textColor']
    ) &&
    hasSafeColorFields(value, ['backgroundColor', 'borderColor', 'shadowColor', 'textColor']) &&
    isOneOf(value['borderStyle'], ['solid', 'dashed', 'dotted'])
  );
}

function isCalloutTypography(value: unknown): boolean {
  return (
    hasFields(
      value,
      ['fontSize', 'maxWidth', 'lineHeight', 'letterSpacing'],
      [
        'fontFamily',
        'fontStyle',
        'fontWeight',
        'direction',
        'hyphens',
        'textAlign',
        'textDecoration',
        'wordBreak',
      ]
    ) &&
    isOneOf(value['fontFamily'], ['sans', 'serif', 'mono', 'cursive']) &&
    isOneOf(value['fontStyle'], ['normal', 'italic']) &&
    isOneOf(value['fontWeight'], ['normal', 'bold']) &&
    isOneOf(value['direction'], ['auto', 'ltr', 'rtl']) &&
    isOneOf(value['hyphens'], ['none', 'auto']) &&
    isOneOf(value['textAlign'], ['left', 'center', 'right', 'justify']) &&
    isOneOf(value['textDecoration'], ['none', 'underline']) &&
    isOneOf(value['wordBreak'], ['normal', 'break-word'])
  );
}

function isCalloutTitle(value: unknown): boolean {
  return (
    hasFields(
      value,
      ['dividerWidth', 'fontSize', 'letterSpacing', 'lineHeight'],
      [
        'backgroundColor',
        'dividerColor',
        'dividerStyle',
        'fontFamily',
        'fontStyle',
        'fontWeight',
        'direction',
        'textAlign',
        'textDecoration',
        'textColor',
      ],
      ['enabled']
    ) &&
    hasSafeColorFields(value, ['backgroundColor', 'dividerColor', 'textColor']) &&
    isOneOf(value['dividerStyle'], ['solid', 'dashed', 'dotted']) &&
    isOneOf(value['fontFamily'], ['sans', 'serif', 'mono', 'cursive']) &&
    isOneOf(value['fontStyle'], ['normal', 'italic']) &&
    isOneOf(value['fontWeight'], ['normal', 'bold']) &&
    isOneOf(value['direction'], ['auto', 'ltr', 'rtl']) &&
    isOneOf(value['textAlign'], ['left', 'center', 'right', 'justify']) &&
    isOneOf(value['textDecoration'], ['none', 'underline'])
  );
}

function isCalloutBadge(value: unknown): boolean {
  return (
    hasFields(
      value,
      ['size', 'borderWidth', 'fontSize'],
      [
        'text',
        'placement',
        'shape',
        'backgroundColor',
        'backgroundColorSource',
        'textColor',
        'textColorSource',
        'borderColor',
        'borderColorSource',
        'fontWeight',
      ],
      ['enabled']
    ) &&
    hasSafeColorFields(value, ['backgroundColor', 'borderColor', 'textColor']) &&
    isOneOf(value['placement'], ['title-start', 'title-end', 'body-start']) &&
    isOneOf(value['shape'], ['circle', 'rounded', 'square']) &&
    ['backgroundColorSource', 'textColorSource', 'borderColorSource'].every((key) =>
      isOneOf(value[key], ['custom', 'frame-border', 'frame-fill', 'accent'])
    ) &&
    isOneOf(value['fontWeight'], ['normal', 'bold'])
  );
}

function isCalloutAccent(value: unknown): boolean {
  return (
    hasFields(value, ['width'], ['color', 'lineStyle', 'side'], ['enabled']) &&
    isSafeCssColor(value['color']) &&
    isOneOf(value['lineStyle'], ['solid', 'dashed', 'dotted']) &&
    isOneOf(value['side'], ['top', 'right', 'bottom', 'left'])
  );
}

function isCalloutColorBindings(value: unknown): boolean {
  return (
    hasFields(value, [], ['accent', 'connector', 'shadow', 'surfaceBackground', 'surfaceBorder']) &&
    ['accent', 'connector', 'surfaceBackground', 'surfaceBorder'].every((key) =>
      isOneOf(value[key], ['custom', 'frame-border', 'frame-fill'])
    ) &&
    isOneOf(value['shadow'], ['custom', 'surface-background', 'surface-border'])
  );
}

function isCalloutConnector(value: unknown): boolean {
  if (
    !hasFields(
      value,
      ['blockMarkerSize', 'frameMarkerSize', 'wedgeSize', 'width'],
      ['blockMarker', 'color', 'frameMarker', 'kind', 'lineStyle', 'routing']
    )
  )
    return false;
  const corner = value['cornerStyle'];
  const curve = value['curve'];
  const spacing = value['spacing'];
  return (
    isSafeCssColor(value['color']) &&
    isOneOf(value['blockMarker'], ['none', 'circle', 'ring-dot', 'square', 'diamond', 'arrow']) &&
    isOneOf(value['frameMarker'], ['none', 'circle', 'ring-dot', 'square', 'diamond', 'arrow']) &&
    isOneOf(value['kind'], ['none', 'wedge', 'line']) &&
    isOneOf(value['lineStyle'], ['solid', 'dashed', 'dotted']) &&
    isOneOf(value['routing'], ['straight', 'elbow', 'polyline', 'curve']) &&
    hasFields(corner, ['radius'], ['kind']) &&
    isOneOf(corner['kind'], ['sharp', 'rounded']) &&
    hasFields(curve, ['curvature'], ['mode']) &&
    isOneOf(curve['mode'], ['auto', 'manual']) &&
    isOptionalPoint(curve['startHandle'], ['x', 'y']) &&
    isOptionalPoint(curve['endHandle'], ['x', 'y']) &&
    hasFields(spacing, ['frameGap', 'blockGap', 'obstacleMargin', 'minimumEndSegment'])
  );
}

export function isCalloutSettings(value: unknown): boolean {
  if (!isOptionalRecord(value) || value === undefined) return value === undefined;
  const content = value['content'];
  const placement = value['placement'];
  const style = value['style'];
  if (
    !(
      typeof value['enabled'] === 'boolean' &&
      isRecord(content) &&
      typeof content['bodyHtml'] === 'string' &&
      content['bodyHtml'].length <= 200_000 &&
      typeof content['titleText'] === 'string' &&
      content['titleText'].length <= 10_000 &&
      isRecord(placement) &&
      isRecord(style) &&
      isOptionalString(value['sourcePresetId'], 256) &&
      isOneOf(placement['anchor'], FRAME_ANCHORS) &&
      isOneOf(placement['side'], ['top', 'bottom', 'left', 'right', 'auto']) &&
      isOptionalPoint(placement['manualPlacement'], ['centerOffsetX', 'centerOffsetY']) &&
      isOptionalFinite(placement['connectorBasePosition']) &&
      isOptionalFinite(placement['connectorBaseWidth']) &&
      isOptionalFinite(placement['connectorFramePosition']) &&
      isOptionalPoint(placement['connectorWaypoint'], ['centerOffsetX', 'centerOffsetY']) &&
      isOptionalCalloutAttachments(placement['connectorAttachments']) &&
      typeof style['customCss'] === 'string' &&
      validateCalloutCustomCss(style['customCss']).error === null
    )
  )
    return false;
  return (
    isCalloutSurface(style['surface']) &&
    isCalloutTypography(style['typography']) &&
    isCalloutTitle(style['title']) &&
    isCalloutBadge(style['badge']) &&
    isCalloutAccent(style['accentEdge']) &&
    isCalloutColorBindings(style['colorBindings']) &&
    isCalloutConnector(style['connector'])
  );
}
import { containsUnsafeCssSyntax } from '@sniptale/platform/security/css-safety';
import { validateCalloutCustomCss } from '../callout-custom-css';
import { validateCssPolicyString } from '../css-sanitizer/css';
import { validateStepBadgeCustomCss } from '../step-badge-custom-css';
import { isReservedFrameCssProperty } from '../style/decoration';
